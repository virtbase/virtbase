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

/**
 * The strings the export document renders.
 *
 * Held here rather than pulled from next-intl because the document is built
 * inside a workflow step, where there is no request context for
 * `getExtracted` to resolve against - the same constraint that makes the email
 * templates carry their own catalog and translate with `use-intl/core`.
 *
 * Locales match `EMAIL_LOCALES`. Anything else falls back to English, which is
 * the source text rather than a placeholder.
 */
export const DOCUMENT_LOCALES = ["en", "de", "fr", "nl"] as const;
export type DocumentLocale = (typeof DOCUMENT_LOCALES)[number];

const en = {
  title: "User Data Report",
  reportInformation: "Report Information",
  userData: "User data",
  sessionInformation: "Session information",
  linkedAccounts: "Linked accounts",
  paymentHistory: "Payment history",
  servers: "Servers",
  backups: "Backups",
  ipAddresses: "IP addresses",
  reverseDns: "Reverse DNS records",
  customImages: "Custom images",
  sshKeys: "SSH keys",
  orders: "Orders",
  invoices: "Invoices",
  passkeys: "Passkeys",
  apiKeys: "API keys",
  emails: "Emails sent to you",
  empty: "No entries recorded.",
  attachments:
    "Your complete records are attached to this document as export.json, alongside a PDF of every invoice.",
  yes: "Yes",
  no: "No",
  exportTimestamp: "Export timestamp:",
  formatVersion: "Format version:",
  id: "ID:",
  displayName: "Display name:",
  emailLabel: "Email:",
  emailConfirmed: "Email confirmed:",
  language: "Language:",
  registrationDate: "Registration date:",
  lastChange: "Last change:",
  creationDate: "Creation date:",
  ipAddressLabel: "IP address:",
  userAgent: "User-Agent:",
  providerId: "Provider ID:",
  permissions: "Permissions:",
  amount: "Amount:",
  status: "Status:",
  method: "Method:",
  name: "Name:",
  operatingSystem: "Operating system:",
  installedAt: "Installed:",
  expiresAt: "Expires:",
  fingerprint: "Fingerprint:",
  publicKey: "Public key:",
  number: "Number:",
  total: "Total:",
  tax: "Tax:",
  paidAt: "Paid:",
  subject: "Subject:",
  sentAt: "Sent:",
  url: "URL:",
  size: "Size:",
  startedAt: "Started:",
  finishedAt: "Finished:",
  hostname: "Hostname:",
  subnet: "Subnet:",
  gateway: "Gateway:",
  type: "Type:",
  deviceType: "Device type:",
  lastRequest: "Last request:",
  prefix: "Prefix:",
  notSet: "not set",
};

/**
 * Keys taken from the English source, values widened to `string`.
 *
 * `typeof en` on its own would pin every value to its English literal, so a
 * translation would not typecheck against it. This keeps the useful half of
 * the inference - a locale missing a key still fails the build - without the
 * useless half.
 */
export type DocumentMessages = Record<keyof typeof en, string>;

const de: DocumentMessages = {
  title: "Bericht über Nutzerdaten",
  reportInformation: "Berichtsinformationen",
  userData: "Nutzerdaten",
  sessionInformation: "Sitzungsinformationen",
  linkedAccounts: "Verknüpfte Konten",
  paymentHistory: "Zahlungsverlauf",
  servers: "Server",
  backups: "Backups",
  ipAddresses: "IP-Adressen",
  reverseDns: "Reverse-DNS-Einträge",
  customImages: "Eigene Images",
  sshKeys: "SSH-Schlüssel",
  orders: "Bestellungen",
  invoices: "Rechnungen",
  passkeys: "Passkeys",
  apiKeys: "API-Schlüssel",
  emails: "An dich gesendete E-Mails",
  empty: "Keine Einträge vorhanden.",
  attachments:
    "Deine vollständigen Daten sind diesem Dokument als export.json beigefügt, zusammen mit einem PDF jeder Rechnung.",
  yes: "Ja",
  no: "Nein",
  exportTimestamp: "Zeitpunkt des Exports:",
  formatVersion: "Formatversion:",
  id: "ID:",
  displayName: "Anzeigename:",
  emailLabel: "E-Mail:",
  emailConfirmed: "E-Mail bestätigt:",
  language: "Sprache:",
  registrationDate: "Registrierungsdatum:",
  lastChange: "Letzte Änderung:",
  creationDate: "Erstellungsdatum:",
  ipAddressLabel: "IP-Adresse:",
  userAgent: "User-Agent:",
  providerId: "Anbieter-ID:",
  permissions: "Berechtigungen:",
  amount: "Betrag:",
  status: "Status:",
  method: "Methode:",
  name: "Name:",
  operatingSystem: "Betriebssystem:",
  installedAt: "Installiert:",
  expiresAt: "Läuft ab:",
  fingerprint: "Fingerabdruck:",
  publicKey: "Öffentlicher Schlüssel:",
  number: "Nummer:",
  total: "Gesamt:",
  tax: "Steuer:",
  paidAt: "Bezahlt:",
  subject: "Betreff:",
  sentAt: "Gesendet:",
  url: "URL:",
  size: "Größe:",
  startedAt: "Gestartet:",
  finishedAt: "Abgeschlossen:",
  hostname: "Hostname:",
  subnet: "Subnetz:",
  gateway: "Gateway:",
  type: "Typ:",
  deviceType: "Gerätetyp:",
  lastRequest: "Letzte Anfrage:",
  prefix: "Präfix:",
  notSet: "nicht gesetzt",
};

