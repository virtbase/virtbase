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
import { mkdir, rename, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tools, VoiceName } from "./tools";
import { ensureQwen } from "./tools";

/**
 * German narration, synthesised ahead of the recording.
 *
 * The order matters: every line is spoken before the browser opens, because the
 * recorder needs to know how long a beat will talk in order to hold the picture
 * for exactly that long. Synthesising as we record would mean either guessing
 * the duration or stalling the screencast mid-take.
 */
export interface Spoken {
  path: string;
  /** Seconds, as ffprobe reports them. */
  duration: number;
}

/**
 * Which synthesiser speaks the narration.
 *
 * `qwen` clones the narrator from `assets/narrator.wav` and is what the series
 * sounds like. `piper` is the voice that reference was made with, kept because
 * it speaks a four minute episode in seconds where cloning takes half an hour -
 * which is the difference between trying a rewrite and committing to one.
 */
export type VoiceEngine = "piper" | "qwen";

export interface VoiceOptions {
  engine?: VoiceEngine;
  /**
   * Above 1 slows the delivery down. The default voice reads at roughly 185
   * words per minute, which is a newsreader; a tutorial wants nearer 170.
   *
   * piper only - the cloning model takes its pace from the reference clip.
   */
  lengthScale: number;
  /** Seconds of silence piper inserts between sentences. */
  sentenceSilence: number;
  /**
   * How much the generator varies its output. Lower is steadier and flatter,
   * higher is more expressive and less predictable. piper's default is 0.667.
   */
  noiseScale?: number;
  /**
   * How much phoneme *durations* vary. This is the one that reads as natural
   * rhythm rather than as tone: at zero every syllable is metronomic. piper's
   * default is 0.8.
   */
  noiseW?: number;
  /** Which of the pinned voices to speak with. */
  voice?: VoiceName;
}

export const DEFAULT_VOICE_OPTIONS: VoiceOptions = {
  engine: "qwen",
  lengthScale: 1.08,
  sentenceSilence: 0.35,
  /*
   * Below the model's own 0.667 and 0.8.
   *
   * These are the only two knobs that change how the voice *sounds* rather than
   * how fast it talks. `noiseScale` is the variance of the latent the vocoder
   * samples - lower is cleaner and less breathy - and `noiseW` is the variance
   * of the duration predictor, which is what makes an otherwise good line
   * wobble. Taking both down a notch is what a synthetic voice reading
   * documentation wants; taking them much lower starts to read as a robot, so
   * this is deliberately one notch rather than three.
   *
   * It is a judgement call rather than a measurement, and it is one line to
   * put back.
   */
  noiseScale: 0.6,
  noiseW: 0.7,
};

/**
 * What every line is normalised to, in LUFS.
 *
 * piper normalises each line to a *peak* of 0 dBFS, which is not a level: how
 * loud a sentence ends up depends on its single loudest sample, so the
 * narration drifted over a 2 LU range from line to line and every one of them
 * sat hard against full scale with no headroom for the encoder.
 *
 * Measuring loudness and applying one gain per line fixes it. The target sits
 * at the quietest line the voice produces on purpose, so every gain is an
 * attenuation: no line is ever pushed up into clipping, and nothing is
 * compressed or limited to get there.
 *
 * A true-peak ceiling was tried on top and taken out again. Piper's lines have
 * a crest factor of 17 to 20 dB, so a -1 dBTP ceiling binds before the loudness
 * target does on a third of them, and matching levels is the entire point -
 * measured, it traded a 2 LU spread for a 2.2 LU spread and a quieter track.
 * The three lines in sixty-six that keep their 0 dBFS peak keep exactly the
 * peak that every line in every previous episode had.
 */
const LOUDNESS_TARGET = -18;

/**
 * The narrator, and how the cloning model is told who that is.
 *
 * `assets/narrator.wav` is six seconds of the piper voice at the level every
 * line ends up at, and it is the identity of the whole series: change the file
 * and episode two is read by somebody else. It is committed rather than
 * generated for exactly that reason - piper samples, so re-running it would
 * produce a *nearly* identical clip, and "nearly" is how a voice drifts.
 *
 * [!] `NARRATOR_TEXT` must be what the audio actually says. The reference line
 * is one with no entry in the piper table below, so the audio and the
 * transcript agree; a line containing "Virtbase" would hand the model
 * "Wörtbehs" as the truth about the recording.
 */
