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

import { mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Tools } from "./tools";
import { repoRoot } from "./tools";
import type { Spoken } from "./voice";

/**
 * Turning a screencast into a file.
 *
 * Chrome's screencast is not a video: it is a burst of JPEGs emitted only when
 * something on the page changed, each carrying the wall-clock time it was
 * painted. Two seconds of a customer reading a dialog produce one frame, not
 * sixty. Rebuilding real time from those stamps - rather than assuming a frame
 * rate - is what keeps the narration lined up with the picture at the end of a
 * two minute take, where a frame-counting approach would have drifted seconds.
 */
export interface Frame {
  file: string;
  /** Seconds since the first frame. */
  at: number;
}

export interface Cue {
  /** Seconds since the first frame. */
  start: number;
  audio: Spoken;
}

export interface RenderOptions {
  tools: Tools;
  frames: Frame[];
  cues: Cue[];
  /** Total length of the take, in seconds. */
  duration: number;
  width: number;
  height: number;
  fps: number;
  output: string;
  /** Encode on the GPU where one is available. Quality costs; see above. */
  gpu?: boolean;
}

/**
 * What the audio track is assembled at.
 *
 * Every input is resampled to this before the concat rather than assumed to
 * match the synthesiser. piper speaks at 22.05 kHz; concatenating streams whose
 * rates differ either fails outright or plays a line at the wrong pitch, and
 * normalising here means the graph does not care what produced the wav.
 */
const SAMPLE_RATE = 48_000;

/**
 * Lays the captured frames onto the output's frame grid.
 *
 * The frames arrive whenever Chrome painted one - around fifty a second,
 * unevenly - and each carries the moment it was painted. Turning that into a
 * constant rate video is a resampling problem, and it is solved here rather
 * than by ffmpeg because ffmpeg's demuxers make it easy to get wrong.
 *
 * [!] The obvious approach - a concat playlist with a `duration` per frame -
 * silently destroys the motion. Images are demuxed at 25 fps unless told
 * otherwise, and a `duration` shorter than that 40ms period is rounded up to
 * it, so a 20ms screencast gap becomes 40ms and the whole timeline collapses to
 * 25 fps. Converted to 30 that repeats every sixth frame: a visible hitch five
 * times a second, for the length of the take.
 *
 * So each output slot picks the frame that was on screen at that instant, and
 * the result is handed to ffmpeg as an ordinary fixed-rate sequence with
 * nothing left to interpret. A slot that repeats the previous frame is the
 * screencast having had nothing new to send, not a resampling artefact.
 */
function resample(frames: Frame[], duration: number, fps: number): string[] {
  const slots = Math.max(1, Math.round(duration * fps));
  const picked: string[] = [];

  let index = 0;

  for (let slot = 0; slot < slots; slot++) {
    const at = slot / fps;

    /* Frames are in order, so the search only ever moves forwards. */
    while (index + 1 < frames.length && (frames[index + 1] as Frame).at <= at) {
      index++;
    }

    picked.push((frames[index] as Frame).file);
  }

  return picked;
}

/**
 * Materialises the resampled sequence as `%06d.jpg` for the image2 demuxer.
 *
 * Symlinks rather than copies: one capture is usually the answer for several
 * consecutive slots, and a two minute take would otherwise write a gigabyte of
 * duplicates.
 */
async function linkSequence(picked: string[], dir: string): Promise<string> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  for (const [slot, file] of picked.entries()) {
    await symlink(file, join(dir, `${String(slot + 1).padStart(6, "0")}.jpg`));
  }

  return join(dir, "%06d.jpg");
}

/**
 * Builds the ffmpeg arguments for one silent-gap-then-line audio track.
 *
 * Silence is generated rather than mixed in: `amix` would need every input
 * padded to the full length and quietly halves the level of anything it
 * overlaps, while a plain concatenation of "gap, line, gap, line" puts each
 * sentence at exactly the offset the recorder measured.
 */
