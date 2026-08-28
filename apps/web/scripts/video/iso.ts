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

import { join } from "node:path";
/*
 * Read rather than retyped, for the same reason the firewall episode reads its
 * protocol count: a number said out loud in a video is the one place a stale
 * constant cannot be caught by reading the diff.
 */
import {
  ISO_CATALOG,
  ISO_DOWNLOAD_EXPIRATION_MINUTES,
  MAX_ACTIVE_ISO_DOWNLOADS_PER_USER,
} from "@virtbase/utils";
import { appUrl } from "../../e2e/support/urls";
import { prependCover } from "./lib/render";
import { CUSTOMER_ID, ensureSession, prepareIsoScene } from "./lib/scene";
import type { Beat, Stage, Take } from "./lib/studio";
import { recordEpisode } from "./lib/studio";
import { renderThumbnail } from "./lib/thumbnail";
import { ensureTools, workspaceFor } from "./lib/tools";
import { captions } from "./lib/voice";

/**
 * Episode two: custom ISO images.
 *
 * The firewall episode is about a page; this one is about a path that crosses
 * two of them. An image is created in the account settings and mounted on the
 * server, and the interesting parts are the ones a screenshot cannot show: what
 * the catalogue is, what happens to a checksum, and why a boot medium expires
 * after an hour.
 *
 *   bun script video/iso
 */
/*
 * Not simply `[role="dialog"]`: Next's dev error overlay is one too, and it is
 * in the DOM whether or not it is showing. Matching both makes every wait a
 * strict-mode violation the first time the dev server logs a warning.
 */
const dialog = '[role="dialog"]:not([data-nextjs-dialog])';

/** The card whose title is exactly this. */
const card = (title: string) =>
  `[data-slot="card"]:has([data-slot="card-title"]:text-is("${title}"))`;

const imagesCard = card("Eigene ISO-Abbilder");

/**
 * The create button on the card, not the one inside the dialog.
 *
 * Both say "Benutzerdefiniertes Image erstellen" - the footer button that opens
 * the dialog and the submit button that closes it - so this one is scoped to
 * the card or it matches two elements the moment the dialog is open.
 */
const createButton = `${imagesCard} button:has-text("Benutzerdefiniertes Image erstellen")`;

/** The catalogue tile for an image, by the name printed on it. */
const catalogueCard = (name: string) =>
  `${dialog} button[aria-pressed]:has-text("${name}")`;

const search = `${dialog} input[type="search"]`;

/**
 * The image the episode downloads.
 *
 * Alpine rather than Debian, and the reason is the recording rather than the
 * product: the scene resets to an empty account so the episode can film an
 * image being created, which means every take downloads this for real, twice -
 * once per cut. `alpine-virt` is about 60 MB against a Debian netinst's 755,
 * and it still carries a published SHA-256, so the checksum half of the episode
 * stays true. It is also a fair pick for the feature: a small rescue system is
 * exactly what people boot a custom ISO for.
 */
const CATALOGUE_PICK = "Alpine";

/** One row of the image list on the account page. */
const imageRow = `${imagesCard} [data-testid="item-row"]`;

/**
 * The `...` menu in the server's action row.
 *
 * Found through the restart button rather than by index: the page carries three
 * dropdown triggers - the language switcher, the account menu and this one -
 * and the only stable thing about this one is that it sits in the same button
 * group as the power actions. It has no accessible name of its own.
 */
const actionsMenu = (stage: Stage) =>
  stage.page
    .getByRole("button", { name: "Neustart" })
    .first()
    .locator("xpath=..")
    .locator('button[data-slot="dropdown-menu-trigger"]');

const storageState = await ensureSession();

const serverId = await prepareIsoScene({
  userId: CUSTOMER_ID,
  rebuild: process.argv.includes("--rebuild"),
});

const imagesUrl = appUrl("/account/settings/custom-images");
const serverUrl = appUrl(`/servers/${serverId}`);

/**
 * Asks the API about the image the episode just created.
 *
 * Deliberately the same endpoint the dropdown's poller calls, because that call
 * is what *persists* the finished state: Proxmox reports a task's outcome once,
 * and `iso.status` is where the dashboard writes it down. Polling it here means
 * the wait no longer depends on a component being mounted to make progress.
 *
 * Cookies come from the browser context, so this is the filmed customer asking
 * about their own image rather than a second, differently authorised client.
 */