const fr: DocumentMessages = {
  title: "Rapport sur les données personnelles",
  reportInformation: "Informations sur le rapport",
  userData: "Données personnelles",
  sessionInformation: "Informations de session",
  linkedAccounts: "Comptes liés",
  paymentHistory: "Historique des paiements",
  servers: "Serveurs",
  backups: "Sauvegardes",
  ipAddresses: "Adresses IP",
  reverseDns: "Enregistrements DNS inverses",
  customImages: "Images personnalisées",
  sshKeys: "Clés SSH",
  orders: "Commandes",
  invoices: "Factures",
  passkeys: "Clés d'accès",
  apiKeys: "Clés API",
  emails: "E-mails qui te sont envoyés",
  empty: "Aucune entrée enregistrée.",
  attachments:
    "Tes données complètes sont jointes à ce document sous le nom export.json, avec un PDF de chaque facture.",
  yes: "Oui",
  no: "Non",
  exportTimestamp: "Date de l'export :",
  formatVersion: "Version du format :",
  id: "ID :",
  displayName: "Nom affiché :",
  emailLabel: "E-mail :",
  emailConfirmed: "E-mail confirmé :",
  language: "Langue :",
  registrationDate: "Date d'inscription :",
  lastChange: "Dernière modification :",
  creationDate: "Date de création :",
  ipAddressLabel: "Adresse IP :",
  userAgent: "Agent utilisateur :",
  providerId: "ID du fournisseur :",
  permissions: "Autorisations :",
  amount: "Montant :",
  status: "Statut :",
  method: "Moyen :",
  name: "Nom :",
  operatingSystem: "Système d'exploitation :",
  installedAt: "Installé :",
  expiresAt: "Expire :",
  fingerprint: "Empreinte :",
  publicKey: "Clé publique :",
  number: "Numéro :",
  total: "Total :",
  tax: "Taxe :",
  paidAt: "Payé :",
  subject: "Objet :",
  sentAt: "Envoyé :",
  url: "URL :",
  size: "Taille :",
  startedAt: "Démarré :",
  finishedAt: "Terminé :",
  hostname: "Nom d'hôte :",
  subnet: "Sous-réseau :",
  gateway: "Passerelle :",
  type: "Type :",
  deviceType: "Type d'appareil :",
  lastRequest: "Dernière requête :",
  prefix: "Préfixe :",
  notSet: "non défini",
};

const nl: DocumentMessages = {
  title: "Rapport over gebruikersgegevens",
  reportInformation: "Rapportinformatie",
  userData: "Gebruikersgegevens",
  sessionInformation: "Sessie-informatie",
  linkedAccounts: "Gekoppelde accounts",
  paymentHistory: "Betalingsgeschiedenis",
  servers: "Servers",
  backups: "Back-ups",
  ipAddresses: "IP-adressen",
  reverseDns: "Reverse-DNS-records",
  customImages: "Eigen images",
  sshKeys: "SSH-sleutels",
  orders: "Bestellingen",
  invoices: "Facturen",
  passkeys: "Passkeys",
  apiKeys: "API-sleutels",
  emails: "Aan jou verzonden e-mails",
  empty: "Geen vermeldingen aanwezig.",
  attachments:
    "Je volledige gegevens zijn als export.json aan dit document toegevoegd, samen met een pdf van elke factuur.",
  yes: "Ja",
  no: "Nee",
  exportTimestamp: "Tijdstip van export:",
  formatVersion: "Formaatversie:",
  id: "ID:",
  displayName: "Weergavenaam:",
  emailLabel: "E-mail:",
  emailConfirmed: "E-mail bevestigd:",
  language: "Taal:",
  registrationDate: "Registratiedatum:",
  lastChange: "Laatste wijziging:",
  creationDate: "Aanmaakdatum:",
  ipAddressLabel: "IP-adres:",
  userAgent: "User-Agent:",
  providerId: "Provider-ID:",
  permissions: "Machtigingen:",
  amount: "Bedrag:",
  status: "Status:",
  method: "Methode:",
  name: "Naam:",
  operatingSystem: "Besturingssysteem:",
  installedAt: "Geïnstalleerd:",
  expiresAt: "Verloopt:",
  fingerprint: "Vingerafdruk:",
  publicKey: "Publieke sleutel:",
  number: "Nummer:",
  total: "Totaal:",
  tax: "Btw:",
  paidAt: "Betaald:",
  subject: "Onderwerp:",
  sentAt: "Verzonden:",
  url: "URL:",
  size: "Grootte:",
  startedAt: "Gestart:",
  finishedAt: "Voltooid:",
  hostname: "Hostnaam:",
  subnet: "Subnet:",
  gateway: "Gateway:",
  type: "Type:",
  deviceType: "Apparaattype:",
  lastRequest: "Laatste verzoek:",
  prefix: "Voorvoegsel:",
  notSet: "niet ingesteld",
};

const CATALOG: Record<DocumentLocale, DocumentMessages> = { en, de, fr, nl };

export const resolveDocumentLocale = (
  locale?: string | null,
): DocumentLocale =>
  DOCUMENT_LOCALES.includes(locale as DocumentLocale)
    ? (locale as DocumentLocale)
    : "en";

export const getDocumentMessages = (locale?: string | null): DocumentMessages =>
  CATALOG[resolveDocumentLocale(locale)];