function audioGraph(cues: Cue[], duration: number) {
  const inputs: string[] = [];
  const labels: string[] = [];

  let cursor = 0;
  /* Input 0 is the frame playlist, so audio inputs start at 1. */
  let index = 1;

  const silence = (seconds: number) => {
    if (seconds <= 0.001) return;

    inputs.push(
      "-f",
      "lavfi",
      "-t",
      seconds.toFixed(6),
      "-i",
      `anullsrc=r=${SAMPLE_RATE}:cl=mono`,
    );
    labels.push(`[${index++}:a]`);
  };

  const resampled: string[] = [];

  for (const cue of cues) {
    silence(cue.start - cursor);

    inputs.push("-i", cue.audio.path);
    const source = `[${index++}:a]`;
    const out = `[r${resampled.length}]`;
    resampled.push(
      `${source}aformat=sample_rates=${SAMPLE_RATE}:channel_layouts=mono${out}`,
    );
    labels.push(out);

    cursor = cue.start + cue.audio.duration;
  }

  silence(duration - cursor);

  const filter = [
    ...resampled,
    `${labels.join("")}concat=n=${labels.length}:v=0:a=1[a]`,
  ].join(";");

  return { inputs, filter };
}

/**
 * How the video gets compressed.
 *
 * Software is the default and hardware is opt-in, and since that is the
 * opposite of what "the GPU is faster" suggests, here are the measurements. On
 * a 3113 frame take, same input, same machine:
 *
 *     decode only          7.7s
 *     decode + libx264    12.7s      9.1 MB
 *     decode + nvenc      12.6s     16.9 MB
 *
 * NVENC saves a tenth of a second and costs 86% more file. It is not slow at
 * encoding - it is that encoding was never the bottleneck here. Six of those
 * twelve seconds are spent decoding JPEGs, because the recorder's output is an
 * image sequence rather than a video stream, and hardware encoding does nothing
 * about that half.
 *
 * The quality difference is real too, and was noticed by eye before it was
 * measured: flat dark panels, hairline borders and small text are the worst
 * case for NVENC's bit allocation, and Maxwell-era silicon especially.
 *
 * The flag stays because a machine with a faster decode path, or a much longer
 * take, could tip the other way - but on this pipeline it buys nothing. If the
 * render ever needs to be quicker, the thing to attack is the decode.
 */
export function videoEncoder(tools: Tools, gpu: boolean): string[] {
  if (gpu && tools.nvenc) {
    return [
      "-c:v",
      "h264_nvenc",
      "-preset",
      "p5",
      "-rc",
      "vbr",
      "-cq",
      "19",
      "-b:v",
      "0",
      "-profile:v",
      "high",
      "-bf",
      "2",
      "-spatial-aq",
      "1",
      "-aq-strength",
      "8",
    ];
  }

  return ["-c:v", "libx264", "-preset", "slow", "-crf", "18"];
}

/** Names the encoder that will actually be used, for the log line. */
export const encoderName = (tools: Tools, gpu: boolean): string =>
  gpu && tools.nvenc ? "h264_nvenc (GPU)" : "libx264 (CPU)";

