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

import { Discord, Instagram, Twitter, YouTube } from "@virtbase/ui/icons";
import { DISCORD_INVITE_URL } from "@virtbase/utils";

export const SOCIALS = [
  {
    name: "YouTube",
    icon: YouTube,
    href: "https://www.youtube.com/@virtbase",
  },
  {
    name: "Discord",
    icon: Discord,
    href: DISCORD_INVITE_URL,
  },
  {
    name: "X",
    icon: Twitter,
    href: "https://x.com/virtbasecom",
  },
  {
    name: "Instagram",
    icon: Instagram,
    href: "https://www.instagram.com/virtbasecom",
  },
] as const;
