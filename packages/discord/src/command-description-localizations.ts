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

import type { APIApplicationCommand } from "discord-api-types/v10";

type DescriptionLocalizations = NonNullable<
  APIApplicationCommand["description_localizations"]
>;

export const inviteCommandDescriptionLocalizations = {
  cs: "Pozvi bota Virtbase na svůj server",
  da: "Inviter Virtbase-botten til din server",
  de: "Lade den Virtbase-Bot auf deinen Server ein",
  el: "Πρόσκλησε το bot Virtbase στον διακομιστή σου",
  "en-GB": "Invite the Virtbase bot to your server",
  "es-419": "Invita el bot de Virtbase a tu servidor",
  "es-ES": "Invita el bot de Virtbase a tu servidor",
  fi: "Kutsu Virtbase-botti palvelimellesi",
  fr: "Invite le bot Virtbase sur ton serveur",
  hu: "Hívd meg a Virtbase botot a szerveredre",
  it: "Invita il bot Virtbase sul tuo server",
  nl: "Nodig de Virtbase-bot uit op je server",
  no: "Inviter Virtbase-botten til serveren din",
  pl: "Zaproś bota Virtbase na swój serwer",
  "pt-BR": "Convida o bot Virtbase para o teu servidor",
  ro: "Invită botul Virtbase pe serverul tău",
  "sv-SE": "Bjud in Virtbase-botten till din server",
  tr: "Virtbase botunu sunucuna davet et",
} as const satisfies DescriptionLocalizations;

export const menuCommandDescriptionLocalizations = {
  cs: "Zobraz hlavní menu se všemi akcemi",
  da: "Vis hovedmenuen med alle tilgængelige handlinger",
  de: "Hauptmenü mit allen verfügbaren Aktionen anzeigen",
  el: "Εμφάνισε το κύριο μενού με όλες τις ενέργειες",
  "en-GB": "Show the main menu with all available actions",
  "es-419": "Muestra el menú principal con todas las acciones",
  "es-ES": "Muestra el menú principal con todas las acciones",
  fi: "Näytä päävalikko ja kaikki toiminnot",
  fr: "Affiche le menu principal avec toutes les actions",
  hu: "Mutasd a főmenüt az összes elérhető művelettel",
  it: "Mostra il menu principale con tutte le azioni",
  nl: "Toon het hoofdmenu met alle beschikbare acties",
  no: "Vis hovedmenyen med alle tilgjengelige handlinger",
  pl: "Pokaż menu główne ze wszystkimi akcjami",
  "pt-BR": "Mostra o menu principal com todas as ações",
  ro: "Afișează meniul principal cu toate acțiunile",
  "sv-SE": "Visa huvudmenyn med alla tillgängliga åtgärder",
  tr: "Tüm işlemlerle ana menüyü göster",
} as const satisfies DescriptionLocalizations;
