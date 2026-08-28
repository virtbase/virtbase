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

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { CDPSession, Locator, Page } from "@playwright/test";
import { chromium } from "@playwright/test";
import { installStage } from "./overlay";
import type { Cue, Frame } from "./render";
import { render } from "./render";
import type { VoiceName } from "./tools";
import { ensureTools, workspaceFor } from "./tools";
import type { VoiceEngine } from "./voice";
import { DEFAULT_VOICE_OPTIONS, speakAll, subtitles } from "./voice";

/**
 * The recording studio: one browser, one narrator, one take.
 *
 * An episode is a list of beats. A beat is a sentence and the thing that
 * happens while it is being said, and the studio's whole job is making those
 * two last the same length of time without either being rushed. Narration is
 * synthesised before the browser opens, so the beat knows how long it has;
 * whichever of the two finishes first waits for the other.
 */
export type Target = string | Locator;

export interface PointOptions {
  /** Where in the element to aim, as a fraction of its box. Defaults centre. */
  fx?: number;
  fy?: number;
  /** Travel time in ms. Defaults to something proportional to the distance. */
  ms?: number;
}

export interface Cut {
  /** Seconds since the take started. */
  from: number;
  to: number;
}

export class Stage {
  /** Filled by `cut()`; read by the recorder when it builds the timeline. */
  readonly cuts: Cut[] = [];

  /**
   * @param now - Seconds since the first captured frame. Injected rather than
   *   measured here, so a cut is expressed on the same clock as the beats.
   */
  constructor(
    readonly page: Page,
    private readonly now: () => number = () => 0,
  ) {}

  locate(target: Target): Locator {
    return typeof target === "string" ? this.page.locator(target) : target;
  }

  async hold(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  private async box(target: Target) {
    const locator = this.locate(target).first();

    await locator.waitFor({ state: "visible" });
    await locator.scrollIntoViewIfNeeded();

    const box = await locator.boundingBox();
    if (!box) throw new Error("target has no box on screen");

    return box;
  }

  /**
   * Walks the drawn cursor to an element and leaves the real mouse there.
   *
   * The real pointer only jumps at the end of the walk. Moving it in step with
   * the drawing would fire hover states early, and a button that lights up
   * before the cursor reaches it looks like the recording is out of sync.
   */
  async pointAt(target: Target, options: PointOptions = {}) {
    const box = await this.box(target);
    const x = box.x + box.width * (options.fx ?? 0.5);
    const y = box.y + box.height * (options.fy ?? 0.5);

    const from = await this.page.evaluate(() => window.__vbStage?.at());
    const distance = from ? Math.hypot(x - from.x, y - from.y) : 0;

    /*
     * Unhurried on purpose. Judder is a function of how far the cursor travels
     * between two captured frames, so a slower hand survives a dropped frame
     * where a quick one reads as a skip - and a tutorial cursor that glides is
     * easier to follow than one that darts.
     */
    const ms = options.ms ?? Math.min(1_100, Math.max(420, distance * 1.15));

    await this.page.evaluate(
      ([toX, toY, span]) =>
        window.__vbStage?.moveTo(toX as number, toY as number, span as number),
      [x, y, ms] as const,
    );
    await this.page.mouse.move(x, y);

    return { x, y };
  }

  async click(target: Target, options: PointOptions = {}): Promise<void> {
    const { x, y } = await this.pointAt(target, options);

    await this.page.evaluate(() => window.__vbStage?.press());
    await this.page.mouse.click(x, y);
  }

  /** Types into an element at a pace a person could plausibly manage. */
  async type(target: Target, text: string, delay = 42): Promise<void> {
    await this.click(target);
    await this.page.keyboard.type(text, { delay });
  }

  /**
   * Zooms the page so an element sits in the middle of the frame.
   *
   * The element is measured on screen and converted back into page coordinates
   * before the transform changes, because the same element is at two different
   * places depending on whether the lens is already in.
   */
  async focusOn(target: Target, scale = 1.45, ms = 700): Promise<void> {
    const locator = this.locate(target).first();
    await locator.waitFor({ state: "visible" });

    /*
     * Centre the target in the viewport before measuring it, not merely bring
     * it into view. The lens refuses to pan past the top or bottom of the page,
     * so an element sitting near the fold would be clamped away from the middle
     * of the frame and end up looking like the zoom missed.
     */
    await locator.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await this.page.waitForTimeout(150);

    const box = await this.box(locator);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await this.page.evaluate(
      ([toScale, screenX, screenY, span]) => {
        const stage = window.__vbStage;
        if (!stage) return;

        const point = stage.toPage(screenX as number, screenY as number);

        return stage.zoom(toScale as number, point.x, point.y, span as number);
      },
      [scale, x, y, ms] as const,
    );
  }

  /**
   * Pans a horizontally scrollable region, and back again.
   *
   * The rules table is a scroll area, and on a phone it is wider than the
   * screen: the action, protocol and port columns are simply off to the right.
   * Filming the visible third and talking about the rest is worse than showing
   * the gesture a viewer would actually make.
   *
   * The scroller is found by walking up from the target rather than by
   * selector, because it belongs to the shared data-table component and which
   * element actually overflows is that component's business, not this script's.
   */
  async pan(target: Target, to: "end" | "start" = "end"): Promise<void> {
    const locator = this.locate(target).first();
    await locator.waitFor({ state: "visible" });

    await locator.evaluate((element, edge) => {
      let node: HTMLElement | null = element as HTMLElement;

      while (node && node.scrollWidth <= node.clientWidth + 4) {
        node = node.parentElement;
      }

      node?.scrollTo({
        left: edge === "end" ? node.scrollWidth - node.clientWidth : 0,
        behavior: "smooth",
      });
    }, to);

    await this.page.waitForTimeout(1_400);
  }

  /**
   * Runs something whose duration should not appear in the finished video.
   *
   * The model takes fifteen to twenty seconds to answer, and a viewer should
   * not sit through a spinner for that long to learn what the feature does.
   * The action still runs in full - this is not a fake - but the recorder is
   * told to drop the frames in the middle of it, keeping `keep` milliseconds at
   * each end so the spinner is still seen starting and the result still lands
   * on screen rather than teleporting in.
   *
   * [!] A cut may not overlap narration. There is no way to shorten a spoken
   * sentence to match, so `recordEpisode` throws rather than let the audio and
   * the picture drift apart. Put waits like this in a beat with no `say`.
   */
  async cut<T>(
    run: () => Promise<T>,
    { keep = 1_200 }: { keep?: number } = {},
  ): Promise<T> {
    const from = this.now();
    const result = await run();
    const to = this.now();

    /* Nothing worth removing; a jump cut here would just look like a glitch. */
    if (to - from > (keep * 2) / 1000) {
      this.cuts.push({ from: from + keep / 1000, to: to - keep / 1000 });
    }

    return result;
  }

  /**
   * Scrolls a target into the middle of the frame, smoothly.
   *
   * The portrait cut's equivalent of the lens. A phone shows one card at a
   * time, so the way to draw attention to something is to bring it into view
   * rather than to magnify it - and a smooth scroll is legible in a way that a
   * jump is not.
   */
  async reveal(target: Target): Promise<void> {
    const locator = this.locate(target).first();
    await locator.waitFor({ state: "visible" });

    await locator.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "smooth" }),
    );

    /* Long enough for the smooth scroll to land before anything is measured. */
    await this.page.waitForTimeout(900);
  }

  /** Pulls the lens back out to the whole page. */
  async wide(ms = 600): Promise<void> {
    await this.page.evaluate(
      (span) => window.__vbStage?.zoom(1, 0, 0, span as number),
      ms,
    );
  }
}