async function isoProgress(
  stage: Stage,
): Promise<{ done: boolean; failed: boolean; percentage: number | null }> {
  /*
   * Fetched inside the page, not through `page.request`. Playwright's request
   * context resolves hostnames with Node, and `app.virtbase.localhost` is a
   * name only Chromium invents an address for - so the Node-side call died on
   * ECONNREFUSED while the browser two lines away was talking to the same
   * origin quite happily. A relative URL also means the session cookie rides
   * along without being handled here at all.
   */
  const call = async (path: string, input: unknown) =>
    stage.page.evaluate(
      async ([route, payload]) => {
        const response = await fetch(
          `/api/trpc/${route}?input=${encodeURIComponent(
            JSON.stringify({ json: payload }),
          )}`,
          { headers: { "content-type": "application/json" } },
        );

        return response.json();
      },
      [path, input] as const,
    );

  const listed = await call("iso.list", { sort: [], per_page: 25 });
  const images = listed?.result?.data?.json?.iso_downloads ?? [];
  const image = images[0];

  if (!image) return { done: false, failed: false, percentage: null };
  if (image.finished_at) return { done: true, failed: false, percentage: 100 };

  const probed = await call("iso.status", { id: image.id });
  const status = probed?.result?.data?.json?.status ?? {};

  return {
    done: Boolean(status.finished_at),
    failed: Boolean(status.failed_at),
    percentage: status.percentage ?? null,
  };
}

/**
 * Waits for the download, out loud.
 *
 * [!] This used to poll the dropdown's `aria-disabled`, and that was a mistake
 * twice over: it depended on a `cmdk` convention that reports "false" rather
 * than dropping the attribute, and it could tell "still downloading" apart from
 * "the list closed under me" only by guessing. A take once sat here for
 * twenty-seven minutes against an image that had finished, saying nothing.
 *
 * So the state comes from the API and the progress is printed. A recording that
 * waits is fine; a recording that waits silently is not debuggable.
 */
async function awaitDownload(stage: Stage): Promise<void> {
  const deadline = Date.now() + 420_000;
  let announced = 0;

  while (Date.now() < deadline) {
    const { done, failed, percentage } = await isoProgress(stage);

    if (failed) {
      throw new Error(
        `the ${CATALOGUE_PICK} download failed - check the cluster's internet access`,
      );
    }

    if (done) break;

    if (Date.now() - announced > 15_000) {
      announced = Date.now();
      console.log(
        `[iso] downloading ${CATALOGUE_PICK}${
          percentage === null ? "" : ` - ${percentage}%`
        }`,
      );
    }

    await stage.hold(3_000);
  }

  if (Date.now() >= deadline) {
    throw new Error(`the ${CATALOGUE_PICK} image never finished downloading`);
  }

  /*
   * The list is driven by a separate query, so the option is enabled a moment
   * after the API says so - and the popover may have closed while waiting.
   */
  const option = stage.page
    .getByRole("option", { name: new RegExp(CATALOGUE_PICK) })
    .first();

  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await option.count()) === 0) {
      await stage.click("#mount");
      await stage.hold(1_200);
      continue;
    }

    if ((await option.getAttribute("aria-disabled")) !== "true") return;

    await stage.hold(1_500);
  }

  throw new Error(`${CATALOGUE_PICK} finished but never became selectable`);
}

// --- the wide edit ---------------------------------------------------------

