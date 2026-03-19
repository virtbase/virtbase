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

type SecurityPolicyEntry = {
  "default-src"?: string[];
  "script-src"?: string[];
  "connect-src"?: string[];
  "style-src"?: string[];
  "img-src"?: string[];
  "font-src"?: string[];
  "object-src"?: string[];
  "media-src"?: string[];
  "frame-src"?: string[];
  "worker-src"?: string[];
  "manifest-src"?: string[];
  "frame-ancestors"?: string[];
  "base-uri"?: string[];
  "form-action"?: string[];
  "report-uri"?: string[];
};

/**
 * Merges multiple security policies into a single policy string.
 */
function generateCSPHeader(policies: SecurityPolicyEntry[]): string {
  const combined = policies.reduce((combined, policy) => {
    Object.keys(policy).forEach((directive) => {
      const sources = Array.from(
        // @ts-expect-error
        new Set([...(combined[directive] ?? []), ...policy[directive]]),
      );
      // @ts-expect-error
      combined[directive] = sources;
    });

    return combined;
  }, {});

  const baseDirectives = Object.entries(combined).map(
    ([directive, sources]) => `${directive} ${sources.sort().join(" ")}`,
  );

  return [
    ...baseDirectives,
    process.env.NODE_ENV !== "development" ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

const defaultPolicy = {
  "default-src": ["'self'"],
  "script-src":
    process.env.NODE_ENV === "development"
      ? ["'self'", "'unsafe-eval'", "'unsafe-inline'"]
      : ["'self'", "'unsafe-inline'"],
  "worker-src": ["'self'", "blob:"],
  "connect-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'"],
  "manifest-src": ["'self'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
} satisfies SecurityPolicyEntry;

const vercelLivePolicy = {
  "connect-src": [
    "https://vercel.live",
    "https://*.pusher.com",
    "wss://*.pusher.com",
  ],
  "img-src": ["https://vercel.com"],
  "script-src": ["https://vercel.live"],
  "style-src": ["https://vercel.live"],
  "font-src": ["https://vercel.live"],
  "frame-src": ["https://vercel.live"],
} satisfies SecurityPolicyEntry;

const noVNCPolicy = {
  "frame-src": ["https://novnc.com/noVNC/vnc.html"],
} satisfies SecurityPolicyEntry;

const avatarPolicy = {
  "img-src": [
    "https://seccdn.libravatar.org/avatar/",
    "https://avatars.githubusercontent.com",
    "https://*.googleusercontent.com",
    "https://cdn.discordapp.com",
  ],
} satisfies SecurityPolicyEntry;

const sentryPolicy = {
  "connect-src": ["https://sentry.virtbase.com", "https://*.sentry.io"],
  "script-src": ["https://*.sentry-cdn.com"],
  // Send CSP violations to Sentry
  // TODO: Make this dynamic
  "report-uri": [
    "https://sentry.virtbase.com/api/2/security/?sentry_key=11183249f1049858d3c8eec4fd0ea40f",
  ],
} satisfies SecurityPolicyEntry;

const stripePolicy = {
  "script-src": [
    "https://*.js.stripe.com",
    "https://js.stripe.com",
    "https://maps.googleapis.com",
    "https://checkout.stripe.com",
  ],
  "frame-src": [
    "https://*.js.stripe.com",
    "https://js.stripe.com",
    "https://hooks.stripe.com",
    "https://checkout.stripe.com",
  ],
  "connect-src": [
    "https://api.stripe.com",
    "https://maps.googleapis.com",
    "https://checkout.stripe.com",
    "https://fonts.googleapis.com",
  ],
  "img-src": ["https://*.stripe.com"],
} satisfies SecurityPolicyEntry;

const scalarApiReferencePolicy = {
  "object-src": ["blob:"],
  "frame-src": ["blob:"],
} satisfies SecurityPolicyEntry;

export const contentSecurityPolicy = generateCSPHeader([
  defaultPolicy,
  vercelLivePolicy,
  avatarPolicy,
  sentryPolicy,
  stripePolicy,
  noVNCPolicy,
  scalarApiReferencePolicy,
]);