export interface Beat {
  /** The German line spoken over this beat. */
  say?: string;
  /** Time to let the narration run before anything moves, in ms. */
  lead?: number;
  /** Time held after both the line and the action are done, in ms. */
  tail?: number;
  act?: (stage: Stage) => Promise<void>;
}

export interface Episode {
  name: string;
  voice?: VoiceName;
  /**
   * Which synthesiser speaks it. Defaults to the cloned narrator.
   *
   * `"piper"` is the way out when the wording is still moving: cloning a four
   * minute episode is about half an hour of CPU, and rewriting one sentence to
   * hear how it lands should not cost that.
   */
  engine?: VoiceEngine;
  viewport?: { width: number; height: number };
  /**
   * Render scale. Two means the page is painted at twice the CSS size, so the
   * lens can go to 2x before a single pixel is invented.
   */
  scale?: number;
  output?: { width: number; height: number };
  fps?: number;
  storageState?: string;
  /**
   * Only the `prefers-color-scheme` the page is asked with. The dashboard
   * picks its own theme and defaults to dark, so this defaults to dark too -
   * asking for light would leave the two disagreeing about anything keyed off
   * the media query.
   */
  colorScheme?: "light" | "dark";
  /**
   * Walk the beats without synthesising narration or recording anything.
   *
   * A take costs three minutes and a script that reaches for a button that
   * moved fails on beat five, having spent all of it. This runs the same
   * actions against the same page as fast as they will go, which is how a
   * rewritten episode gets checked.
   */
  dryRun?: boolean;
  /**
   * Emulate a phone: touch, no hover, and the app's mobile breakpoints.
   *
   * This is what makes the portrait cut worth filming separately rather than
   * letterboxing the landscape one. At 360 CSS pixels the dashboard lays itself
   * out for a phone - cards stack, the sidebar folds away, dialogs become
   * drawers - and everything on screen is legible at arm's length.
   */
  mobile?: boolean;
  /** Encode on the GPU where one is available. */
  gpu?: boolean;
  /** Runs before the screencast starts: navigate, sign in, let things settle. */
  open: (stage: Stage) => Promise<void>;
  beats: Beat[];
}

