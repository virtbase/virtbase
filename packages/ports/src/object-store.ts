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

export interface PutObjectInput {
  /** Store-relative path, e.g. `gdpr-exports/usr_123/2026-08-09.zip`. */
  key: string;
  body: ArrayBuffer | Uint8Array | ReadableStream;
  contentType: string;
  /** Delete the object automatically after this instant, where supported. */
  expiresAt?: Date;
}

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
  updatedAt: Date;
}

/**
 * Blob storage for artefacts that do not belong in Postgres: GDPR export
 * archives, generated inventory PDFs, the ISO catalog.
 *
 * `signedUrl` is the only sanctioned way to hand a blob to a browser — nothing
 * should proxy large files through the Next.js runtime.
 */
export interface ObjectStore {
  put(input: PutObjectInput): Promise<StoredObject>;
  head(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
