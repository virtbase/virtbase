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

// Import env files to validate at build time
import "@/env";

import { withSentryConfig } from "@sentry/nextjs";
import { ADMIN_DOMAIN, APP_DOMAIN, PUBLIC_DOMAIN } from "@virtbase/utils";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withWorkflow } from "workflow/next";
import { contentSecurityPolicy } from "@/lib/csp";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.virtbase.localhost"],
  cacheComponents: true,
  crossOrigin: "anonymous",
  devIndicators: {
    position: "bottom-right",
  },
  experimental: {
    authInterrupts: true,
    globalNotFound: true,
    instantNavigationDevToolsToggle: true,
    optimizePackageImports: ["radix-ui"],
    sri: {
      algorithm: "sha384",
    },
    // turbopackFileSystemCacheForDev: true,
  },
  headers: async () => [
    {
      source: "/:path*",
      // Default security headers (applies to all routes)
      headers: [
        {
          key: "Content-Security-Policy",
          value: contentSecurityPolicy,
        },
        {
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin-allow-popups",
        },

        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
        {
          key: "Referrer-Policy",
          value: "no-referrer-when-downgrade",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Download-Options",
          value: "noopen",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "X-XSS-Protection",
          value: "1; mode=block",
        },
      ],
    },
    {
      source: "/:path*",
      has: [
        {
          type: "host",
          value: new URL(ADMIN_DOMAIN).hostname,
        },
      ],
      headers: [
        {
          key: "X-Robots-Tag",
          value: "noindex, nofollow",
        },
      ],
    },
    {
      source: "/web-app-manifest-(.*).png",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=2592000",
        },
      ],
    },
    {
      source: "/assets/static/(.*)",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
  ],
  images: {
    formats: ["image/avif", "image/webp"],
    // Tailwind CSS default breakpoints (https://tailwindcss.com/docs/responsive-design)
    deviceSizes: [640, 768, 1024, 1280, 1536],
    minimumCacheTTL: 2678400, // 31 days
  },
  poweredByHeader: false,
  redirects: async () => [
    {
      source: "/legal",
      has: [
        {
          type: "host",
          value: new URL(PUBLIC_DOMAIN).hostname,
        },
      ],
      destination: "/legal/notice",
      permanent: true,
    },
    {
      source: "/servers/:id",
      has: [
        {
          type: "host",
          value: new URL(APP_DOMAIN).hostname,
        },
      ],
      destination: "/servers/:id/overview",
      permanent: true,
    },
  ],
  rewrites: async () => [
    // Legacy API rewrites
    {
      source: "/api/v1/kvm/:path*",
      has: [
        {
          type: "host",
          value: new URL(PUBLIC_DOMAIN).hostname,
        },
      ],
      destination: "/api/v1/servers/:path*",
    },
  ],
  transpilePackages: [
    "@virtbase/api",
    "@virtbase/auth",
    "@virtbase/db",
    "@virtbase/email",
    "@virtbase/ui",
    "@virtbase/utils",
    "@virtbase/validators",
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
};

const withNextIntl = createNextIntlPlugin({
  experimental: {
    srcPath: ["./src/app", "./src/features", "./src/ui"],
    extract: {
      sourceLocale: "en",
    },
    messages: {
      path: "./src/i18n/messages",
      locales: "infer",
      format: "po",
      precompile: true,
    },
  },
});

const configWithNextIntl = withNextIntl(nextConfig);

const withMDX = createMDX();

const configWithMDX = withMDX(configWithNextIntl);

const sentrifiedConfig = withSentryConfig(configWithMDX, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  sentryUrl: process.env.SENTRY_URL,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/science",
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
    automaticVercelMonitors: true,
  },
});

const finalConfig = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? sentrifiedConfig
  : configWithMDX;

const _configWithWorkflow = withWorkflow(finalConfig, {
  workflows: {
    lazyDiscovery: true,
  },
});

export default finalConfig;