const LANDSCAPE_BEATS: Beat[] = [
  {
    say: "Mit einem eigenen ISO-Abbild startest du deinen Server von einem beliebigen Installationsmedium: ein anderes Betriebssystem, ein Rettungssystem, dein eigenes Image.",
    tail: 500,
  },
  {
    say: "Verwaltet werden die Abbilder in den Kontoeinstellungen unter Eigene ISO-Abbilder.",
    lead: 600,
    act: async (stage) => {
      await stage.focusOn(imagesCard, 1.3);
      await stage.hold(700);
    },
  },
  {
    say: `Gleichzeitig halten darfst du bis zu ${MAX_ACTIVE_ISO_DOWNLOADS_PER_USER} aktive Abbilder.`,
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(`${imagesCard} [data-slot="card-footer"] p`);
      await stage.hold(900);
      await stage.wide();
    },
  },
  {
    say: "Ein neues legst du hier an.",
    act: async (stage) => {
      await stage.click(createButton);
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(600);
    },
  },
  {
    say: `Virtbase bringt einen geprüften Katalog mit, aktuell ${ISO_CATALOG.length} Abbilder.`,
    lead: 300,
    act: async (stage) => {
      await stage.hold(800);
    },
  },
  {
    say: "Von Debian, Ubuntu und Alpine über Arch, NixOS und FreeBSD bis zu Kali Linux.",
    act: async (stage) => {
      /* Over the grid before scrolling it: the wheel goes wherever the pointer
         is, and after opening the dialog that is still the button behind it. */
      await stage.pointAt(catalogueCard("Ubuntu Server 26.04"));
      await stage.page.mouse.wheel(0, 320);
      await stage.hold(700);
      await stage.page.mouse.wheel(0, 320);
      await stage.hold(700);
    },
  },
  {
    say: "Windows Server und Windows 11 sind als Evaluation dabei.",
    lead: 200,
    act: async (stage) => {
      await stage.type(search, "windows", 90);
      await stage.hold(1_200);
    },
  },
  {
    say: "Und die VirtIO-Treiber, die Windows für die virtuellen Laufwerke braucht - ohne die sieht das Setup keine Festplatte.",
    act: async (stage) => {
      await stage.pointAt(catalogueCard("VirtIO"));
      await stage.hold(1_400);
    },
  },
  {
    say: "Jede Kachel sagt dir, wann genau dieses Abbild veröffentlicht wurde.",
    lead: 300,
    act: async (stage) => {
      await stage.page.keyboard.press("ControlOrMeta+a");
      await stage.page.keyboard.type("alpine", { delay: 80 });
      await stage.hold(900);
      await stage.pointAt(`${catalogueCard(CATALOGUE_PICK)} p`);
      await stage.hold(1_000);
    },
  },
  {
    say: "Das Abzeichen Verifiziert heißt nicht, dass die Datei von uns kommt.",
    act: async (stage) => {
      await stage.pointAt(
        `${catalogueCard(CATALOGUE_PICK)} [data-slot="badge"]`,
      );
      await stage.hold(1_000);
    },
  },
  {
    say: "Geladen wird direkt beim Hersteller. Virtbase prüft die Quelle, hostet die Images aber nicht und verändert sie auch nicht.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(`${dialog} legend button`);
      await stage.hold(1_800);
    },
  },
  {
    say: "Zu jedem Katalog-Abbild gehört außerdem die SHA-256-Prüfsumme des Herstellers.",
    lead: 400,
  },
  {
    say: "Die tippt niemand ein: Virtbase ordnet sie serverseitig der URL zu, sie lässt sich also weder fälschen noch weglassen.",
  },
  {
    say: "Proxmox lädt und rechnet nach. Passt die Prüfsumme nicht, bricht der Download ab, statt dir ein verändertes Abbild unterzuschieben.",
    tail: 500,
  },
  {
    say: "Du kannst auch ein ganz eigenes Abbild angeben.",
    lead: 300,
    act: async (stage) => {
      await stage.click(
        `${dialog} button:has-text("Benutzerdefiniertes Image verwenden")`,
      );
      await stage.hold(900);
    },
  },
  {
    say: "Dafür brauchst du einen Namen und die direkte URL zur ISO-Datei.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt("#name");
      await stage.hold(600);
      await stage.pointAt("#url");
      await stage.hold(500);
    },
  },
  {
    say: "Die URL muss mit https beginnen, wirklich auf die Datei zeigen und höchstens zehn Gigabyte groß sein.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(`${dialog} [data-slot="field-description"]`);
      await stage.hold(1_400);
    },
  },
  {
    say: "Eine Prüfsumme gibt es dabei nicht - bei deiner eigenen Quelle hat Virtbase nichts, womit es vergleichen könnte.",
    tail: 400,
  },
  {
    say: "Für dieses Beispiel nehme ich Alpine Linux - ein kleines Rettungssystem, das schnell geladen ist.",
    lead: 300,
    act: async (stage) => {
      await stage.click(
        `${dialog} button:has-text("Benutzerdefiniertes Image verwenden")`,
      );
      await stage.hold(400);
      await stage.click(catalogueCard(CATALOGUE_PICK));
      await stage.hold(900);
    },
  },
  {
    say: "Name und URL sind damit ausgefüllt, und der Download startet.",
    lead: 200,
    act: async (stage) => {
      await stage.click(`${dialog} button[type="submit"]`);
      await stage.locate(dialog).waitFor({ state: "hidden" });
      await stage.hold(1_500);
    },
  },
  {
    say: "Das Abbild steht jetzt in der Liste, mit Name und Quelle.",
    lead: 300,
    act: async (stage) => {
      await stage.focusOn(imageRow, 1.4);
      await stage.hold(900);
    },
  },
  {
    say: `Und mit einem Ablaufdatum: Nach ${ISO_DOWNLOAD_EXPIRATION_MINUTES} Minuten wird es automatisch gelöscht.`,
    lead: 300,
    act: async (stage) => {
      /* A locator, not a string: `>> nth=` has to end a selector, so anything
         appended after it is read as part of the index. */
      await stage.pointAt(
        stage
          .locate(imageRow)
          .first()
          .getByText(/Läuft ab/),
      );
      await stage.hold(1_200);
    },
  },
  {
    say: "Ein ISO ist ein Installationsmedium und kein Speicherplatz - installiert ist installiert.",
    tail: 400,
    act: async (stage) => {
      await stage.wide();
    },
  },
  {
    say: "Eingebunden wird das Abbild beim Server selbst.",
    lead: 300,
    act: async (stage) => {
      await stage.goto(serverUrl);
      /* The power buttons, not the status badge: the badge lives in the header
         label, which a 360px layout does not show. */
      await stage.page
        .getByRole("button", { name: "Neustart" })
        .first()
        .waitFor({ state: "visible", timeout: 60_000 });
      await stage.hold(1_200);
    },
  },
  {
    say: "Im Menü neben den Ein- und Ausschaltern liegt ISO einbinden.",
    lead: 300,
    act: async (stage) => {
      await stage.click(actionsMenu(stage));
      await stage.hold(1_100);
      await stage.click(
        stage.page.getByRole("menuitem", { name: "ISO einbinden" }),
      );
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(600);
    },
  },
  {
    say: "In der Auswahl siehst du, wie weit der Download ist.",
    act: async (stage) => {
      await stage.click("#mount");
      await stage.hold(1_500);
    },
  },
  {
    /*
     * Silent on purpose, like the model's answer in the firewall episode. A
     * netinst image is most of a gigabyte and nobody should watch it arrive.
     * The download really happens; only the waiting is missing.
     */
    act: async (stage) => {
      await stage.cut(() => awaitDownload(stage), { keep: 1_200 });
    },
  },
  {
    say: "Fertig geladen, lässt es sich auswählen.",
    lead: 300,
    act: async (stage) => {
      await stage.click(
        stage.page
          .getByRole("option", { name: new RegExp(CATALOGUE_PICK) })
          .first(),
      );
      await stage.hold(1_500);
    },
  },
  {
    say: "Eingebunden ist es sofort. Damit dein Server aber davon startet, musst du ihn einmal vollständig stoppen und wieder starten.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(`${dialog} [data-slot="field-description"]`);
      await stage.hold(1_600);
      await stage.page.keyboard.press("Escape");
      await stage.locate(dialog).waitFor({ state: "hidden" });
      await stage.hold(700);
    },
  },
  {
    say: "Am Server steht dann, dass ein Abbild eingehängt ist.",
    lead: 400,
    act: async (stage) => {
      /*
       * `data-testid`, not `data-slot`. The badge is wrapped in a
       * `HoverCardTrigger asChild`, and Radix merges its own props over the
       * child's - so the element that renders as a badge announces itself as a
       * hover-card trigger, and the obvious selector matches nothing while the
       * badge is plainly on screen.
       */
      await stage.pointAt('[data-testid="badge"]:has-text("Eingehängt")');
      await stage.hold(1_800);
    },
  },
  {
    say: "Zum Aushängen genügt das X neben der Auswahl - auch das wirkt beim nächsten Start.",
    lead: 300,
    act: async (stage) => {
      await stage.click(actionsMenu(stage));
      await stage.hold(600);
      await stage.click(
        stage.page.getByRole("menuitem", { name: "ISO einbinden" }),
      );
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(700);
      await stage.click(
        stage.page.getByRole("button", { name: "Aushängen" }).first(),
      );
      await stage.hold(1_800);
      await stage.page.keyboard.press("Escape");
      await stage.locate(dialog).waitFor({ state: "hidden" });
    },
  },
  {
    say: "Das sind eigene ISO-Abbilder bei Virtbase: ein geprüfter Katalog, deine eigene URL, Prüfsummen wo es welche gibt, und ein Laufwerk, das du jederzeit wieder leerst.",
    lead: 300,
    tail: 1_400,
    act: async (stage) => {
      await stage.wide();
    },
  },
];

