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

import type { APIApplicationRoleConnectionMetadata } from "discord-api-types/v10";

type NameLocalizations = NonNullable<
  APIApplicationRoleConnectionMetadata["name_localizations"]
>;

type DescriptionLocalizations = NonNullable<
  APIApplicationRoleConnectionMetadata["description_localizations"]
>;

export const activeServersCountNameLocalizations = {
  cs: "Aktivní servery",
  da: "Aktive servere",
  de: "Aktive Server",
  el: "Ενεργοί διακομιστές",
  "en-GB": "Active Servers",
  "es-419": "Servidores Activos",
  "es-ES": "Servidores Activos",
  fi: "Aktiiviset Palvelimet",
  fr: "Serveurs Actifs",
  hu: "Aktív szerverek",
  it: "Server Attivi",
  nl: "Actieve Servers",
  no: "Aktive Servere",
  pl: "Aktywne serwery",
  "pt-BR": "Servidores Ativos",
  ro: "Servere Active",
  "sv-SE": "Aktiva servrar",
  tr: "Aktif Sunucular",
} as const satisfies NameLocalizations;

export const activeServersCountDescriptionLocalizations = {
  cs: "Počet aktivních serverů",
  da: "Antal aktive servere",
  de: "Anzahl aktiver Server",
  el: "Αριθμός ενεργών διακομιστών",
  "en-GB": "Number of active servers",
  "es-419": "Número de servidores activos",
  "es-ES": "Número de servidores activos",
  fi: "Aktiivisten palvelinten määrä",
  fr: "Nombre de serveurs actifs",
  hu: "Aktív szerverek száma",
  it: "Numero di server attivi",
  nl: "Aantal actieve servers",
  no: "Antall aktive servere",
  pl: "Liczba aktywnych serwerów",
  "pt-BR": "Número de servidores ativos",
  ro: "Număr de servere active",
  "sv-SE": "Antal aktiva servrar",
  tr: "Aktif sunucuların sayısı",
} as const satisfies DescriptionLocalizations;
