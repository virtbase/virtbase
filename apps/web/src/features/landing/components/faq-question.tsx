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

import type { ReactNode } from "react";
import { Children, isValidElement } from "react";

export type QuestionProps = {
  /** The question, as it appears on the accordion trigger. */
  title: string;
  /** The answer, written as the component's MDX body. */
  children?: ReactNode;
};

/**
 * One entry of `<FAQSection>`.
 *
 * It renders nothing on its own — `FAQSection` reads these out of its children
 * so it can lay them out as an accordion and serialize the same content as
 * `FAQPage` structured data.
 */
export function Question(_props: QuestionProps): ReactNode {
  return null;
}

/**
 * Reads the `<Question>` elements out of a `<FAQSection>` body.
 *
 * MDX hands a component its children as a React tree, so the questions have to
 * be recovered from it. Anything that is not a `<Question>` — stray whitespace,
 * a comment, a paragraph someone left between entries — is skipped rather than
 * being rendered into a broken accordion row.
 */
export function collectQuestions(
  children: ReactNode,
): { title: string; content: ReactNode }[] {
  return Children.toArray(children)
    .filter((child) => isValidElement<QuestionProps>(child))
    .filter((child) => child.type === Question)
    .map((child) => ({
      title: child.props.title,
      content: child.props.children,
    }));
}
