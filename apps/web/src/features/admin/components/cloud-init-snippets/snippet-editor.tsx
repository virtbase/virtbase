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

import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { useTheme } from "@virtbase/ui/theme-provider";
import { validateSnippetContent } from "@virtbase/utils";
import { useExtracted } from "next-intl";
import { useMemo } from "react";

interface SnippetEditorProps {
  value: string;
  onChange: (value: string) => void;
  kind: "cloud-config" | "shell";
  "aria-invalid"?: boolean;
}

/**
 * The snippet body editor.
 *
 * Loaded through `next/dynamic` by its wrapper so CodeMirror stays out of every
 * admin bundle that is not this one. Syntax highlighting is the smaller half of
 * what this adds - the error line underneath is what stops a broken snippet
 * being saved and discovered at the next provisioning run.
 */
export default function SnippetEditor({
  value,
  onChange,
  kind,
  "aria-invalid": invalid,
}: SnippetEditorProps) {
  const t = useExtracted();
  const { resolvedTheme } = useTheme();

  // Only cloud-config gets a language mode. A shell snippet is edited as plain
  // text with line numbers, which is not worth two extra packages to improve -
  // the validation below is the half that catches real mistakes.
  const extensions = useMemo(() => (kind === "shell" ? [] : [yaml()]), [kind]);

  // Parsed on every keystroke: the document is small and the parser is fast,
  // and an error that appears as you type is worth far more than one on save.
  const error = useMemo(
    () => validateSnippetContent(value, kind),
    [value, kind],
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        className="overflow-hidden rounded-md border data-[invalid=true]:border-destructive"
        data-invalid={invalid || !!error}
      >
        <CodeMirror
          value={value}
          onChange={onChange}
          height="420px"
          theme={resolvedTheme === "dark" ? oneDark : "light"}
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            autocompletion: false,
            // cloud-config is indentation-sensitive and a stray tab is a parse
            // error, so tabs insert spaces rather than a literal tab.
            tabSize: 2,
          }}
        />
      </div>

      {error ? (
        <p className="font-mono text-destructive text-xs" role="alert">
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
