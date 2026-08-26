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

import { resolveOperatingSystem } from "./operating-system";

/**
 * Where the operating system on screen came from.
 *
 * Surfaced to clients rather than kept internal, because the three cases mean
 * genuinely different things to a customer: `detected` is what is running,
 * `iso` and `template` are only what it was installed from and may well be
 * wrong by the time anybody looks.
 */
export type OperatingSystemSource = "detected" | "iso" | "template" | "unknown";

export interface ResolvedOperatingSystem {
  /** Catalog slug, for the logo. `null` when nothing matched. */
  slug: string | null;
  /** What to render as the name. `null` when there is nothing to say. */
  name: string | null;
  /** Path to the logo below `apps/web/public`. `null` when unresolved. */
  icon: string | null;
  source: OperatingSystemSource;
  /** When the guest was last successfully inspected, if it ever was. */
  detected_at: Date | null;
}

/** The `detected_os_*` columns of a server row. */
export interface DetectedOperatingSystemColumns {
  detectedOsId: string | null;
  detectedOsName: string | null;
  detectedOsAt: Date | null;
}

export interface ResolveServerOperatingSystemParams {
  server: DetectedOperatingSystemColumns;
  /** The mounted ISO, when the server has one. */
  mount?: { name?: string | null; url?: string | null } | null;
  /** The template the server was provisioned from. */
  template?: { name?: string | null; icon?: string | null } | null;
}

const UNKNOWN: ResolvedOperatingSystem = {
  slug: null,
  name: null,
  icon: null,
  source: "unknown",
  detected_at: null,
};

/**
 * Decides which operating system a server should be shown as running.
 *
 * The order is detection, then the mounted ISO, then the template. Detection
 * wins because it is the only one of the three that describes what is actually
 * installed - a customer may have replaced the template's operating system, or
 * installed something else entirely from a custom ISO, and neither shows up
 * anywhere else.
 *
 * A stale detection still beats an ISO: during a reinstall the guest agent
 * stops answering, and holding the last known operating system until the new
 * one announces itself is less wrong than flipping the logo to an installer
 * that may never be run to completion.
 *
 * The logo always comes from the catalog and never from guest-supplied data,
 * so a customer cannot point their server's icon at a URL of their choosing.
 * Only the *name* is theirs, and it arrives already sanitised.
 */
export const resolveServerOperatingSystem = ({
  server,
  mount,
  template,
}: ResolveServerOperatingSystemParams): ResolvedOperatingSystem => {
  const { detectedOsId, detectedOsName, detectedOsAt } = server;

  if (detectedOsAt && (detectedOsId || detectedOsName)) {
    const descriptor = resolveOperatingSystem({
      id: detectedOsId,
      text: detectedOsName,
    });

    return {
      slug: descriptor?.slug ?? null,
      // The guest's own PRETTY_NAME is more specific than the catalog label
      // ("Debian GNU/Linux 13 (trixie)" against "Debian"), so it is preferred
      // wherever the guest bothered to set one.
      name: detectedOsName ?? descriptor?.label ?? null,
      icon: descriptor?.icon ?? null,
      source: "detected",
      detected_at: detectedOsAt,
    };
  }

  if (mount?.name || mount?.url) {
    const descriptor = resolveOperatingSystem({
      text: [mount.name, mount.url],
    });

    return {
      slug: descriptor?.slug ?? null,
      name: mount.name ?? descriptor?.label ?? null,
      icon: descriptor?.icon ?? null,
      source: "iso",
      detected_at: null,
    };
  }

  if (template?.name || template?.icon) {
    const descriptor = resolveOperatingSystem({
      text: [template.name, template.icon],
    });

    return {
      slug: descriptor?.slug ?? null,
      name: template.name ?? descriptor?.label ?? null,
      // The template's own icon is an operator-managed URL and stays
      // authoritative for it - the catalog is only the fallback.
      icon: template.icon ?? descriptor?.icon ?? null,
      source: "template",
      detected_at: null,
    };
  }

  return UNKNOWN;
};