/**
 * Capture defaults, chosen for smooth motion over supersampling.
 *
 * The page is filmed at exactly the size it is delivered, one CSS pixel per
 * output pixel. A 2x surface downsampled to 1080p is marginally smoother on
 * hairlines, but it is four times the pixels for Chrome to JPEG-encode on every
 * frame, and the screencast only sends the next frame once the last one is
 * done: the earlier 1440x810@2x take averaged 20.7 fps against a 30 fps
 * timeline, which is dropped frames, which is visible judder whenever the
 * cursor moves. Detail is bought back where it is actually needed - the lens
 * scales the live DOM, so Chrome re-rasterises zoomed text at its new size
 * rather than magnifying finished pixels.
 *
 * 1920x1080 is also simply the whole dashboard: at 1440 wide the rules table
 * ran off the bottom of the frame.
 */
const DEFAULTS = {
  voice: "thorsten-high" as VoiceName,
  viewport: { width: 1920, height: 1080 },
  scale: 1,
  output: { width: 1920, height: 1080 },
  fps: 30,
} as const;

/**
 * Removes the cut spans from the take's timeline.
 *
 * Everything the recorder measured - frame stamps, the offset each line of
 * narration starts at, the total length - is in real time. A cut deletes a span
 * of that, so every later moment moves earlier by the total length of the cuts
 * before it.
 */
function compress(cuts: Cut[], cues: Cue[], hasNarration: boolean) {
  const ordered = [...cuts].sort((a, b) => a.from - b.from);

  if (hasNarration) {
    for (const cut of ordered) {
      const clash = cues.find(
        (cue) =>
          cue.start < cut.to && cue.start + cue.audio.duration > cut.from,
      );

      if (clash) {
        throw new Error(
          `a cut at ${cut.from.toFixed(1)}s-${cut.to.toFixed(1)}s overlaps narration ` +
            `starting at ${clash.start.toFixed(1)}s. Speech cannot be shortened to ` +
            "match, so put the wait in a beat with no `say`.",
        );
      }
    }
  }

  const removed = ordered.reduce((sum, cut) => sum + (cut.to - cut.from), 0);

  return {
    removed,
    isCut: (at: number) => ordered.some((cut) => at >= cut.from && at < cut.to),
    map: (at: number) => {
      let shift = 0;

      for (const cut of ordered) {
        if (at >= cut.to) shift += cut.to - cut.from;
        /* Inside a cut: collapse onto the moment the cut begins. */ else if (
          at > cut.from
        )
          return cut.from - shift;
      }

      return at - shift;
    },
  };
}

/** One finished recording, and everything needed to build deliverables from it. */
export interface Take {
  video: string;
  subtitles: string;
  cues: { text: string; start: number; duration: number }[];
  fps: number;
}

