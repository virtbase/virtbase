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

declare module "@react-email/components" {
  import type * as React from "react";

  export const Html: React.FC<React.HtmlHTMLAttributes<HTMLHtmlElement>>;
  export const Head: React.FC<React.HTMLAttributes<HTMLHeadElement>>;
  export const Body: React.FC<React.HTMLAttributes<HTMLBodyElement>>;
  export const Container: React.FC<React.TableHTMLAttributes<HTMLTableElement>>;
  export const Section: React.FC<React.TableHTMLAttributes<HTMLTableElement>>;
  export const Row: React.FC<React.HTMLAttributes<HTMLTableRowElement>>;
  export const Column: React.FC<
    React.TdHTMLAttributes<HTMLTableDataCellElement>
  >;
  export const Img: React.FC<React.ImgHTMLAttributes<HTMLImageElement>>;
  export const Link: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement>>;
  export const Text: React.FC<React.HTMLAttributes<HTMLParagraphElement>>;
  export const Heading: React.FC<React.HTMLAttributes<HTMLHeadingElement>>;
  export const Hr: React.FC<React.HTMLAttributes<HTMLHRElement>>;
  export const Preview: React.FC<{ children: React.ReactNode }>;
  export const Tailwind: React.FC<{ children: React.ReactNode }>;
}
