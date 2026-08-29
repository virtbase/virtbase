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

import type { LocalizedIntegrationText } from "@virtbase/integration-sdk";
import { getExtracted } from "next-intl/server";

/**
 * Admin console text for this integration.
 *
 * The literals live here, rather than being passed a translator, because
 * next-intl extracts from `getExtracted` call sites — a `t` received as an
 * argument is invisible to it.
 */
export const localizeAlertmanager =
  async (): Promise<LocalizedIntegrationText> => {
    const t = await getExtracted();

    return {
      name: t("Alertmanager"),
      description: t(
        "Receives alerts from Prometheus Alertmanager or Grafana and turns them into abuse cases and operator notifications.",
      ),
      fields: {
        payloadFormat: {
          label: t("Payload format"),
          help: t(
            "Which shape the sender speaks. Grafana sends the Alertmanager shape with extras.",
          ),
        },
        defaultSeverity: {
          label: t("Default severity"),
          help: t("Used when an alert carries no severity label."),
        },
        ingestToken: {
          label: t("Ingest token"),
          help: t(
            "Sent as an Authorization bearer token. Generate one with `openssl rand -hex 32`.",
          ),
        },
      },
    };
  };