const NARRATOR_AUDIO = join(import.meta.dir, "..", "assets", "narrator.wav");
const NARRATOR_TEXT =
  "Verwerfen blockiert still: Es geht keine Antwort zurück, " +
  "der Absender läuft in eine Zeitüberschreitung.";

/** The 1.7B clone model. The 0.6B is three times quicker and audibly worse. */
const QWEN_MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-Base";

async function probeDuration(tools: Tools, file: string): Promise<number> {
  const proc = Bun.spawn(
    [
      tools.ffprobe,
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const out = await new Response(proc.stdout).text();

  if ((await proc.exited) !== 0) {
    throw new Error(`ffprobe failed on ${file}`);
  }

  return Number.parseFloat(out.trim());
}

/**
 * Words the German voice gets wrong, respelled so it gets them right.
 *
 * Applied to the text handed to the synthesiser and to nothing else - the
 * subtitles keep the real spelling, because "Wörtbehs" on screen would be
 * worse than a mispronounced brand.
 *
 * Respelling rather than phonemes, and not by choice. espeak-ng honours an
 * inline `[[...]]` phoneme escape, which would let the exact English
 * pronunciation be pinned, but piper does not reach espeak's text translator
 * and reads the brackets aloud instead: `[[v'3:tbeIs]]` synthesises to 1.79s of
 * nonsense where the word takes 0.94s. So each entry is ordinary German
 * orthography, checked with `espeak-ng -v de -q --ipa`.
 *
 * - `Virtbase` alone is read `vˈɪɾtbɑːzə` - "virt-BAA-zuh", three syllables,
 *   a schwa on the end and a `z` in the middle. `Wörtbehs` gives `vˈœɾtbeːs`,
 *   which is two syllables and as near the English `vˈɜːtbeɪs` as German
 *   phonology reaches: `œ` is the closest vowel to English `ɜː`, and `eː` is
 *   much nearer `eɪ` than the `aɪ` that a spelling like "Beis" would produce.
 * `KI` looked like it needed an entry too - alone it is read `kˈiː`, "kie" -
 * but in a sentence espeak already says `kˌɑːˈiː`, the two letter names. Forcing
 * `K I` only inserts a gap between them, so it is deliberately not listed here.
 *
 * The rest are the names of things: a firewall manager or a protocol read as a
 * German word instead of as itself. `ufw` comes out `ˈʊff` - "uff" - and
 * `firewalld` as `fˈiːreːvˌalt`, which is not the word anybody says out loud.
 * The letter-name acronyms are the awkward ones, because espeak spells them out
 * correctly *in some sentences and not others*: `UDP` is `ˌuːdˌeːpˈeː` after
 * "und" but `ˈʊtp` inside a comma-separated list, and `ICMP` is `ˈɪkmp`
 * wherever it appears. Every entry below was checked in the sentence it is
 * actually said in, which is the only way to catch that.
 */
const PIPER_PRONUNCIATION: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bVirtbase\b/g, "Wörtbehs"],
  /* The four managers `detectGuestFirewalls` reports, as they are pronounced. */
  [/\bufw\b/g, "Uh-Eff-Weh"],
  [/\bfirewalld\b/g, "Feierwoll-Die"],
  [/\bnftables\b/g, "N-eff-Tebbels"],
  [/\biptables\b/g, "Ei-Peh-Tebbels"],
  /* Before the bare `UDP` rule, which would otherwise eat the first half. */
  [/\bUDP-Lite\b/g, "Uh-Deh-Peh-Leit"],
  [/\bUDP\b/g, "Uh-Deh-Peh"],
  [/\bICMP\b/g, "I-Zeh-Emm-Peh"],
  [/\bESP\b/g, "Eh-Ess-Peh"],
  [/\bEcho-Request\b/g, "Ecko Rikwest"],
];

