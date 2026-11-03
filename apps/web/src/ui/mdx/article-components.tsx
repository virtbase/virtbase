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

import { Step, Steps } from "fumadocs-ui/components/steps";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { HelpHint } from "@/ui/fumadocs/help-hint.tsx";
import { Video } from "@/ui/fumadocs/video.tsx";
import { GlossaryTerm } from "@/ui/mdx/glossary-term.tsx";
import { HelpLink } from "@/ui/mdx/help-link.tsx";
import { MdxImage } from "@/ui/mdx/mdx-image.tsx";
import { Msg, Ui } from "@/ui/mdx/ui-text.tsx";

/**
 * Components available to every document in the `helpArticles` collection.
 * Each also needs a Markdown form in `markdown-components.tsx`.
 */
export const helpMdxComponents = {
  ...defaultMdxComponents,
  Steps,
  Step,
  a: HelpLink,
  img: MdxImage,
  Hint: HelpHint,
  Video,
  Term: GlossaryTerm,
  Ui,
  Msg,
};

/** Components available to every document in the `legal` collection. */
export const legalMdxComponents = {
  ...defaultMdxComponents,
  Steps,
  Step,
};
