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
import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

import { toPlainText } from "./plain-text";

describe("toPlainText", () => {
  test("it returns a bare string unchanged", () => {
    expect(toPlainText("Hello")).toBe("Hello");
  });

  test("it ignores nullish and boolean nodes", () => {
    expect(toPlainText(null)).toBe("");
    expect(toPlainText(undefined)).toBe("");
    expect(toPlainText(false)).toBe("");
  });

  test("it unwraps an element to its text", () => {
    const paragraph = createElement("p", null, "Hosting, but secure.");

    expect(toPlainText(paragraph)).toBe("Hosting, but secure.");
  });

  test("it keeps the text of an inline link", () => {
    const paragraph = createElement(
      "p",
      null,
      "More in our ",
      createElement("a", { href: "/en/legal/privacy" }, "privacy policy"),
      ".",
    );

    expect(toPlainText(paragraph)).toBe("More in our privacy policy.");
  });

  test("it separates sibling blocks", () => {
    const nodes = createElement(
      Fragment,
      null,
      createElement("p", null, "First."),
      createElement("p", null, "Second."),
    );

    expect(toPlainText(nodes)).toBe("First. Second.");
  });

  test("it collapses the whitespace MDX leaves between lines", () => {
    const paragraph = createElement("p", null, "Wrapped\n   across\n\nlines");

    expect(toPlainText(paragraph)).toBe("Wrapped across lines");
  });

  test("it keeps a component-rendered link inline", () => {
    const Link = ({ children }: { children?: ReactNode }) =>
      createElement("a", null, children);
    const paragraph = createElement(
      "p",
      null,
      "Email ",
      createElement(Link, null, "support@virtbase.com"),
      " for help.",
    );

    expect(toPlainText(paragraph)).toBe("Email support@virtbase.com for help.");
  });

  test("it contributes nothing for an element without text children", () => {
    const icon = createElement("svg", { viewBox: "0 0 24 24" });

    expect(toPlainText(icon)).toBe("");
  });
});