// --- the portrait edit -----------------------------------------------------
//
// Same path, less catalogue. The tiles are two columns wide on a desktop and
// one on a phone, so scrolling through twenty-three of them costs three times
// the screen time and says the same thing; the vertical cut names the range
// once and spends what it saved on the part that has a beginning and an end -
// create, mount, unmount.

const PORTRAIT_BEATS: Beat[] = [
  {
    say: "Mit einem eigenen ISO-Abbild startest du deinen Server von einem beliebigen Installationsmedium.",
    tail: 400,
  },
  {
    say: "Die Abbilder liegen in den Kontoeinstellungen. Bis zu drei aktive darfst du halten.",
    lead: 500,
    act: async (stage) => {
      await stage.reveal(imagesCard);
      await stage.hold(900);
    },
  },
  {
    say: "Ein neues legst du hier an.",
    act: async (stage) => {
      await stage.click(createButton);
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(700);
    },
  },
  {
    say: `Virtbase bringt ${ISO_CATALOG.length} geprüfte Abbilder mit: Linux, FreeBSD, Windows als Evaluation und die Proxmox-Produkte.`,
    lead: 300,
    act: async (stage) => {
      await stage.hold(1_600);
    },
  },
  {
    say: "Geladen wird direkt beim Hersteller, und zu jedem Katalog-Abbild gehört dessen SHA-256-Prüfsumme.",
    act: async (stage) => {
      await stage.type(search, "alpine", 90);
      await stage.hold(1_200);
    },
  },
  {
    say: "Passt sie nicht, bricht der Download ab. Bei einer eigenen URL gibt es nichts zu vergleichen.",
    lead: 200,
    act: async (stage) => {
      await stage.pointAt(
        `${catalogueCard(CATALOGUE_PICK)} [data-slot="badge"]`,
      );
      await stage.hold(1_200);
    },
  },
  {
    say: "Eigene Images gibst du mit Name und direkter https-URL an, bis zehn Gigabyte.",
    lead: 300,
    act: async (stage) => {
      await stage.click(
        `${dialog} button:has-text("Benutzerdefiniertes Image verwenden")`,
      );
      await stage.hold(1_600);
      await stage.click(
        `${dialog} button:has-text("Benutzerdefiniertes Image verwenden")`,
      );
      await stage.hold(400);
    },
  },
  {
    say: "Hier nehme ich Alpine Linux aus dem Katalog.",
    lead: 200,
    act: async (stage) => {
      await stage.click(catalogueCard(CATALOGUE_PICK));
      await stage.hold(700);
      await stage.click(`${dialog} button[type="submit"]`);
      await stage.locate(dialog).waitFor({ state: "hidden" });
      await stage.hold(1_500);
    },
  },
  {
    say: `Es steht jetzt in der Liste - und läuft nach ${ISO_DOWNLOAD_EXPIRATION_MINUTES} Minuten ab, denn ein ISO ist ein Installationsmedium und kein Speicherplatz.`,
    lead: 300,
    act: async (stage) => {
      await stage.reveal(imageRow);
      await stage.hold(1_400);
    },
  },
  {
    say: "Eingebunden wird es beim Server, im Menü neben den Schaltern.",
    lead: 300,
    act: async (stage) => {
      await stage.goto(serverUrl);
      /* The power buttons, not the status badge: the badge lives in the header
         label, which a 360px layout does not show. */
      await stage.page
        .getByRole("button", { name: "Neustart" })
        .first()
        .waitFor({ state: "visible", timeout: 60_000 });
      await stage.hold(900);
      await stage.click(actionsMenu(stage));
      await stage.hold(900);
      await stage.click(
        stage.page.getByRole("menuitem", { name: "ISO einbinden" }),
      );
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(500);
    },
  },
  {
    say: "In der Auswahl siehst du den Fortschritt.",
    act: async (stage) => {
      await stage.click("#mount");
      await stage.hold(1_400);
    },
  },
  {
    act: async (stage) => {
      await stage.cut(() => awaitDownload(stage), { keep: 1_000 });
    },
  },
  {
    say: "Fertig geladen, wählst du es aus.",
    lead: 300,
    act: async (stage) => {
      await stage.click(
        stage.page
          .getByRole("option", { name: new RegExp(CATALOGUE_PICK) })
          .first(),
      );
      await stage.hold(1_400);
    },
  },
  {
    say: "Eingebunden ist es sofort - zum Starten davon muss der Server einmal komplett neu hochfahren.",
    lead: 300,
    tail: 500,
    act: async (stage) => {
      await stage.pointAt(`${dialog} [data-slot="field-description"]`);
      await stage.hold(1_400);
    },
  },
  {
    say: "Und mit dem X hängst du es wieder aus.",
    lead: 200,
    act: async (stage) => {
      await stage.click(
        stage.page.getByRole("button", { name: "Aushängen" }).first(),
      );
      await stage.hold(1_600);
      await stage.page.keyboard.press("Escape");
      await stage.locate(dialog).waitFor({ state: "hidden" });
    },
  },
  {
    say: "Eigene ISO-Abbilder bei Virtbase: geprüfter Katalog, eigene URL, Prüfsummen wo es welche gibt.",
    lead: 300,
    tail: 1_400,
  },
];

