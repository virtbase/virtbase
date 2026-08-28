/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * The binaries the video pipeline needs and the machine does not have.
 *
 * ffmpeg and a speech synthesiser are not development dependencies of the app,
 * are not in any package manifest, and are not worth a `sudo apt install` on
 * every machine that ever records an episode. They are fetched once into
 * `.cache/video/tools`, which is gitignored, and reused from there.
 *
 * Everything is pinned. A voice that changes under us would make episode two
 * sound like a different person than episode one, which is exactly the kind of
 * drift a series cannot absorb.
 */
/**
 * A GPL build rather than a plain static one: `libx264`, `libass` for burning
 * the portrait captions, and `h264_nvenc`.
 *
 * Pinned to the 8.1 release branch, and that is not cosmetic. NVENC refuses to
 * start unless the driver offers the API version ffmpeg was built against, and
 * current master wants 13.1 - newer than any driver shipping today - so a
 * "latest" build silently loses hardware encoding and falls back to software
 * without saying why.
 */
const FFMPEG_VERSION = "n8.1-latest-linux64-gpl-8.1";
const FFMPEG_URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-${FFMPEG_VERSION}.tar.xz`;
const FFMPEG_DIR = `ffmpeg-${FFMPEG_VERSION}`;

const PIPER_URL =
  "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz";

const VOICE_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE";

/**
 * The German voices worth using, as `piper` names them.
 *
 * `thorsten-high` is the default: it is the only German voice in the set
 * trained at 22.05 kHz with the high-quality architecture, and a narrator that
 * sounds tired is worse than no narrator at all.
 */
export const VOICES = {
  "thorsten-high": `${VOICE_BASE}/thorsten/high/de_DE-thorsten-high.onnx`,
  "thorsten-medium": `${VOICE_BASE}/thorsten/medium/de_DE-thorsten-medium.onnx`,
  "kerstin-low": `${VOICE_BASE}/kerstin/low/de_DE-kerstin-low.onnx`,
  "ramona-low": `${VOICE_BASE}/ramona/low/de_DE-ramona-low.onnx`,
} as const;

export type VoiceName = keyof typeof VOICES;

export interface Tools {
  ffmpeg: string;
  ffprobe: string;
  /** Whether `h264_nvenc` actually starts on this machine. */
  nvenc: boolean;
  /** `piper` needs its own bundled shared objects on `LD_LIBRARY_PATH`. */
  piper: { bin: string; libs: string };
  voice: { model: string; config: string };
}

/** The monorepo root, five levels up from `apps/web/scripts/video/lib`. */
export const repoRoot = resolve(import.meta.dir, "../../../../..");

const cacheDir = join(repoRoot, ".cache", "video");
const toolsDir = join(cacheDir, "tools");

/** Where a run's frames, narration and finished file are written. */
export const workspaceFor = (name: string) => ({
  frames: join(cacheDir, name, "frames"),
  audio: join(cacheDir, name, "audio"),
  output: join(repoRoot, "videos"),
});

/**
 * Fetches one file.
 *
 * Shells out to `curl` rather than using `fetch`. These are 100MB+ release
 * assets behind a redirect to another host, and bun's fetch was seen stalling
 * indefinitely on exactly that - no bytes, no error, no timeout - where curl
 * pulls the same file in two seconds. curl also follows the redirect, retries a
 * dropped connection and fails loudly on a bad status, none of which is worth
 * reimplementing here.
 */
async function download(url: string, to: string) {
  const curl = Bun.which("curl");

  if (curl) {
    const proc = Bun.spawn(
      [curl, "-fL", "--retry", "3", "--retry-delay", "2", "-o", to, url],
      { stdout: "inherit", stderr: "inherit" },
    );

    if ((await proc.exited) !== 0) throw new Error(`could not download ${url}`);
    return;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${response.statusText}`);
  }

  await Bun.write(to, new Uint8Array(await response.arrayBuffer()));
}

async function extract(archive: string, into: string) {
  const proc = Bun.spawn(["tar", "-xf", archive, "-C", into], {
    stdout: "inherit",
    stderr: "inherit",
  });

  if ((await proc.exited) !== 0) {
    throw new Error(`could not extract ${archive}`);
  }
}

/**
 * Resolves the toolchain, fetching whatever is missing.
 *
 * A system `ffmpeg` wins when there is one - it is almost certainly newer than
 * the pinned static build, and matching the host is worth more here than
 * reproducibility, because the encoder settings are explicit either way.
 */
