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

/**
 * Everything the recorder adds to the page: a cursor to look at, a lens to
 * look through, and the removal of anything that says "development build".
 *
 * A headless browser paints no pointer, and Playwright's clicks leave no trace,
 * so a screencast of a driven page shows things happening for no visible
 * reason. The overlay draws its own cursor and moves it to the same coordinates
 * the real click will use, which is why it can never drift out of sync with
 * what the browser actually did.
 *
 * The lens is a transform on `body`. It is deliberately *not* a crop applied
 * afterwards in ffmpeg: scaling the live DOM makes Chrome re-rasterise text at
 * the larger size, so a zoomed-in port number is sharper than the same number
 * blown up from a finished frame. The cursor is a child of `documentElement`
 * rather than of `body`, so it sits outside that transform and shares one
 * coordinate space with Playwright's mouse.
 */
export interface StageTransform {
  scale: number;
  x: number;
  y: number;
}

export interface StageBridge {
  place(x: number, y: number): void;
  moveTo(x: number, y: number, ms: number): Promise<void>;
  press(): Promise<void>;
  zoom(scale: number, pageX: number, pageY: number, ms: number): Promise<void>;
  transform(): StageTransform;
  toPage(x: number, y: number): { x: number; y: number };
  toScreen(x: number, y: number): { x: number; y: number };
  at(): { x: number; y: number };
}

declare global {
  interface Window {
    __vbStage?: StageBridge;
    /** Set before the overlay installs: draw a tap ring, not an arrow. */
    __vbTouchMode?: boolean;
  }
}

/**
 * Runs in the page, before any of the app's own script.
 *
 * Registered with `addInitScript`, so it also runs after a full navigation -
 * which matters because a hard reload would otherwise drop the cursor and leave
 * the dev indicator to fade back in over the recording.
 */
