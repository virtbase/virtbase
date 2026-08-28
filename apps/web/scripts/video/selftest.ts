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

import { recordEpisode } from "./lib/studio";

/**
 * Records fifteen seconds against a page that is not the app.
 *
 * The episodes need a database, a Proxmox cluster and a dev server; the
 * toolchain underneath them needs none of that. When a take comes out wrong it
 * is worth knowing which half broke, and this is the half that can be checked
 * in fifteen seconds on a laptop with nothing running.
 *
 *   bun script video/selftest
 */
const PAGE = `
<main style="font:16px/1.5 system-ui,sans-serif;color:#0b0d12;background:#f6f7f9;
             margin:0;padding:56px;min-height:100vh;box-sizing:border-box">
  <h1 style="font-size:28px;margin:0 0 24px">Firewall Regeln</h1>
  <div id="card" style="background:#fff;border:1px solid #e3e5ea;border-radius:12px;
                        overflow:hidden;max-width:900px">
    <div style="display:flex;justify-content:space-between;padding:20px 24px;
                border-bottom:1px solid #e3e5ea">
      <strong>Regeln</strong>
      <button id="add" style="border:1px solid #d5d8de;background:#fff;border-radius:8px;
                              padding:6px 14px;font:inherit;cursor:pointer">Regel erstellen</button>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <tbody>
        <tr><td style="padding:14px 24px">ACCEPT</td><td>tcp</td>
            <td id="port" style="font-variant-numeric:tabular-nums">443</td>
            <td style="padding-right:24px">HTTPS</td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid #eef0f3">DROP</td>
            <td style="border-top:1px solid #eef0f3">tcp</td>
            <td style="border-top:1px solid #eef0f3">22</td>
            <td style="border-top:1px solid #eef0f3;padding-right:24px">SSH</td></tr>
      </tbody>
    </table>
  </div>
  <p id="result" style="color:#5b6170"></p>
</main>`;

const output = await recordEpisode({
  name: "selftest",
  viewport: { width: 1280, height: 720 },
  beats: [
    {
      say: "Dies ist eine Aufnahme, mit der die Technik geprüft wird.",
      act: async (stage) => {
        await stage.pointAt("#card");
      },
    },
    {
      say: "Der Zeiger bewegt sich, und die Ansicht kann näher heranfahren.",
      act: async (stage) => {
        await stage.focusOn("#port", 1.8);
        await stage.pointAt("#port");
      },
    },
    {
      say: "Ein Klick wird sichtbar, und danach geht die Ansicht zurück.",
      tail: 700,
      act: async (stage) => {
        await stage.click("#add");
        await stage.hold(400);
        await stage.wide();
      },
    },
  ],
  open: async (stage) => {
    await stage.goto("about:blank");
    await stage.page.setContent(PAGE);
    await stage.page.evaluate(() => {
      document.querySelector("#add")?.addEventListener("click", () => {
        const result = document.querySelector("#result");
        if (result) result.textContent = "Regel wurde erstellt.";
      });
    });
    await stage.hold(400);
  },
});

console.log(`\n${output}`);
