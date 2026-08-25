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

"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import {
  defaultHighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useTheme } from "@virtbase/ui/theme-provider";
import { validateSnippetContent } from "@virtbase/utils";
import { useExtracted } from "next-intl";
import { useEffect, useMemo, useRef } from "react";

interface SnippetEditorProps {
  value: string;
  onChange: (value: string) => void;
  kind: "cloud-config" | "shell";
  "aria-invalid"?: boolean;
}

/**
 * The snippet body editor.
 *
 * Built on the CodeMirror primitives rather than a React wrapper. The wrapper
 * ships both a CJS and an ESM entry point, and every `@codemirror/*` package is
 * dual-format too - so a production build could resolve `@codemirror/state`
 * twice, and every `instanceof` check inside CodeMirror then fails with
 * "Unrecognized extension value in extension set". Importing the primitives
 * directly leaves exactly one module graph, all ESM.
 *
 * Loaded through `next/dynamic` by its parent, so none of this reaches an
 * admin bundle that is not the snippet editor.
 */
export default function SnippetEditor({
  value,
  onChange,
  kind,
  "aria-invalid": invalid,
}: SnippetEditorProps) {
  const t = useExtracted();
  const { resolvedTheme } = useTheme();

  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);

  // Held in a ref so a new handler identity never tears the editor down, which
  // would cost the cursor position and the undo history.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Reconfigured in place rather than by rebuilding the editor.
  const language = useRef(new Compartment());
  const theme = useRef(new Compartment());

  // Parsed on every keystroke: the document is small and the parser is fast,
  // and an error that appears as you type is worth far more than one on save.
  const error = useMemo(
    () => validateSnippetContent(value, kind),
    [value, kind],
  );

  // Mounted once; the effects below keep it in sync.
  useEffect(() => {
    if (!host.current) return;

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          // cloud-config is indentation-sensitive and a literal tab is a parse
          // error, so indentation is two spaces.
          EditorState.tabSize.of(2),
          indentUnit.of("  "),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          language.current.of([]),
          theme.current.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            "&": { height: "420px" },
            ".cm-scroller": { overflow: "auto" },
          }),
        ],
      }),
    });

    view.current = editor;

    return () => {
      editor.destroy();
      view.current = null;
    };
    // Mount-only on purpose: `value`, `kind` and the theme are pushed in by the
    // effects below rather than by recreating the editor.
  }, []);

  // Only cloud-config gets a language mode. A shell snippet is edited as plain
  // text with line numbers, which is not worth another package to improve -
  // the validation below is the half that catches real mistakes.
  useEffect(() => {
    view.current?.dispatch({
      effects: language.current.reconfigure(kind === "shell" ? [] : yaml()),
    });
  }, [kind]);

  useEffect(() => {
    view.current?.dispatch({
      effects: theme.current.reconfigure(
        resolvedTheme === "dark" ? oneDark : [],
      ),
    });
  }, [resolvedTheme]);

  // Push an external change in, without clobbering the cursor on our own edits.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;

    const current = editor.state.doc.toString();
    if (current === value) return;

    editor.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={host}
        className="overflow-hidden rounded-md border text-sm data-[invalid=true]:border-destructive"
        data-invalid={invalid || !!error}
      />

      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error.line && error.column
            ? t("Line {line}, column {column}: {message}", {
                line: String(error.line),
                column: String(error.column),
                message: error.message,
              })
            : error.message}
        </p>
      ) : null}
    </div>
  );
}
