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

import { cn } from "@virtbase/ui";
import { Discord, LucideEye } from "@virtbase/ui/icons";
import NextImage from "next/image";
import { useExtracted } from "next-intl";

/** Discord's brand blurple. The one colour that makes this read as Discord. */
const BLURPLE = "#5865F2";

/**
 * The block scale the bot really draws its charts with.
 *
 * Copied rather than imported: `@virtbase/integration-discord` is a Layer 4
 * plug-in and the marketing page is not allowed to reach into one. Eight
 * characters are a cheaper duplicate than a boundary violation.
 */
const spark = (seed: number, length = 14): string => {
  const blocks = "▁▂▃▄▅▆▇█";

  return Array.from({ length }, (_, index) => {
    // Deterministic: this renders during a cached build, so anything random
    // would change the markup between a server render and a client hydrate.
    //
    // Two periods that do not divide each other, so neighbouring columns differ
    // by more than a hair. A gentle wave rendered at this size reads as a solid
    // bar rather than as a chart.
    const wave =
      Math.sin((index + seed) / 1.7) * 0.62 +
      Math.sin((index + seed) / 4.3) * 0.38;
    const level = Math.round(((wave + 1) / 2) * (blocks.length - 1));

    return blocks[Math.max(0, Math.min(blocks.length - 1, level))];
  }).join("");
};

/**
 * A still of the bot answering `/menu`.
 *
 * Built as a Discord message rather than as a generic card: the avatar, the APP
 * tag, the coloured embed rail and the ephemeral note are what make it read as
 * "this happens in Discord" at a glance, which a bordered box with a heading
 * does not. The slash-command palette beside it is the other half of the
 * promise — that the whole thing is reachable by typing one word.
 */
export default function DiscordBotDemo(props: React.ComponentProps<"div">) {
  const t = useExtracted();

  const metrics: [string, string, string][] = [
    [t("CPU"), spark(0), "12%"],
    [t("RAM"), spark(4), "3.1 / 8 GB"],
    [t("NET"), spark(9), "878 kB/s"],
  ];

  const commands: [string, string][] = [
    ["/menu", t("Manage your servers")],
    ["/help", t("What this bot can do")],
    ["/invite", t("Add it to another server")],
  ];

  const actions = [
    `⚡ ${t("Power")}`,
    `💾 ${t("Backups")}`,
    `🛡️ ${t("Firewall")}`,
    `🌐 ${t("rDNS")}`,
    `📈 ${t("Statistics")}`,
  ];

  return (
    // No card around it: the message and the palette carry their own frames,
    // and a third border around those read as a screenshot of a screenshot.
    <div
      {...props}
      className={cn(
        "grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:gap-8",
        props.className,
      )}
    >
      {/* The message, as Discord lays one out: avatar, then everything else. */}
      <div className="flex gap-3">
        <div
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: BLURPLE }}
        >
          <Discord className="size-5 text-white" />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-sm">Virtbase</span>
            <span
              className="rounded px-1 py-px font-medium text-[10px] text-white uppercase"
              style={{ backgroundColor: BLURPLE }}
            >
              {t("App")}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("Today at 21:04")}
            </span>
          </div>

          {/* The embed. The rail down its left edge is the giveaway. */}
          <div
            className="rounded-md border border-border border-l-4 bg-muted/40 p-3"
            style={{ borderLeftColor: BLURPLE }}
          >
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="font-semibold text-sm">web-01</span>
            </div>

            <dl className="mt-2.5 space-y-1">
              {metrics.map(([label, chart, value]) => (
                <div key={label} className="flex items-end gap-2 text-xs">
                  <dt className="w-8 shrink-0 font-medium text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span
                      aria-hidden="true"
                      className="truncate font-mono text-[15px] leading-none"
                      style={{ color: BLURPLE }}
                    >
                      {chart}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {value}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <NextImage
                src="/web-app-manifest-192x192.png"
                alt=""
                width={16}
                height={16}
                className="size-4 shrink-0 rounded-full"
                aria-hidden="true"
              />
              <span className="truncate">
                {t("Virtbase - Hosting, but secure.")}
              </span>
              <span aria-hidden="true">•</span>
              <span className="shrink-0">{t("Today at 21:04")}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {actions.map((label, index) => (
              <span
                key={label}
                className={cn(
                  "rounded border px-2 py-1 text-xs",
                  index === 0
                    ? "border-transparent text-white"
                    : "border-border bg-muted/50 text-foreground/80",
                )}
                style={index === 0 ? { backgroundColor: BLURPLE } : undefined}
              >
                {label}
              </span>
            ))}
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <LucideEye className="size-3.5 shrink-0" aria-hidden="true" />
            {t("Only you can see this")}
          </p>
        </div>
      </div>

      {/* Discord's slash-command palette: the other half of the promise. */}
      <div className="hidden flex-col justify-center lg:flex">
        <div className="overflow-hidden rounded-md border border-border bg-muted/40">
          <p className="border-border border-b px-3 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            {t("Commands")}
          </p>
          <ul className="divide-y divide-border">
            {commands.map(([name, description], index) => (
              <li
                key={name}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  index === 0 && "bg-foreground/4",
                )}
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded font-bold text-[13px] text-white"
                  style={{ backgroundColor: BLURPLE }}
                >
                  /
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs">
                    {name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