/**
 * What the cloning model needs told, which is almost nothing.
 *
 * Measured rather than assumed: every clip in `videos/voice-lab` went through
 * `whisper-small`, and the clone reading raw text was transcribed *more*
 * accurately than piper reading respelled text - "UFW" against piper's "RFW",
 * "ICMP" against piper's "ECMP". Ten rules the old voice could not do without
 * turn out to be nine rules this one does not need.
 *
 * The brand is the exception nobody passes: every candidate, piper included,
 * was heard as "Wordbase" or "WordPress". Left alone for now because the raw
 * pronunciation is what was judged acceptable in the samples, and one entry
 * fixes it the moment it stops being.
 */
const QWEN_PRONUNCIATION: ReadonlyArray<readonly [RegExp, string]> = [];

const PRONUNCIATION: Record<
  VoiceEngine,
  ReadonlyArray<readonly [RegExp, string]>
> = {
  piper: PIPER_PRONUNCIATION,
  qwen: QWEN_PRONUNCIATION,
};

/**
 * Rewrites a line into what the synthesiser should read.
 *
 * Per engine, because a respelling is advice to one particular voice and
 * nonsense to another: "Uh-Eff-Weh" is how piper is told to say `ufw`, and
 * handing it to a model that already says `ufw` correctly would only make it
 * say something else.
 */
export const respell = (text: string, engine: VoiceEngine): string =>
  PRONUNCIATION[engine].reduce(
    (line, [pattern, replacement]) => line.replace(pattern, replacement),
    text,
  );

/**
 * Speaks one line to a wav file.
 *
 * piper reads the text on stdin rather than as an argument, which is the only
 * way to pass a sentence containing quotes or an umlaut without worrying about
 * the shell - there is no shell, but the same escaping question would come back
 * the moment someone added one.
 */
async function synthesize(
  tools: Tools,
  text: string,
  output: string,
  options: VoiceOptions,
): Promise<void> {
  const proc = Bun.spawn(
    [
      tools.piper.bin,
      "--model",
      tools.voice.model,
      "--config",
      tools.voice.config,
      "--output_file",
      output,
      "--length_scale",
      String(options.lengthScale),
      "--sentence_silence",
      String(options.sentenceSilence),
      ...(options.noiseScale === undefined
        ? []
        : ["--noise_scale", String(options.noiseScale)]),
      ...(options.noiseW === undefined
        ? []
        : ["--noise_w", String(options.noiseW)]),
    ],
    {
      stdin: new TextEncoder().encode(`${respell(text, "piper")}\n`),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, LD_LIBRARY_PATH: tools.piper.libs },
    },
  );

  const stderr = await new Response(proc.stderr).text();

  if ((await proc.exited) !== 0) {
    throw new Error(`piper failed: ${stderr.trim()}`);
  }

  await levelize(tools, output);
}

/** `I:  -16.4 LUFS` out of an `ebur128` summary. */
const INTEGRATED = /Integrated loudness:\s*\n\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/;

/**
 * Measures one line's loudness and applies the single gain that fixes it.
 *
 * A gain, not a normaliser: `loudnorm` in its one-pass form is a dynamics
 * processor and would pump between the sentences inside a line, and its
 * two-pass form is two passes to arrive at the same constant this arrives at in
 * one. Nothing here is compressed, limited or filtered - the samples are
 * multiplied by one number, which cannot introduce anything that was not
 * already in them.
 */
async function levelize(tools: Tools, file: string): Promise<void> {
  const measure = Bun.spawn(
    [tools.ffmpeg, "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"],
    { stdout: "ignore", stderr: "pipe" },
  );

  const summary = await new Response(measure.stderr).text();
  await measure.exited;

  const loudness = Number.parseFloat(INTEGRATED.exec(summary)?.[1] ?? "");

  /*
   * A line too short to measure reports -inf and is left alone. Silence has no
   * loudness to correct, and a NaN gain would destroy the file.
   */
  if (!Number.isFinite(loudness)) return;

  const gain = LOUDNESS_TARGET - loudness;

  /* Already there. Rewriting the file would only cost a round trip. */
  if (Math.abs(gain) < 0.05) return;

  const levelled = `${file}.levelled.wav`;

  const apply = Bun.spawn(
    [
      tools.ffmpeg,
      "-v",
      "error",
      "-i",
      file,
      "-af",
      `volume=${gain.toFixed(2)}dB`,
      /* The synthesiser's own rate and depth, so this is gain and nothing else. */
      "-c:a",
      "pcm_s16le",
      "-y",
      levelled,
    ],
    { stdout: "ignore", stderr: "pipe" },
  );

  const failure = await new Response(apply.stderr).text();

  if ((await apply.exited) !== 0) {
    throw new Error(`could not level ${file}: ${failure.trim()}`);
  }

  await rename(levelled, file);
}