export async function ensureTools(voice: VoiceName): Promise<Tools> {
  await mkdir(toolsDir, { recursive: true });

  const ffmpegDir = join(toolsDir, FFMPEG_DIR, "bin");

  if (!existsSync(join(ffmpegDir, "ffmpeg"))) {
    const archive = join(toolsDir, "ffmpeg.tar.xz");
    console.log("[tools] fetching ffmpeg");
    await download(FFMPEG_URL, archive);
    await extract(archive, toolsDir);
  }

  const piperDir = join(toolsDir, "piper");

  if (!existsSync(join(piperDir, "piper"))) {
    const archive = join(toolsDir, "piper.tar.gz");
    console.log("[tools] fetching piper");
    await download(PIPER_URL, archive);
    await extract(archive, toolsDir);
  }

  const modelUrl = VOICES[voice];
  const voicesDir = join(toolsDir, "voices");
  const model = join(voicesDir, modelUrl.split("/").pop() as string);

  if (!existsSync(model)) {
    console.log(`[tools] fetching voice ${voice}`);
    await mkdir(voicesDir, { recursive: true });
    await download(modelUrl, model);
    await download(`${modelUrl}.json`, `${model}.json`);
  }

  /*
   * The bundled build wins over a system ffmpeg: the portrait cut burns its
   * captions with `libass`, and a distro ffmpeg may not have it.
   */
  const ffmpeg = join(ffmpegDir, "ffmpeg");

  return {
    ffmpeg,
    ffprobe: join(ffmpegDir, "ffprobe"),
    nvenc: await probeNvenc(ffmpeg),
    piper: { bin: join(piperDir, "piper"), libs: piperDir },
    voice: { model, config: `${model}.json` },
  };
}

/** Where the cloning synthesiser and its weights live. */
export const qwenPaths = {
  venv: join(toolsDir, "qwen-tts-venv"),
  python: join(toolsDir, "qwen-tts-venv", "bin", "python"),
  /** Model weights, kept beside the other fetched tools rather than in `~`. */
  home: join(toolsDir, "hf"),
  script: join(import.meta.dir, "qwen-speak.py"),
};

/**
 * Makes sure the cloning synthesiser can run, building its environment once.
 *
 * The same bargain as ffmpeg and piper above: fetched into `.cache/video/tools`
 * on first use rather than declared as a dependency of the app, because nothing
 * outside this directory has any use for a 1.8 GB virtualenv and five gigabytes
 * of model weights. Deleting that directory undoes all of it.
 *
 * Torch is installed from the CPU index explicitly. Letting `qwen-tts` pull its
 * own would fetch the CUDA build - some two and a half gigabytes of kernels for
 * a card this repository has already established it cannot use, since flash
 * attention wants Ampere and the development machine has Maxwell.
 */
export async function ensureQwen(): Promise<typeof qwenPaths> {
  if (existsSync(qwenPaths.python)) return qwenPaths;

  console.log("[tools] building the qwen-tts environment (a few minutes)");

  const run = async (command: string[]) => {
    const proc = Bun.spawn(command, { stdout: "inherit", stderr: "pipe" });
    const stderr = await new Response(proc.stderr).text();

    if ((await proc.exited) !== 0) {
      throw new Error(
        `could not build the qwen-tts environment: ${stderr.trim()}`,
      );
    }
  };

  await run(["python3", "-m", "venv", qwenPaths.venv]);

  const pip = join(qwenPaths.venv, "bin", "pip");

  await run([pip, "install", "-q", "--upgrade", "pip"]);
  await run([
    pip,
    "install",
    "-q",
    "torch",
    "torchaudio",
    "--index-url",
    "https://download.pytorch.org/whl/cpu",
  ]);
  await run([pip, "install", "-q", "qwen-tts"]);

  console.log("[tools] qwen-tts ready");

  return qwenPaths;
}

/**
 * Whether the GPU will actually take an encode.
 *
 * Asked by encoding two frames rather than by listing encoders. `h264_nvenc`
 * being compiled in says nothing about whether it runs: it fails at open time
 * on a machine with no NVIDIA card, in a container without the device, and on a
 * driver older than the API the build expects. All three mean "no hardware
 * encoding today", and all three should fall back quietly rather than fail a
 * render.
 */
async function probeNvenc(ffmpeg: string): Promise<boolean> {
  const proc = Bun.spawn(
    [
      ffmpeg,
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x240:rate=30",
      "-frames:v",
      "2",
      "-c:v",
      "h264_nvenc",
      "-f",
      "null",
      "-",
    ],
    { stdout: "ignore", stderr: "ignore" },
  );

  return (await proc.exited) === 0;
}
