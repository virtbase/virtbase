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

export const emailVerifiedNameLocalizations = {
  cs: "E-mail ověřen",
  da: "E-mail bekræftet",
  de: "E-Mail verifiziert",
  el: "Επαληθευμένο email",
  "en-GB": "Email Verified",
  "es-419": "Correo verificado",
  "es-ES": "Correo verificado",
  fi: "Sähköposti vahvistettu",
  fr: "E-mail vérifié",
  hu: "E-mail ellenőrizve",
  it: "Email verificata",
  nl: "E-mail geverifieerd",
  no: "E-post verifisert",
  pl: "Zweryfikowany e-mail",
  "pt-BR": "E-mail verificado",
  ro: "E-mail verificat",
  "sv-SE": "E-post verifierad",
  tr: "E-posta doğrulandı",
} as const satisfies NameLocalizations;

export const emailVerifiedDescriptionLocalizations = {
  cs: "E-mailová adresa je ověřena",
  da: "E-mailadressen er bekræftet",
  de: "Die E-Mail-Adresse ist verifiziert",
  el: "Η διεύθυνση email είναι επαληθευμένη",
  "en-GB": "Email address is verified",
  "es-419": "La dirección de correo está verificada",
  "es-ES": "La dirección de correo está verificada",
  fi: "Sähköpostiosoite on vahvistettu",
  fr: "L'adresse e-mail est vérifiée",
  hu: "Az e-mail cím meg van erősítve",
  it: "L'indirizzo email è verificato",
  nl: "E-mailadres is geverifieerd",
  no: "E-postadressen er verifisert",
  pl: "Adres e-mail jest zweryfikowany",
  "pt-BR": "O endereço de e-mail está verificado",
  ro: "Adresa de e-mail este verificată",
  "sv-SE": "E-postadressen är verifierad",
  tr: "E-posta adresi doğrulanmıştır",
} as const satisfies DescriptionLocalizations;

export const registrationDateNameLocalizations = {
  cs: "Dny od registrace",
  da: "Dage siden registrering",
  de: "Tage seit Registrierung",
  el: "Ημέρες από την εγγραφή",
  "en-GB": "Registered Days",
  "es-419": "Días desde el registro",
  "es-ES": "Días desde el registro",
  fi: "Päiviä rekisteröitymisestä",
  fr: "Jours depuis l'inscription",
  hu: "Napok a regisztráció óta",
  it: "Giorni dalla registrazione",
  nl: "Dagen sinds registratie",
  no: "Dager siden registrering",
  pl: "Dni od rejestracji",
  "pt-BR": "Dias desde o cadastro",
  ro: "Zile de la înregistrare",
  "sv-SE": "Dagar sedan registrering",
  tr: "Kayıttan beri geçen gün",
} as const satisfies NameLocalizations;

export const registrationDateDescriptionLocalizations = {
  cs: "Počet dnů od registrace",
  da: "Dage siden registrering",
  de: "Tage seit der Registrierung",
  el: "Ημέρες από την εγγραφή",
  "en-GB": "Days since registration",
  "es-419": "Días desde el registro",
  "es-ES": "Días desde el registro",
  fi: "Päiviä rekisteröitymisestä",
  fr: "Jours depuis l'inscription",
  hu: "Napok a regisztráció óta",
  it: "Giorni dalla registrazione",
  nl: "Dagen sinds registratie",
  no: "Dager siden registrering",
  pl: "Dni od rejestracji",
  "pt-BR": "Dias desde o cadastro",
  ro: "Zile de la înregistrare",
  "sv-SE": "Dagar sedan registrering",
  tr: "Kayıttan bu yana geçen gün sayısı",
} as const satisfies DescriptionLocalizations;
