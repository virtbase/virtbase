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

import { describe, expect, test } from "bun:test";
import { createElement } from "react";

import { toPlainText } from "@/ui/mdx/plain-text";
import { collectQuestions, Question } from "./faq-question";

/** What the MDX compiler produces for `<Question title="…">prose</Question>`. */
function question(title: string, answer: string) {
  return createElement(Question, { title }, createElement("p", null, answer));
}

describe("collectQuestions", () => {
  test("it returns nothing for an empty body", () => {
    expect(collectQuestions(undefined)).toEqual([]);
    expect(collectQuestions(null)).toEqual([]);
  });

  test("it reads a single question", () => {
    const items = collectQuestions(
      question("Is there a traffic limit?", "No."),
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Is there a traffic limit?");
    expect(toPlainText(items[0]?.content)).toBe("No.");
  });

  test("it keeps sibling questions in document order", () => {
    const items = collectQuestions([
      question("First?", "One."),
      question("Second?", "Two."),
      question("Third?", "Three."),
    ]);

    expect(items.map((item) => item.title)).toEqual([
      "First?",
      "Second?",
      "Third?",
    ]);
    expect(items.map((item) => toPlainText(item.content))).toEqual([
      "One.",
      "Two.",
      "Three.",
    ]);
  });

  test("it skips whitespace and foreign elements", () => {
    const items = collectQuestions([
      "\n  ",
      createElement("p", null, "A stray paragraph."),
      question("Real?", "Yes."),
      false,
    ]);

    expect(items.map((item) => item.title)).toEqual(["Real?"]);
  });

  test("it flattens a Markdown answer for structured data", () => {
    const answer = createElement(
      "p",
      null,
      "More in our ",
      createElement("a", { href: "/en/legal/privacy" }, "privacy policy"),
      ".",
    );
    const items = collectQuestions(
      createElement(Question, { title: "How secure is my data?" }, answer),
    );

    expect(toPlainText(items[0]?.content)).toBe("More in our privacy policy.");
  });
});
