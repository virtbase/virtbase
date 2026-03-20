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

import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";

type TRPC = ReturnType<typeof useTRPC>;
type Options = Parameters<TRPC["invoices"]["download"]["mutationOptions"]>[0];

interface DownloadInvoiceOptions {
  mutationConfig?: Options;
}

export const useDownloadInvoice = ({
  mutationConfig,
}: DownloadInvoiceOptions = {}) => {
  const trpc = useTRPC();

  const { onSuccess, ...rest } = mutationConfig ?? {};

  return useMutation(
    trpc.invoices.download.mutationOptions({
      ...rest,
      onSuccess: async (data, ...args) => {
        const anchor = document.createElement("a");

        anchor.style = "display: none";
        anchor.ariaHidden = "true";

        const byteArray = base64UrlToUint8Array(data.content);
        const blob = new Blob([byteArray], { type: data.content_type });
        const url = window.URL.createObjectURL(blob);
        anchor.href = url;
        anchor.download = data.filename;

        document.body.appendChild(anchor);
        anchor.click();

        window.URL.revokeObjectURL(url);
        document.body.removeChild(anchor);

        onSuccess?.(data, ...args);
      },
    }),
  );
};

function base64UrlToUint8Array(base64url: string) {
  // Convert base64url to base64
  const base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");

  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}
