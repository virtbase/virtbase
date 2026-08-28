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

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";
import type { Tools } from "./tools";
import { repoRoot } from "./tools";

/**
 * Cover art, drawn in a browser.
 *
 * A thumbnail is a typographic problem - a headline that has to survive being
 * shown two centimetres wide in a sidebar - so it is laid out in HTML and
 * screenshotted rather than assembled from ffmpeg's `drawtext`, which cannot
 * wrap, kern or letter-space. It also means the cover uses the product's own
 * typeface over a real frame of the product, which is the whole point of it.
 */
export interface ThumbnailSpec {
  /** Small letter-spaced line above the title. */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Seconds into the finished video to take the backdrop from. */
  backdropAt: number;
  /**
   * How far into the screenshot to crop.
   *
   * 1 fits the whole frame; above that it crops. The default is well above,
   * because a whole dashboard reduced to a corner of a thumbnail is a grey
   * smudge - a magnified fragment of real interface reads as software, which is
   * the only thing the screenshot is there to say.
   */
  zoom?: number;
  /** Which part of the frame to keep, as a fraction of width and height. */
  focus?: { x: number; y: number };
}

export type ThumbnailShape = "youtube" | "vertical";

const SIZES: Record<ThumbnailShape, { width: number; height: number }> = {
  /** What YouTube asks for; also what it downscales into a 210px sidebar. */
  youtube: { width: 1280, height: 720 },
  vertical: { width: 1080, height: 1920 },
};

const asset = (path: string) => join(repoRoot, "apps/web/public/assets", path);