/**
 * Speaks a batch of lines by cloning the narrator, in one Python process.
 *
 * One process for the whole batch, not one per line: the model takes about a
 * minute to load, so a process per line would spend three quarters of an hour
 * loading a 43 line episode before saying a word.
 *
 * Roughly seven times slower than real time on a CPU, which makes a four minute
 * episode about half an hour of synthesis. That is only ever paid for lines
 * that changed - the cache above is what makes the trade bearable - and it is
 * why `engine: "piper"` is still reachable for iterating on wording.
 */
async function speakWithQwen(
  tools: Tools,
  missing: readonly { text: string; path: string }[],
): Promise<void> {
  if (missing.length === 0) return;

  const qwen = await ensureQwen();

  const manifest = join(tmpdir(), `qwen-speak-${Bun.randomUUIDv7()}.json`);

  await Bun.write(
    manifest,
    JSON.stringify({
      model: QWEN_MODEL,
      language: "German",
      reference: { audio: NARRATOR_AUDIO, text: NARRATOR_TEXT },
      lines: missing.map((line) => ({
        text: respell(line.text, "qwen"),
        path: line.path,
      })),
    }),
  );

  console.log(
    `[voice] cloning ${missing.length} line${missing.length === 1 ? "" : "s"} - ` +
      "this is the slow half",
  );

  try {
    const proc = Bun.spawn([qwen.python, qwen.script, manifest], {
      stdout: "inherit",
      stderr: "pipe",
      /* Weights beside the other fetched tools rather than in the home dir. */
      env: { ...process.env, HF_HOME: qwen.home },
    });

    const stderr = await new Response(proc.stderr).text();

    if ((await proc.exited) !== 0) {
      throw new Error(`qwen-tts failed: ${stderr.trim()}`);
    }

    /* The model writes raw wavs; levelling is the same for both engines. */
    for (const line of missing) {
      await levelize(tools, line.path);
    }
  } finally {
    await unlink(manifest).catch(() => {
      /* A leftover manifest in the temp directory is not worth failing over. */
    });
  }
}

/**
 * Synthesises every line of an episode and reports how long each one takes.
 *
 * Results are cached under a hash of the text and every setting that changes
 * how it sounds, so re-recording after editing one sentence does not re-speak
 * the other thirteen.
 *
 * Lines are keyed by index rather than by content: two beats may legitimately
 * say the same short sentence, and a map keyed by text would silently give the
 * second one the first one's slot in the timeline.
 */
