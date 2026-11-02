/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { ImageZoomProps } from "fumadocs-ui/components/image-zoom";
import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import type { ComponentProps } from "react";

/**
 * An image in a document, zoomable. Shared by every collection, so the one
 * type correction below is made once.
 *
 * MDX types the `img` slot with an `<img>`'s props, where `src` is a string or
 * a `Blob`. What Fumadocs actually passes is a bundled image object
 * (`StaticImageData`) for a relative path and a string for an absolute one -
 * both of which `ImageZoom` takes; a Markdown image always has one. No type
 * describes the real value, so the cast states it.
 */
export function MdxImage({ src, sizes, ...props }: ComponentProps<"img">) {
  return (
    <ImageZoom
      className="rounded-lg border border-border"
      src={src as NonNullable<ImageZoomProps["src"]>}
      {...(sizes === undefined ? {} : { sizes })}
      {...props}
    />
  );
}