const dryRun = process.argv.includes("--dry");
const gpu = process.argv.includes("--gpu");

/** Waits for the account page to be worth filming. */
const openImages = async (stage: Stage) => {
  await stage.goto(imagesUrl);
  await stage.locate(imagesCard).waitFor({ state: "visible", timeout: 60_000 });
  await stage.locate(createButton).waitFor({ state: "visible" });
  await stage.hold(1_200);
};

const THUMBNAIL = {
  eyebrow: "Katalog, Prüfsummen\nund Limits",
  title: "ISO-Abbilder\neinbinden",
  subtitle: "Vom geprüften Katalog\nbis zum Neustart.",
};

/** A moment inside the line that starts with this, in seconds. */
const whileSaying = (take: Take, start: string): number => {
  const cue = take.cues.find((line) => line.text.startsWith(start));

  if (!cue) {
    throw new Error(`no narration starts with "${start}"`);
  }

  return cue.start + cue.duration / 2;
};

// --- the wide cut ----------------------------------------------------------

const landscape = await recordEpisode({
  name: "iso",
  storageState,
  dryRun,
  gpu,
  open: openImages,
  beats: LANDSCAPE_BEATS,
});

// --- the portrait cut ------------------------------------------------------

let portrait: Take | null = null;

if (!process.argv.includes("--no-vertical")) {
  /* The scene, again, between the takes: the wide cut leaves an image in the
     account and a drive on the server, and the portrait cut opens by saying
     the list is where new images go. */
  await prepareIsoScene({ userId: CUSTOMER_ID });

  portrait = await recordEpisode({
    name: "iso-portrait",
    storageState,
    dryRun,
    gpu,
    mobile: true,
    viewport: { width: 360, height: 640 },
    scale: 3,
    output: { width: 1080, height: 1920 },
    open: openImages,
    beats: PORTRAIT_BEATS,
  });
}