export async function speakAll(
  tools: Tools,
  lines: readonly string[],
  dir: string,
  options: VoiceOptions = DEFAULT_VOICE_OPTIONS,
): Promise<Spoken[]> {
  await mkdir(dir, { recursive: true });

  const engine = options.engine ?? "qwen";

  /*
   * The reference clip is hashed rather than named. A voice is not identified
   * by a path - swapping the file behind that path is exactly the change that
   * must invalidate every cached line, and comparing filenames would miss it.
   */
  const narrator =
    engine === "qwen"
      ? new Bun.CryptoHasher("sha256")
          .update(await Bun.file(NARRATOR_AUDIO).arrayBuffer())
          .digest("hex")
          .slice(0, 16)
      : null;

  const fingerprint = (text: string) =>
    new Bun.CryptoHasher("sha256")
      .update(
        JSON.stringify(
          engine === "qwen"
            ? [
                text,
                engine,
                QWEN_MODEL,
                narrator,
                NARRATOR_TEXT,
                LOUDNESS_TARGET,
              ]
            : [
                text,
                engine,
                options.lengthScale,
                options.sentenceSilence,
                options.noiseScale,
                options.noiseW,
                tools.voice.model,
                /* Part of how the line sounds, so part of what identifies it. */
                LOUDNESS_TARGET,
              ],
        ),
      )
      .digest("hex")
      .slice(0, 16);

  const planned = lines.map((text, index) => ({
    text,
    path: join(
      dir,
      `${String(index).padStart(3, "0")}-${fingerprint(text)}.wav`,
    ),
  }));

  const missing = planned.filter((line) => !existsSync(line.path));

  if (missing.length < planned.length) {
    console.log(
      `[voice] ${planned.length - missing.length}/${planned.length} lines already spoken`,
    );
  }

  if (engine === "qwen") {
    await speakWithQwen(tools, missing);
  } else {
    for (const line of missing) {
      await synthesize(tools, line.text, line.path, options);
    }
  }

  const spoken: Spoken[] = [];

  for (const line of planned) {
    spoken.push({
      path: line.path,
      duration: await probeDuration(tools, line.path),
    });
  }

  const total = spoken.reduce((sum, line) => sum + line.duration, 0);
  console.log(`[voice] ${lines.length} lines, ${total.toFixed(1)}s of speech`);

  return spoken;
}

const timecode = (seconds: number) => {
  const ms = Math.round(seconds * 1000);
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
  const ss = String(Math.floor(ms / 1000) % 60).padStart(2, "0");

  return `${hh}:${mm}:${ss},${String(ms % 1000).padStart(3, "0")}`;
};

/**
 * Writes the narration out as subtitles.
 *
 * Worth having even when nobody switches them on: it is the artefact a
 * translator, a reviewer or a human voice artist works from, and it is the only
 * readable record of what the finished video actually says.
 */
export function subtitles(
  cues: readonly { text: string; start: number; duration: number }[],
): string {
  return cues
    .map((cue, index) =>
      [
        index + 1,
        `${timecode(cue.start)} --> ${timecode(cue.start + cue.duration)}`,
        cue.text,
        "",
      ].join("\n"),
    )
    .join("\n");
}

/**
 * The same narration as an ASS subtitle file, sized for a specific canvas.
 *
 * Not a stylistic preference over `.srt`. ffmpeg converts SRT into ASS on the
 * way into the `subtitles` filter using a default script resolution of 384x288,
 * so a `force_style` written in real pixels is interpreted against that: a 46px
 * font renders at 306px and a 430px margin is off the bottom of a 288-tall
 * script entirely, which is why styling an SRT produces no visible captions at
 * all rather than badly placed ones. Declaring `PlayResX`/`PlayResY` here makes
 * every number below mean what it says.
 */
export function captions(
  cues: readonly { text: string; start: number; duration: number }[],
  {
    width,
    height,
    fontSize,
    marginV,
    marginX = 96,
  }: {
    width: number;
    height: number;
    fontSize: number;
    /** Distance from the bottom of the frame to the bottom of the text. */
    marginV: number;
    marginX?: number;
  },
): string {
  const stamp = (seconds: number) => {
    const cs = Math.round(seconds * 100);
    const hh = Math.floor(cs / 360_000);
    const mm = Math.floor(cs / 6_000) % 60;
    const ss = Math.floor(cs / 100) % 60;

    return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
  };

  const head = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    /* 0 wraps to equal-length lines, which reads better than a ragged last one. */
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    /*
     * `BorderStyle: 3` draws a filled box behind the text rather than an
     * outline around it, with `Outline` acting as its padding. Necessary
     * because these captions lie over the running interface: white text with a
     * shadow is legible against a dark panel and illegible the moment a button
     * passes underneath it.
     */
    `Style: Caption,Geist,${fontSize},&H00FAFAFA,&H00FAFAFA,&H00000000,&HB0000000,0,0,0,0,100,100,0,0,3,14,0,2,${marginX},${marginX},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = cues.map(
    (cue) =>
      `Dialogue: 0,${stamp(cue.start)},${stamp(cue.start + cue.duration)},Caption,,0,0,0,,${cue.text.replace(/\n/g, " ")}`,
  );

  return `${[...head, ...events].join("\n")}\n`;
}