export function installStage() {
  const boot = (): void => {
    if (window.__vbStage) {
      /* The bridge is still here but its nodes may not be - see mount(). */
      return;
    }

    const state: StageTransform = { scale: 1, x: 0, y: 0 };
    const point = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    let cursor: HTMLElement | null = null;
    let halo: HTMLElement | null = null;

    const draw = () => {
      /* -3/-2 puts the arrow's tip, not its bounding box, on the coordinate. */
      if (cursor) {
        cursor.style.transform = `translate3d(${point.x - 3}px,${point.y - 2}px,0)`;
      }
      if (halo) {
        halo.style.transform = `translate3d(${point.x}px,${point.y}px,0)`;
      }
    };

    /**
     * Puts the overlay back into the document, and keeps putting it back.
     *
     * `documentElement` is not sacred: `setContent`, a `document.write` and a
     * few framework error paths all replace its children wholesale, which
     * silently deletes the cursor while leaving this bridge on `window` happily
     * animating a node that is no longer in the page. Re-mounting on a timer is
     * cheaper than discovering that at the end of a two minute take.
     */
    const mount = (): void => {
      if (!document.documentElement) return;

      if (!document.getElementById("vb-stage-style")) {
        const style = document.createElement("style");
        style.id = "vb-stage-style";
        style.textContent = [
          /* The Next.js dev indicator and any overlay it renders. */
          "nextjs-portal{display:none!important}",
          "#vb-stage{position:fixed;inset:0;z-index:2147483647;pointer-events:none}",
          /*
           * `will-change` gives the cursor and its halo compositor layers of
           * their own, so a move is a transform on an already-rasterised layer
           * rather than a repaint of a drop-shadowed SVG on every animation
           * frame. That repaint was competing with the screencast's own
           * JPEG encode for the main thread, and the frames it cost showed up
           * as stutter in exactly the moments the cursor was moving.
           *
           * Safe here in a way it is not on the zoom: these only ever
           * translate, so there is no scale for the layer to be rasterised at
           * the wrong size for.
           */
          "#vb-stage-cursor{position:absolute;top:0;left:0;width:26px;height:30px;",
          "will-change:transform;filter:drop-shadow(0 2px 5px rgba(0,0,0,.45))}",
          window.__vbTouchMode === true
            ? "#vb-stage-halo{position:absolute;top:0;left:0;width:64px;height:64px;" +
              "will-change:transform,opacity;margin:-32px 0 0 -32px;border-radius:9999px;" +
              "opacity:.55;background:rgba(250,250,250,.16);" +
              "border:2px solid rgba(250,250,250,.75)}"
            : "#vb-stage-halo{position:absolute;top:0;left:0;width:56px;height:56px;" +
              "will-change:transform,opacity;margin:-28px 0 0 -28px;border-radius:9999px;" +
              "opacity:.2;background:radial-gradient(circle,rgba(56,132,255,.6) 0%,rgba(56,132,255,0) 70%)}",
          "@keyframes vb-press{0%{opacity:.9;transform:var(--vb-at) scale(.3)}",
          "100%{opacity:.2;transform:var(--vb-at) scale(1.5)}}",
          ".vb-pressing{animation:vb-press 460ms cubic-bezier(.22,1,.36,1)}",
        ].join("");
        document.documentElement.appendChild(style);
      }

      const touch = window.__vbTouchMode === true;

      if (!document.getElementById("vb-stage")) {
        const root = document.createElement("div");
        root.id = "vb-stage";
        root.setAttribute("aria-hidden", "true");
        root.innerHTML = [
          '<div id="vb-stage-halo"></div>',
          touch ? "" : '<div id="vb-stage-cursor">',
          '<svg width="26" height="30" viewBox="0 0 26 30" fill="none">',
          touch
            ? ""
            : '<path d="M3 2.2 L3 22.8 L8.6 17.6 L12.1 25.9 L16.1 24.2 L12.7 16.2 L20.4 15.8 Z" fill="#ffffff" stroke="#101216" stroke-width="1.7" stroke-linejoin="round"/>',
          touch ? "" : "</svg></div>",
        ].join("");
        document.documentElement.appendChild(root);

        cursor = root.querySelector("#vb-stage-cursor");
        halo = root.querySelector("#vb-stage-halo");
        draw();
      }

      /* A replaced <body> loses the lens along with everything else. */
      if (
        document.body &&
        state.scale !== 1 &&
        !document.body.style.transform
      ) {
        apply(0);
      }
    };

    const apply = (ms: number) => {
      const body = document.body;
      if (!body) return;

      body.style.transformOrigin = "0 0";
      body.style.transition =
        ms > 0 ? `transform ${ms}ms cubic-bezier(.4,0,.2,1)` : "";
      body.style.transform =
        "translate3d(" +
        state.x +
        "px," +
        state.y +
        "px,0) scale(" +
        state.scale +
        ")";

      /*
       * [!] At rest the transform is removed, not left at identity.
       *
       * `scale(1)` looks like nothing and is not: any transform makes `body`
       * the containing block for `position: fixed`, which is what every
       * portalled popper in the app is positioned with. A select opened after
       * the lens had been used - even long after it was back out - landed 66px
       * below its trigger, and a tooltip beside the thing it describes.
       *
       * So the lens leaves no trace of itself once it is out, and "zoom back
       * out before opening a menu" becomes true rather than nearly true.
       */
      const atRest = state.scale === 1 && state.x === 0 && state.y === 0;

      if (!atRest) return;

      window.setTimeout(
        () => {
          /* A new zoom started while this one was settling. */
          if (!(state.scale === 1 && state.x === 0 && state.y === 0)) return;

          body.style.transform = "";
          body.style.transformOrigin = "";
          body.style.transition = "";
        },
        /* Inside `zoom`'s own ms + 40, so the lens is idle by the time it
           resolves and the next beat can open whatever it likes. */
        ms + 20,
      );
    };

    mount();
    setInterval(mount, 400);

    /* Fast out, slow in - the same curve the app's own transitions use. */
    const ease = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

    const bridge: StageBridge = {
      place(x, y) {
        point.x = x;
        point.y = y;
        draw();
      },

      moveTo(x, y, ms) {
        const fromX = point.x;
        const fromY = point.y;

        return new Promise<void>((done) => {
          if (ms <= 0) {
            bridge.place(x, y);
            done();
            return;
          }

          const started = performance.now();

          const step = (now: number) => {
            const t = Math.min(1, (now - started) / ms);
            const k = ease(t);

            point.x = fromX + (x - fromX) * k;
            point.y = fromY + (y - fromY) * k;
            draw();

            if (t < 1) {
              requestAnimationFrame(step);
            } else {
              done();
            }
          };

          requestAnimationFrame(step);
        });
      },

      press() {
        if (halo) {
          halo.style.setProperty(
            "--vb-at",
            `translate3d(${point.x}px,${point.y}px,0)`,
          );
          halo.classList.remove("vb-pressing");
          /* Reading offsetWidth restarts the animation rather than ignoring it. */
          void halo.offsetWidth;
          halo.classList.add("vb-pressing");
        }

        return new Promise<void>((done) => setTimeout(done, 140));
      },

      zoom(scale, pageX, pageY, ms) {
        const width = window.innerWidth;
        const height = window.innerHeight;

        const clamp = (value: number, min: number, max: number) =>
          Math.min(max, Math.max(min, value));

        /*
         * Keep the requested page point in the middle, but never so far that
         * the lens shows the empty space beyond the page - a zoom that reveals
         * a strip of blank white reads as a rendering bug.
         */
        state.scale = scale;
        state.x =
          scale <= 1
            ? 0
            : clamp(width / 2 - scale * pageX, width - scale * width, 0);
        state.y =
          scale <= 1
            ? 0
            : clamp(height / 2 - scale * pageY, height - scale * height, 0);

        apply(ms);

        return new Promise<void>((done) => setTimeout(done, ms + 40));
      },

      transform: () => ({ ...state }),

      toPage: (x, y) => ({
        x: (x - state.x) / state.scale,
        y: (y - state.y) / state.scale,
      }),

      toScreen: (x, y) => ({
        x: state.x + state.scale * x,
        y: state.y + state.scale * y,
      }),

      at: () => ({ ...point }),
    };

    window.__vbStage = bridge;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