async function dataUri(path: string, mime: string): Promise<string> {
  const bytes = await Bun.file(path).bytes();

  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** Pulls one frame out of the finished video to sit behind the text. */
async function backdrop(
  tools: Tools,
  video: string,
  at: number,
): Promise<string> {
  const out = join(repoRoot, ".cache/video/backdrop.jpg");

  const proc = Bun.spawn(
    [
      tools.ffmpeg,
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(at),
      "-i",
      video,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      out,
    ],
    { stdout: "ignore", stderr: "inherit" },
  );

  if ((await proc.exited) !== 0) {
    throw new Error("could not take a backdrop frame from the video");
  }

  return await dataUri(out, "image/jpeg");
}

/**
 * The reference layouts, measured rather than eyeballed.
 *
 * Both examples were taken apart pixel by pixel: rule positions, glyph cap
 * heights, stem widths and the background grid period. Font sizes below are
 * derived, not guessed - Geist reports `capHeight` 0.710em, so a measured 51px
 * capital is a 72px font and nothing else. Weights come from the stem-to-cap
 * ratio: 0.216 in the wide title is an ExtraBold, 0.265 in the tall one is a
 * Black, and 0.13 in the subtitle is a Regular.
 *
 * The numbers are absolute because the outputs share the references' widths -
 * 1280x720 exactly for the wide cover, and 1080 wide for the tall one, whose
 * extra height goes to the panel rather than being spread through the type.
 */
const WIDE = {
  rule: { x: 53, top: 56, bottom: 662, right: 789, colour: "#3c3c3c" },
  cross: { size: 12, colour: "#e6e6e6" },
  /* Ink, not box: Geist's side bearings put the glyph ~3px right of `left`. */
  text: { x: 87 },
  /* The reference's mono sets ~0.52em per advance; Geist Mono is 0.60em,
     so it is tracked in to match the measured line width. */
  eyebrow: {
    capTop: 143,
    size: 49,
    leading: 44,
    weight: 500,
    tracking: -0.075,
  },
  title: { capTop: 264, size: 72, leading: 78, weight: 800 },
  wordmark: { x: 89, inkTop: 540, inkHeight: 37 },
  shot: { x: 790, y: 56 },
} as const;

const TALL = {
  grid: 135,
  wordmark: { inkTop: 73, inkWidth: 422 },
  title: { capTop: 213, size: 93, leading: 109, weight: 900 },
  subtitle: { capTop: 467, size: 76, leading: 90, weight: 400 },
  panel: { x: 119, width: 860, top: 760, tilt: -3 },
} as const;

/**
 * The wordmark ships with vertical padding: 384px of ink centred in a 688px
 * canvas, 154px clear above and 150px below, none at the sides. Sizing the
 * image by height therefore shrinks the visible mark by 1.79x, which is why
 * every earlier attempt looked timid beside the reference. Both numbers are
 * needed: one to size the mark, one to place its ink where it was measured.
 */
/** Geist and Geist Mono both declare `capHeight` 710 against a 1000 upem. */
const CAP_HEIGHT = 0.71;

const WORDMARK = { canvas: 688, ink: 384, padTop: 154 } as const;
const WORDMARK_PAD = WORDMARK.canvas / WORDMARK.ink;

function markup({
  spec,
  shape,
  font,
  mono,
  wordmark,
  frame,
}: {
  spec: ThumbnailSpec;
  shape: ThumbnailShape;
  font: string;
  mono: string;
  wordmark: string;
  frame: string;
}): string {
  const { width, height } = SIZES[shape];

  return shape === "vertical"
    ? portrait({ spec, width, height, font, mono, wordmark, frame })
    : landscape({ spec, width, height, font, mono, wordmark, frame });
}

interface Layout {
  spec: ThumbnailSpec;
  width: number;
  height: number;
  font: string;
  mono: string;
  wordmark: string;
  frame: string;
}

const faces = (font: string, mono: string) => `
  @font-face {
    font-family: "Geist";
    src: url("${font}") format("truetype");
    font-weight: 100 900;
  }
  @font-face {
    font-family: "Geist Mono";
    src: url("${mono}") format("truetype");
    font-weight: 100 900;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a0a; color: #fff;
    font-family: "Geist", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }
  .wordmark { filter: invert(1); display: block; }
`;

/**
 * Wide: registration marks, monospace eyebrow, screenshot off the right edge.
 *
 * The frame is three rules and two crosshairs, not a box - there is no rule
 * down the right, because the screenshot's own edge closes the composition.
 */
function landscape({
  spec,
  width,
  height,
  font,
  mono,
  wordmark,
  frame,
}: Layout): string {
  /*
   * A background-size percentage is measured against the *container*, not the
   * image, and the container is only ~490px wide. 100% therefore squeezes the
   * whole 1920px dashboard into that strip; 300% shows roughly 640px of source
   * across it, which is about a card and a half - enough structure to read as
   * software, close enough to read the words on it.
   */
  const zoom = spec.zoom ?? 300;
  const focus = spec.focus ?? { x: 0.45, y: 0.42 };

  return `
<style>
  ${faces(font, mono)}
  body { width: ${width}px; height: ${height}px; }
  .shot {
    position: absolute;
    left: ${WIDE.shot.x}px; top: ${WIDE.shot.y}px; right: 0; bottom: 0;
    background-image: url("${frame}");
    background-size: ${zoom}%;
    background-position: ${Math.round(focus.x * 100)}% ${Math.round(focus.y * 100)}%;
    background-repeat: no-repeat;
  }
  /*
   * The same idea as the tall cover's fade, turned ninety degrees: there the
   * panel dissolves downward, here the shot dissolves back toward the type so
   * it emerges from the page instead of butting against the rule in a hard
   * vertical seam. The left edge does most of the work - it is the one the eye
   * travels across - and the top and bottom get just enough to stop the strip
   * reading as a pasted-on rectangle.
   */
  .shot-fade {
    position: absolute;
    left: ${WIDE.shot.x}px; top: ${WIDE.shot.y}px; right: 0; bottom: 0;
    background:
      linear-gradient(90deg, #0a0a0a 0%, rgba(10,10,10,.55) 12%, rgba(10,10,10,0) 30%),
      linear-gradient(180deg, #0a0a0a 0%, rgba(10,10,10,0) 14%),
      linear-gradient(0deg, #0a0a0a 0%, rgba(10,10,10,0) 14%);
  }
  .rule { position: absolute; background: ${WIDE.rule.colour}; }
  .cross { position: absolute; }
  .cross::before, .cross::after {
    content: ""; position: absolute; background: ${WIDE.cross.colour};
  }
  .cross::before {
    left: ${(WIDE.cross.size - 1) / 2}px; top: 0;
    width: 1px; height: ${WIDE.cross.size}px;
  }
  .cross::after {
    top: ${(WIDE.cross.size - 1) / 2}px; left: 0;
    height: 1px; width: ${WIDE.cross.size}px;
  }
  .eyebrow {
    position: absolute; left: ${WIDE.text.x}px;
    font-family: "Geist Mono", ui-monospace, monospace;
    font-size: ${WIDE.eyebrow.size}px;
    line-height: ${WIDE.eyebrow.leading}px;
    font-weight: ${WIDE.eyebrow.weight};
    letter-spacing: ${WIDE.eyebrow.tracking}em; white-space: pre-line;
  }
  h1 {
    position: absolute; left: ${WIDE.text.x}px;
    font-size: ${WIDE.title.size}px;
    line-height: ${WIDE.title.leading}px;
    font-weight: ${WIDE.title.weight};
    letter-spacing: -.035em; white-space: pre-line;
  }
  .wordmark {
    position: absolute; left: ${WIDE.wordmark.x}px;
    height: ${Math.round(WIDE.wordmark.inkHeight * WORDMARK_PAD)}px;
  }
</style>
<div class="shot"></div>
<div class="shot-fade"></div>
<i class="rule" style="left:${WIDE.rule.x}px;top:${WIDE.rule.top - 4}px;width:1px;height:${WIDE.rule.bottom - WIDE.rule.top + 8}px"></i>
<i class="rule" style="left:48px;top:${WIDE.rule.top}px;height:1px;width:${WIDE.rule.right - 48}px"></i>
<i class="rule" style="left:48px;top:${WIDE.rule.bottom}px;height:1px;width:${WIDE.rule.right - 48}px"></i>
<span class="cross" style="left:${WIDE.rule.x - (WIDE.cross.size - 1) / 2}px;top:${WIDE.rule.top - (WIDE.cross.size - 1) / 2}px;width:${WIDE.cross.size}px;height:${WIDE.cross.size}px"></span>
<span class="cross" style="left:${WIDE.rule.x - (WIDE.cross.size - 1) / 2}px;top:${WIDE.rule.bottom - (WIDE.cross.size - 1) / 2}px;width:${WIDE.cross.size}px;height:${WIDE.cross.size}px"></span>
<div class="eyebrow" id="eyebrow">${spec.eyebrow}</div>
<h1 id="title">${spec.title}</h1>
<img class="wordmark" id="wordmark" src="${wordmark}" alt="Virtbase">`;
}

/**
 * Tall: centred type over a faint grid, one panel of interface below it.
 *
 * The grid is a 135px lattice - exactly an eighth of the width - drawn two
 * levels above the background and no more. The panel is tilted a few degrees,
 * which is what stops a rectangle inside a rectangle from reading as a slide.
 */
function portrait({
  spec,
  width,
  height,
  font,
  mono,
  wordmark,
  frame,
}: Layout): string {
  /*
   * Near 1:1. The panel is 860 wide and the source frame is 1080, so 100% puts
   * very nearly the whole phone screen inside it - which is the point, since
   * that frame is already phone-sized. The wide cover has to magnify hard; this
   * one does not.
   */
  const zoom = spec.zoom ?? 100;
  const focus = spec.focus ?? { x: 0.5, y: 0.1 };

  return `
<style>
  ${faces(font, mono)}
  body {
    width: ${width}px; height: ${height}px;
    background-color: #0a0a0a;
    background-image:
      linear-gradient(to right, rgba(255,255,255,.012) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,.012) 1px, transparent 1px);
    background-size: ${TALL.grid}px ${TALL.grid}px;
  }
  .top {
    position: absolute; left: 0; right: 0; text-align: center;
  }
  /* left and right plus auto margins, not auto margins alone: the alignment
     pass makes this absolute, and an absolute box with no offsets falls back
     to its static position instead of centring. */
  .wordmark {
    left: 0; right: 0; margin: 0 auto;
    width: ${Math.round(TALL.wordmark.inkWidth)}px; height: auto;
  }
  h1 {
    position: absolute; left: 0; right: 0; text-align: center;
    font-size: ${TALL.title.size}px;
    line-height: ${TALL.title.leading}px;
    font-weight: ${TALL.title.weight};
    letter-spacing: -.04em; white-space: pre-line;
  }
  .subtitle {
    position: absolute; left: 0; right: 0; text-align: center;
    padding: 0 96px;
    font-size: ${TALL.subtitle.size}px;
    line-height: ${TALL.subtitle.leading}px;
    font-weight: ${TALL.subtitle.weight};
    letter-spacing: -.02em; color: #fff;
  }
  .panel {
    position: absolute;
    left: ${TALL.panel.x}px; width: ${TALL.panel.width}px;
    top: ${TALL.panel.top}px; height: ${height - TALL.panel.top + 120}px;
    border: 1px solid #232323; border-radius: 34px; overflow: hidden;
    background-color: #0a0a0a;
    background-image: url("${frame}");
    background-size: ${zoom}%;
    background-position: ${Math.round(focus.x * 100)}% ${Math.round(focus.y * 100)}%;
    background-repeat: no-repeat;
    transform: rotate(${TALL.panel.tilt}deg);
    transform-origin: 50% 30%;
  }
  /* Lets the panel dissolve into the page instead of ending in a hard edge. */
  .fade {
    position: absolute; left: 0; right: 0; bottom: 0; height: 520px;
    background: linear-gradient(180deg, rgba(10,10,10,0) 0%, #0a0a0a 78%);
  }
</style>
<div class="panel"></div>
<div class="fade"></div>
<img class="wordmark" id="wordmark" src="${wordmark}" alt="Virtbase">
<h1 id="title">${spec.title}</h1>
<div class="subtitle" id="subtitle">${spec.subtitle}</div>`;
}

/** Where each labelled block's capitals must start, per the measurements. */
function capTops(
  shape: ThumbnailShape,
  spec: ThumbnailSpec,
): [string, number][] {
  if (shape === "vertical") {
    return [
      ["title", TALL.title.capTop],
      ["subtitle", TALL.subtitle.capTop],
    ];
  }

  /*
   * The wide title sits under the eyebrow, so an eyebrow longer than the
   * reference's two lines pushes the title down instead of colliding with it.
   */
  const extra = (spec.eyebrow.match(/\n/g)?.length ?? 0) - 1;

  return [
    ["eyebrow", WIDE.eyebrow.capTop],
    ["title", WIDE.title.capTop + extra * WIDE.eyebrow.leading],
  ];
}

/**
 * Renders one cover and returns where it was written.
 *
 * PNG rather than JPEG: YouTube's 2MB limit is nowhere near binding at this
 * size, and flat dark backgrounds with large type are exactly what JPEG rings
 * around.
 */
export async function renderThumbnail({
  tools,
  video,
  spec,
  shape,
  output,
}: {
  tools: Tools;
  video: string;
  spec: ThumbnailSpec;
  shape: ThumbnailShape;
  output: string;
}): Promise<string> {
  const [font, mono, wordmark, frame] = await Promise.all([
    dataUri(join(repoRoot, ".cache/video/tools/fonts/Geist.ttf"), "font/ttf"),
    dataUri(
      join(repoRoot, ".cache/video/tools/fonts/GeistMono.ttf"),
      "font/ttf",
    ),
    dataUri(asset("static/wordmark.png"), "image/png"),
    backdrop(tools, video, spec.backdropAt),
  ]);

  const browser = await chromium.launch({
    args: ["--hide-scrollbars", "--force-color-profile=srgb"],
  });

  try {
    const page = await browser.newPage({
      viewport: SIZES[shape],
      deviceScaleFactor: 1,
    });

    await page.setContent(markup({ spec, shape, font, mono, wordmark, frame }));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);

    /*
     * Place each block by where its ink lands, not where its box does.
     *
     * The reference was measured in cap tops - the y of the top of a capital -
     * and CSS cannot be asked for that. The baseline is found with the old
     * zero-sized inline-block trick: an empty strut aligned to the baseline
     * reports that baseline as its own top. Cap top is then simply the baseline
     * less the font's cap height, which Geist declares as 0.710em.
     *
     * Canvas `fontBoundingBoxAscent` was tried first and is not the same
     * number - it is the ascent canvas draws with, not the ascent Chrome lays
     * an HTML line box out with, and the title landed eleven pixels high.
     */
    await page.evaluate(
      ({ targets, capRatio, wordmarkInkTop, padRatio }) => {
        for (const [id, capTop] of targets) {
          const element = document.getElementById(id);
          if (!element) continue;

          /*
           * Pin the box to zero before measuring. Without it the element is
           * still at its static position, the baseline is read relative to
           * that, and the correction below - which assumes a box top of zero -
           * lands the block wherever the flow happened to put it.
           */
          element.style.top = "0px";

          const strut = document.createElement("span");
          strut.style.cssText = "display:inline-block;width:0;height:0";
          element.prepend(strut);

          const baseline = strut.getBoundingClientRect().top;
          const size = Number.parseFloat(getComputedStyle(element).fontSize);
          strut.remove();

          element.style.top = `${capTop - (baseline - size * capRatio)}px`;
        }

        const mark = document.getElementById("wordmark");

        if (mark) {
          mark.style.position = "absolute";
          const drawn = mark.getBoundingClientRect().height;
          mark.style.top = `${wordmarkInkTop - drawn * padRatio}px`;
        }
      },
      {
        targets: capTops(shape, spec),
        capRatio: CAP_HEIGHT,
        wordmarkInkTop:
          shape === "vertical" ? TALL.wordmark.inkTop : WIDE.wordmark.inkTop,
        padRatio: WORDMARK.padTop / WORDMARK.canvas,
      },
    );

    await page.waitForTimeout(120);

    await mkdir(dirname(output), { recursive: true });
    await page.screenshot({ path: output, type: "png" });
  } finally {
    await browser.close();
  }

  return output;
}
