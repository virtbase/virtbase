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

import {
  DISCORD_INVITE_URL,
  GITHUB_URL,
  INSTAGRAM_URL,
  VIRTBASE_EMAIL_ASSETS,
  X_URL,
  YOUTUBE_URL,
} from "@virtbase/utils";
import { Img, Link, Section } from "react-email";

/**
 * The icons are PNGs rather than the SVG components the web app uses: Gmail
 * strips SVG entirely, so an inline icon would simply not render. They are
 * generated from those same components at 40px and displayed at 20px, so they
 * stay sharp on a high-density screen.
 */
const SOCIALS = [
  { name: "Discord", href: DISCORD_INVITE_URL, icon: "discord" },
  { name: "X", href: X_URL, icon: "twitter" },
  { name: "Instagram", href: INSTAGRAM_URL, icon: "instagram" },
  { name: "YouTube", href: YOUTUBE_URL, icon: "youtube" },
  { name: "GitHub", href: GITHUB_URL, icon: "github" },
] as const;

export function Socials() {
  return (
    <Section className="mt-6">
      {SOCIALS.map(({ name, href, icon }) => (
        <Link
          key={name}
          href={href}
          // Inline-block with explicit spacing: an email client cannot be
          // trusted to apply flex or gap.
          className="mr-4 inline-block"
        >
          <Img
            src={`${VIRTBASE_EMAIL_ASSETS}/social/${icon}.png`}
            width="20"
            height="20"
            alt={name}
            title={name}
          />
        </Link>
      ))}
    </Section>
  );
}