if (dryRun) process.exit(0);

// --- deliverables ----------------------------------------------------------

const tools = await ensureTools("thorsten-high");
const out = workspaceFor("iso").output;

const cover = await renderThumbnail({
  tools,
  video: landscape.video,
  spec: { ...THUMBNAIL, backdropAt: whileSaying(landscape, "Virtbase bringt") },
  shape: "youtube",
  output: join(out, "iso.de.thumbnail.png"),
});
console.log(`[thumbnail] ${cover}`);

if (portrait) {
  const portraitCover = await renderThumbnail({
    tools,
    video: portrait.video,
    spec: {
      ...THUMBNAIL,
      backdropAt: whileSaying(portrait, "Virtbase bringt"),
    },
    shape: "vertical",
    output: join(out, "iso.de.vertical-cover.png"),
  });

  const captionPath = join(
    workspaceFor("iso-portrait").frames,
    "..",
    "captions.ass",
  );

  await Bun.write(
    captionPath,
    captions(portrait.cues, {
      width: 1080,
      height: 1920,
      fontSize: 44,
      marginV: 190,
    }),
  );

  await prependCover({
    tools,
    source: portrait.video,
    cover: portraitCover,
    captions: captionPath,
    width: 1080,
    height: 1920,
    fps: portrait.fps,
    gpu,
    output: join(out, "iso.de.vertical.mp4"),
  });
}

console.log(`\n${landscape.video}`);
process.exit(0);
