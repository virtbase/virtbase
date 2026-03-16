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

import type { Metadata } from "next";

import { APP_NAME, PUBLIC_DOMAIN } from "../constants/main";

export function constructMetadata({
  title,
  fullTitle,
  description = `${APP_NAME} is your provider for secure server hosting. Maximum performance with minimal effort.`,
  image,
  video,
  url,
  canonicalUrl,
  noIndex = false,
  manifest,
  keywords,
}: {
  title?: string;
  fullTitle?: string;
  description?: string;
  image?: string | null;
  video?: string | null;
  url?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
  manifest?: string | URL | null;
  keywords?: string[] | null;
} = {}): Metadata {
  return {
    title:
      fullTitle ||
      (title ? `${title} | ${APP_NAME}` : `${APP_NAME} - Hosting, but secure.`),
    description,
    openGraph: {
      title,
      description,
      siteName: APP_NAME,
      type: "website",
      ...(image && {
        images: [
          {
            url: image,
            height: 630,
            width: 1200,
          },
        ],
      }),
      url: url || canonicalUrl,
      ...(video && {
        videos: video,
      }),
    },
    twitter: {
      title,
      description,
      card: "summary_large_image",
      ...(image && {
        card: "summary_large_image",
        images: [
          {
            url: image,
            height: 630,
            width: 1200,
          },
        ],
      }),
      ...(video && {
        player: video,
      }),
      creator: "@virtbasecom",
    },
    metadataBase: new URL(PUBLIC_DOMAIN),
    ...((url || canonicalUrl) && {
      alternates: {
        canonical: url || canonicalUrl,
      },
    }),
    robots: {
      index: !noIndex,
      follow: !noIndex,
    },
    ...(manifest && {
      manifest,
    }),
    formatDetection: {
      address: false,
      email: false,
      telephone: false,
    },
    referrer: "no-referrer-when-downgrade",
    keywords,
  };
}
