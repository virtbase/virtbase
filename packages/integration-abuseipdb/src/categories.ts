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

/** Our own abuse vocabulary, as the signal type suffix spells it. */
export type AbuseCategory =
  | "spam"
  | "phishing"
  | "malware"
  | "port_scan"
  | "ddos"
  | "copyright"
  | "compromised"
  | "other";

/**
 * AbuseIPDB's numeric categories, mapped onto ours.
 *
 * The attack categories - brute force, SQL injection, web app attack, hacking
 * - map to `compromised` rather than `other`. They describe traffic leaving
 * our customer's server, and a box attacking strangers is almost always a box
 * somebody else is now driving. That is the thing the customer needs told.
 *
 * @see https://www.abuseipdb.com/categories
 */
export const ABUSEIPDB_CATEGORIES: Record<
  number,
  { name: string; category: AbuseCategory }
> = {
  1: { name: "DNS Compromise", category: "compromised" },
  2: { name: "DNS Poisoning", category: "other" },
  3: { name: "Fraud Orders", category: "other" },
  4: { name: "DDoS Attack", category: "ddos" },
  5: { name: "FTP Brute-Force", category: "compromised" },
  6: { name: "Ping of Death", category: "ddos" },
  7: { name: "Phishing", category: "phishing" },
  8: { name: "Fraud VoIP", category: "other" },
  9: { name: "Open Proxy", category: "other" },
  10: { name: "Web Spam", category: "spam" },
  11: { name: "Email Spam", category: "spam" },
  12: { name: "Blog Spam", category: "spam" },
  13: { name: "VPN IP", category: "other" },
  14: { name: "Port Scan", category: "port_scan" },
  15: { name: "Hacking", category: "compromised" },
  16: { name: "SQL Injection", category: "compromised" },
  17: { name: "Spoofing", category: "other" },
  18: { name: "Brute-Force", category: "compromised" },
  19: { name: "Bad Web Bot", category: "other" },
  20: { name: "Exploited Host", category: "compromised" },
  21: { name: "Web App Attack", category: "compromised" },
  22: { name: "SSH", category: "compromised" },
  23: { name: "IoT Targeted", category: "compromised" },
};

/**
 * The category to file a case under, given every category the reporters used.
 *
 * The most frequently reported one wins, and `other` never beats a specific
 * category with the same count - a case labelled "other" tells a customer
 * nothing about what to go and fix.
 */
export const dominantCategory = (numeric: readonly number[]): AbuseCategory => {
  const counts = new Map<AbuseCategory, number>();

  for (const value of numeric) {
    const mapped = ABUSEIPDB_CATEGORIES[value]?.category ?? "other";
    counts.set(mapped, (counts.get(mapped) ?? 0) + 1);
  }

  let best: AbuseCategory = "other";
  let bestCount = 0;

  for (const [category, count] of counts) {
    if (count > bestCount || (count === bestCount && "other" === best)) {
      best = category;
      bestCount = count;
    }
  }

  return best;
};

/** Human names, for the signal body. */
export const categoryNames = (numeric: readonly number[]): string[] => [
  ...new Set(
    numeric.map((value) => ABUSEIPDB_CATEGORIES[value]?.name ?? `#${value}`),
  ),
];

/**
 * What to send when reporting one of our own addresses back.
 *
 * Reverse of the map above, picking the category a human would choose. Only
 * ever used behind an operator's explicit confirmation.
 */
export const REPORTABLE_CATEGORIES: Record<AbuseCategory, number[]> = {
  spam: [11],
  phishing: [7],
  malware: [20],
  port_scan: [14],
  ddos: [4],
  copyright: [],
  compromised: [20],
  other: [],
};
