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

import NextImage from "next/image";

const items = [
  {
    src: "/assets/static/distros/debian_wordmark.svg",
    alt: "Debian",
  },
  {
    src: "/assets/static/distros/ubuntu_wordmark.svg",
    alt: "Ubuntu",
  },
  {
    src: "/assets/static/distros/centos_wordmark.svg",
    alt: "CentOS",
  },
  {
    src: "/assets/static/distros/almalinux_wordmark.svg",
    alt: "AlmaLinux",
  },
  {
    src: "/assets/static/distros/fedora_wordmark.svg",
    alt: "Fedora",
  },
] as const;

// TODO: Add white mode versions with dark colors
export function OperatingSystemShowcase() {
  return (
    <div className="grid grid-cols-2 items-center gap-4 px-4 py-10 transition-[opacity,transform] duration-500 sm:grid-cols-3 md:grid-cols-5">
      {items.map((item) => (
        <div className="relative" key={item.alt}>
          <div className="relative h-12">
            <div className="group absolute inset-0" aria-hidden inert>
              <div className="absolute inset-x-0 inset-y-3 h-6">
                <div className="absolute top-1/2 left-0 size-full -translate-y-1/2">
                  <NextImage
                    alt={item.alt}
                    draggable={false}
                    className="absolute inset-0 size-full object-contain object-center light:grayscale light:invert"
                    src={item.src}
                    fill
                    unoptimized
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
