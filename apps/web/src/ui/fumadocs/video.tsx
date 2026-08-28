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

"use client";

import { LucidePlay } from "@virtbase/ui/icons";
import Image from "next/image";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { IntlLink } from "@/i18n/navigation.public";

interface VideoProps {
  /** The YouTube video id, the part after `youtu.be/`. */
  id: string;
  /** What the video is called. Read out by the play button. */
  title: string;
  /**
   * A poster served from this origin, under `/assets/static/articles`.
   *
   * Deliberately not `i.ytimg.com`. Pulling the thumbnail from Google would
   * hand them the reader's IP address and user agent on page load, which is
   * the exact request this component exists to avoid - the iframe would then
   * be the *second* contact rather than the first. The file is the same cover
   * the video carries on YouTube, built by `scripts/video/lib/thumbnail.ts`.
   */
  poster: string;
}

/**
 * A YouTube video that contacts YouTube only once the reader asks it to.
 *
 * Until the play button is pressed there is no iframe, no script and no
 * request to any Google domain: what is on the page is a local image and a
 * button. `youtube-nocookie.com` then keeps the playback itself out of the ad
 * cookie jar, but that domain alone is not a privacy measure - it still
 * profiles on load and still sets storage once playing. The click is what does
 * the work here; the domain is the belt to its braces.
 *
 * The consequence worth knowing: no view is counted, and no watch time is
 * attributed, for a reader who never presses play. That is the intended
 * behaviour rather than a side effect.
 */
export function Video({ id, title, poster }: VideoProps) {
  const t = useExtracted();
  const [playing, setPlaying] = useState(false);

  return (
    <figure className="not-prose my-8 flex flex-col gap-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
        {playing ? (
          <iframe
            /* `rel=0` keeps the end cards to this channel, `playsinline` stops
               iOS taking the video fullscreen out of the article. */
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={title}
            className="group absolute inset-0 size-full cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <Image
              src={poster}
              alt=""
              fill
              sizes="(min-width: 1024px) 720px, 100vw"
              className="object-cover transition-opacity group-hover:opacity-90"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-background/90 shadow-lg ring-1 ring-border transition-transform group-hover:scale-105">
                <LucidePlay
                  className="ml-0.5 size-7 fill-foreground text-foreground"
                  aria-hidden="true"
                />
              </span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {t(
          "This video is only loaded from YouTube once you press play. Nothing is requested from Google before that.",
        )}{" "}
        <IntlLink
          href="/legal/privacy"
          className="underline underline-offset-4 hover:text-foreground"
          prefetch={false}
        >
          {t("Privacy policy")}
        </IntlLink>
        {" · "}
        <a
          href={`https://www.youtube.com/watch?v=${id}`}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          {t("Watch on YouTube")}
        </a>
      </figcaption>
    </figure>
  );
}