/** Whether a captured frame already matches the delivered size. */
async function isExactSize(
  tools: Tools,
  file: string,
  width: number,
  height: number,
): Promise<boolean> {
  const proc = Bun.spawn(
    [
      tools.ffprobe,
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      file,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;

  return out === `${width},${height}`;
}

export async function render(options: RenderOptions): Promise<string> {
  const { tools, frames, cues, duration, width, height, fps, output } = options;
  const gpu = options.gpu ?? false;

  if (frames.length === 0) throw new Error("no frames were captured");

  const picked = resample(frames, duration, fps);
  const sequence = await linkSequence(
    picked,
    join(dirname(frames[0]?.file as string), "..", "sequence"),
  );
  await mkdir(dirname(output), { recursive: true });

  console.log(
    `[render] ${frames.length} captures -> ${picked.length} frames at ${fps} fps, ${encoderName(tools, gpu)}`,
  );

  const { inputs, filter } = audioGraph(cues, duration);

  /*
   * Scaling is skipped when the frames already are the output size. swscale on
   * a 1:1 frame is not free, and every resample of screen content softens the
   * text it was not asked to touch.
   */
  const [firstFrame] = frames;
  const scale =
    firstFrame && (await isExactSize(tools, firstFrame.file, width, height))
      ? ""
      : `scale=${width}:${height}:flags=lanczos,`;

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-stats",
    "-framerate",
    String(fps),
    "-i",
    sequence,
    ...inputs,
    "-filter_complex",
    [`[0:v]${scale}format=yuv420p[v]`, filter].join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    ...videoEncoder(tools, gpu),
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    output,
  ];

  const proc = Bun.spawn([tools.ffmpeg, ...args], {
    stdout: "inherit",
    stderr: "inherit",
  });

  if ((await proc.exited) !== 0) throw new Error("ffmpeg failed");

  return output;
}

/**
 * Puts the cover on the front of the portrait cut and burns in the captions.
 *
 * The portrait video is filmed at 1080x1920 against the app's own mobile
 * layout, so there is nothing to compose here - no letterboxing, no blurred
 * backdrop, no scaling. An earlier version built this cut by placing the
 * landscape recording inside a 9:16 frame; the result was a phone-shaped video
 * of a desktop screenshot, which is worth less than the space it takes up.
 *
 * The captions matter more here than anywhere: these feeds autoplay muted.
 * They come from the same narration as the `.srt`, so they cannot drift.
 *
 * The cover is prepended as real video rather than attached as metadata,
 * because neither platform accepts a thumbnail upload - both take the opening
 * frame. It is held for a beat so it reads as a title card to a viewer, and is
 * the frame the feed freezes on for everyone who scrolls past.
 */
export async function prependCover({
  tools,
  source,
  cover,
  captions,
  output,
  fps,
  width,
  height,
  gpu = false,
  coverSeconds = 1.2,
}: {
  tools: Tools;
  source: string;
  cover: string;
  /** Path to the `.ass` captions, or null to leave them off. */
  captions: string | null;
  output: string;
  fps: number;
  width: number;
  height: number;
  gpu?: boolean;
  coverSeconds?: number;
}): Promise<string> {
  const caption = captions
    ? `,subtitles=${escapeFilterPath(captions)}:fontsdir=${escapeFilterPath(
        join(repoRoot, ".cache/video/tools/fonts"),
      )}`
    : "";

  const graph = [
    `[1:v]setsar=1,format=yuv420p${caption}[main]`,
    `[0:v]scale=${width}:${height},setsar=1,fps=${fps},format=yuv420p[cover]`,
    "[cover][main]concat=n=2:v=1:a=0[v]",
    "[2:a][1:a]concat=n=2:v=0:a=1[a]",
  ].join(";");

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-stats",
    "-loop",
    "1",
    "-t",
    coverSeconds.toFixed(3),
    "-i",
    cover,
    "-i",
    source,
    /* Silence under the cover, so the narration still starts with the video. */
    "-f",
    "lavfi",
    "-t",
    coverSeconds.toFixed(3),
    "-i",
    `anullsrc=r=${SAMPLE_RATE}:cl=mono`,
    "-filter_complex",
    graph,
    "-map",
    "[v]",
    "-map",
    "[a]",
    ...videoEncoder(tools, gpu),
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    output,
  ];

  console.log(
    `[render] cover + ${width}x${height}, ${encoderName(tools, gpu)}${
      captions ? ", captions burned in" : ""
    }`,
  );

  await mkdir(dirname(output), { recursive: true });

  const proc = Bun.spawn([tools.ffmpeg, ...args], {
    stdout: "inherit",
    stderr: "inherit",
  });

  if ((await proc.exited) !== 0) {
    throw new Error("ffmpeg failed while prepending the cover");
  }

  return output;
}

/**
 * Escapes a path for use inside a filtergraph argument.
 *
 * `subtitles=` is parsed twice - once to split the filter chain, once by the
 * filter itself - so a colon in a path silently becomes an option separator.
 */
const escapeFilterPath = (path: string) =>
  path.replace(/\\/g, "/").replace(/:/g, "\\\\:").replace(/'/g, "\\\\'");
