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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Logo } from "@virtbase/ui/logo";
import { APP_NAME, PUBLIC_DOMAIN } from "@virtbase/utils";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import z4 from "zod/v4";

const opengraphSchema = z4.object({
  title: z4.string(),
  subtitle: z4.string().optional(),
  slug: z4.string().optional(),
  theme: z4.enum(["light", "dark"]).optional().default("dark"),
});

export const contentType = "image/png";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const { data: params, success } = opengraphSchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!success) {
    return new Response("Invalid parameters.", { status: 400 });
  }

  // Font loading, process.cwd() is Next.js project directory
  const Geist = await readFile(join(process.cwd(), "src/app/api/og/Geist.ttf"));

  const GeistMono = await readFile(
    join(process.cwd(), "src/app/api/og/GeistMono.ttf"),
  );

  const heading = params.title;
  const trueHeading =
    heading.length > 140 ? `${heading.substring(0, 140)}...` : heading;

  const paint = params.theme === "light" ? "#000" : "#fff";
  const background = params.theme === "light" ? "#fff" : "#000";

  const fontSize = trueHeading.length > 100 ? "30px" : "60px";

  return new ImageResponse(
    <div
      tw="flex w-full relative flex-col p-12"
      style={{
        color: paint,
        backgroundColor: "transparent",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 -20px 80px -20px rgba(28, 12, 12, 0.1) inset",
        background,
      }}
    >
      <div
        tw={`relative flex flex-col w-full h-full border-2 border-[${paint}]/20 p-10`}
      >
        {/** Corners */}
        {[
          { position: { top: "-9px", right: "-9px" } },
          { position: { top: "-9px", left: "-9px" } },
          { position: { bottom: "-9px", left: "-9px" } },
          { position: { bottom: "-9px", right: "-9px" } },
        ].map((item, index) => (
          <svg
            key={index}
            role="presentation"
            style={{
              position: "absolute",
              ...item.position,
            }}
            width="17"
            height="17"
            fill="none"
          >
            <path
              d="M7 1a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V8a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8a1 1 0 0 1-1-1V1z"
              fill={paint}
              opacity={0.8}
            />
          </svg>
        ))}
        <div tw="flex flex-col flex-1 py-10">
          <Logo width={100} height={65} />
          {params.subtitle && (
            <div
              style={{ fontFamily: "GeistMono", fontWeight: "normal" }}
              tw="relative flex mt-10 text-xl uppercase font-bold items-center"
            >
              {params.subtitle}
            </div>
          )}
          <div
            tw="flex max-w-[70%] mt-5 tracking-tighter leading-[1.1] text-[30px] font-bold"
            style={{
              fontWeight: "bold",
              marginLeft: "-3px",
              fontSize,

              fontFamily: "GeistMono",
            }}
          >
            {trueHeading}
          </div>
        </div>
        <div tw="flex items-center w-full justify-between text-xl">
          <span
            tw="flex text-xl"
            style={{ fontFamily: "GeistSans", fontWeight: "semibold" }}
          >
            {APP_NAME}
          </span>
          <span
            style={{
              fontFamily: "GeistSans",
            }}
          >
            {`${new URL(PUBLIC_DOMAIN).hostname}${params.slug || ""}`}
          </span>
        </div>
      </div>
    </div>,
    {
      headers: {
        "Cache-Control": "public, immutable, no-transform, max-age=31536000",
      },
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Geist",
          data: Geist,
          style: "normal",
          weight: 400,
        },
        {
          name: "GeistMono",
          data: GeistMono,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}