export async function recordEpisode(episode: Episode): Promise<Take> {
  const viewport = episode.viewport ?? DEFAULTS.viewport;
  const scale = episode.scale ?? DEFAULTS.scale;
  const output = episode.output ?? DEFAULTS.output;
  const fps = episode.fps ?? DEFAULTS.fps;

  const dry = episode.dryRun ?? false;

  const tools = await ensureTools(episode.voice ?? DEFAULTS.voice);
  const workspace = workspaceFor(episode.name);

  const lines = episode.beats.flatMap((beat) => (beat.say ? [beat.say] : []));
  const spoken = dry
    ? []
    : await speakAll(tools, lines, workspace.audio, {
        ...DEFAULT_VOICE_OPTIONS,
        ...(episode.engine ? { engine: episode.engine } : {}),
      });

  if (!dry) {
    await rm(workspace.frames, { recursive: true, force: true });
    await mkdir(workspace.frames, { recursive: true });
  }

  const browser = await chromium.launch({
    args: [
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      /* Subpixel antialiasing leaves colour fringes that survive downscaling. */
      "--disable-lcd-text",
      "--font-render-hinting=none",
    ],
  });

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    colorScheme: episode.colorScheme ?? "dark",
    ...(episode.mobile ? { isMobile: true, hasTouch: true } : {}),
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    storageState: episode.storageState,
    reducedMotion: "no-preference",
  });

  /*
   * Order matters: the flag has to be in place before the overlay installs, so
   * it is registered as its own init script first. A drawn arrow on a phone
   * recording is wrong - a touch has no pointer - so the mobile take gets a tap
   * ring instead.
   */
  if (episode.mobile) {
    await context.addInitScript(() => {
      window.__vbTouchMode = true;
    });
  }

  await context.addInitScript(installStage);

  const page = await context.newPage();

  /*
   * The take's clock, handed to the stage before its origin exists: `open()`
   * runs before the screencast starts, so anything measured then is legitimately
   * at zero, and the first captured frame fills `takeStart` in below.
   */
  let takeStart: number | null = null;
  const since = () =>
    takeStart === null ? 0 : (performance.now() - takeStart) / 1000;

  const stage = new Stage(page, since);

  await episode.open(stage);

  const frames: Frame[] = [];
  const writes: Promise<unknown>[] = [];
  const cues: Cue[] = [];

  /*
   * The take's zero is the first frame, not the call that started the
   * screencast: Chrome takes a moment to send one, and starting the clock
   * early would push every line of narration late by that much.
   */
  let firstFrameAt: number | null = null;
  let markFirstFrame: ((perf: number) => void) | null = null;
  const firstFrame = new Promise<number>((resolve) => {
    markFirstFrame = resolve;
  });

  const cdp: CDPSession = await context.newCDPSession(page);

  cdp.on("Page.screencastFrame", (event) => {
    void cdp
      .send("Page.screencastFrameAck", { sessionId: event.sessionId })
      .catch(() => {
        /* The session is gone; the take is already over. */
      });

    const at = event.metadata.timestamp ?? Date.now() / 1000;

    if (firstFrameAt === null) {
      firstFrameAt = at;
      markFirstFrame?.(performance.now());
    }

    const file = join(
      workspace.frames,
      `${String(frames.length).padStart(6, "0")}.jpg`,
    );

    writes.push(Bun.write(file, Buffer.from(event.data, "base64")));
    frames.push({ file, at: Math.max(0, at - firstFrameAt) });
  });

  if (!dry) {
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      /* Screen content is flat; 85 is indistinguishable here and encodes
         quicker, which is another frame Chrome does not drop. */
      quality: 85,
      maxWidth: viewport.width * scale,
      maxHeight: viewport.height * scale,
      everyNthFrame: 1,
    });
  }

  /* A page that paints nothing would otherwise hang the take here. */
  takeStart = await Promise.race([
    firstFrame,
    new Promise<number>((resolve) => {
      setTimeout(() => resolve(performance.now()), 2_000);
    }),
  ]);

  let line = 0;

  for (const [index, beat] of episode.beats.entries()) {
    const at = since();
    const audio = beat.say ? spoken[line++] : undefined;

    if (audio) cues.push({ start: at, audio });

    console.log(
      `[beat ${index + 1}/${episode.beats.length}] ${at.toFixed(1)}s ${
        beat.say ? `"${beat.say.slice(0, 56)}..."` : "(silent)"
      }`,
    );

    if (beat.lead && !dry) await stage.hold(beat.lead);
    if (beat.act) await beat.act(stage);

    const needed = dry ? 0 : (audio?.duration ?? 0) + (beat.tail ?? 350) / 1000;
    const remaining = needed - (since() - at);

    if (remaining > 0) await stage.hold(remaining * 1000);
  }

  const recorded = since();
  const timeline = compress(stage.cuts, cues, spoken.length > 0);

  const kept = frames.filter((frame) => !timeline.isCut(frame.at));
  for (const frame of kept) frame.at = timeline.map(frame.at);
  for (const cue of cues) cue.start = timeline.map(cue.start);

  const duration = timeline.map(recorded);

  if (timeline.removed > 0.05) {
    console.log(
      `[studio] cut ${timeline.removed.toFixed(1)}s of waiting from the timeline`,
    );
  }

  if (!dry) await cdp.send("Page.stopScreencast").catch(() => {});
  await context.close();
  await browser.close();
  await Promise.all(writes);

  if (dry) {
    console.log(
      `[studio] dry run walked ${episode.beats.length} beats in ${duration.toFixed(1)}s`,
    );

    return { video: "", subtitles: "", cues: [], fps };
  }

  console.log(`[studio] ${kept.length} frames over ${duration.toFixed(1)}s`);

  const spokenCues = cues.map((cue, index) => ({
    text: lines[index] as string,
    start: cue.start,
    duration: cue.audio.duration,
  }));

  await Bun.write(
    join(workspace.output, `${episode.name}.de.srt`),
    subtitles(spokenCues),
  );

  const subtitlePath = join(workspace.output, `${episode.name}.de.srt`);

  const video = await render({
    tools,
    frames: kept,
    cues,
    duration,
    width: output.width,
    height: output.height,
    fps,
    gpu: episode.gpu ?? false,
    output: join(workspace.output, `${episode.name}.de.mp4`),
  });

  return { video, subtitles: subtitlePath, cues: spokenCues, fps };
}
