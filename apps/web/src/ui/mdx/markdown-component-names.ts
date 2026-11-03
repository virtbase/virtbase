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

/**
 * Every MDX component a document may use. Each has a Markdown form in
 * `markdown-components.tsx`, which must provide exactly these - its return
 * value is checked against this list - and a test fails for a document that
 * uses a component missing here.
 *
 * Kept free of imports so the test can read it without loading React or the
 * database.
 *
 * @internal Read by tests.
 */
export const MARKDOWN_COMPONENT_NAMES = [
  "Hero",
  "Prose",
  "Split",
  "SplitText",
  "SplitAside",
  "Features",
  "Feature",
  "Advantages",
  "Advantage",
  "Stats",
  "Stat",
  "Steps",
  "Step",
  "Hint",
  "Video",
  "CodeBlockTabs",
  "CodeBlockTabsList",
  "CodeBlockTabsTrigger",
  "CodeBlockTab",
  "Term",
  "Ui",
  "Msg",
  "Faq",
  "Question",
  "OperatingSystems",
  "Offers",
] as const;

export type MarkdownComponentName = (typeof MARKDOWN_COMPONENT_NAMES)[number];
