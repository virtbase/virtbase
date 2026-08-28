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
/* The state the status endpoint reports is the mapped enum, not Proxmox's own
   lower-case string - so it is compared against the constant rather than a
   literal that looked right and silently never matched. */
import { ProxmoxServerStatus } from "@virtbase/utils";
import { appUrl } from "../../e2e/support/urls";
import { prependCover } from "./lib/render";
import { CUSTOMER_ID, ensureSession, prepareBackupsScene } from "./lib/scene";
import type { Beat, Stage, Take } from "./lib/studio";
import { recordEpisode } from "./lib/studio";
import { renderThumbnail } from "./lib/thumbnail";
import { ensureTools, workspaceFor } from "./lib/tools";
import { captions } from "./lib/voice";

/**
 * Episode three: backups.
 *
 * The one episode in the series where the demonstration is destructive. It
 * takes a real backup of the filmed guest and then really restores it, which
 * stops the server, swaps its disk and starts it again - so the recording
 * shows the actual downtime rather than describing it, and `prepareBackupsScene`
 * has to wait that out before the second cut can be filmed.
 *
 * Three things carry the episode, because they are the three a customer has to
 * decide rather than discover: which mode to take the backup in, what the
 * deletion protection actually protects, and what a restore replaces.
 *
 *   bun script video/backups
 */
/* Next's dev error overlay is a dialog too, and is in the DOM whether or not
   it is showing - see the ISO episode. */
const dialog = '[role="dialog"]:not([data-nextjs-dialog])';

/** The card whose title is exactly this. */
const card = (title: string) =>
  `[data-slot="card"]:has([data-slot="card-title"]:text-is("${title}"))`;

const backupsCard = card("Backups");

/**
 * The two icon buttons in the card header, in DOM order: create, then refresh.
 *
 * Neither carries an accessible name - they are a plus and a circular arrow -
 * so there is nothing to match on but position. Scoped to the header rather
 * than the card, because every row further down has buttons of its own.
 *
 * A locator rather than a selector string, because `openBackups` has to ask
 * whether this one is enabled yet: `>> nth=` has to *end* a selector, so a
 * `:not([disabled])` glued onto the end of one is parsed as part of the index
 * and waits forever on `nth(0:not([disabled]))`.
 */
const headerButton = (stage: Stage, index: number) =>
  stage.locate(`${backupsCard} [data-slot="card-header"] button`).nth(index);

/** One row of the backup list. */
const backupRow = (stage: Stage) =>
  stage.locate(`${backupsCard} tbody tr`).first();

/**
 * The `...` menu at the end of a backup's row.
 *
 * By slot rather than by index: the row also renders a lock icon and, while a
 * backup is being written, a spinner - and a row's button count is exactly the
 * kind of thing that changes when a column is added.
 */
const rowMenu = (stage: Stage) =>
  backupRow(stage).locator('button[data-slot="dropdown-menu-trigger"]');

const menuItem = (stage: Stage, name: string) =>
  stage.page.getByRole("menuitem", { name, exact: true });

/** The mode a customer picks in the create dialog, by its radio's id. */
const mode = (id: string) => `${dialog} label[for="mode-${id}"]`;

const storageState = await ensureSession();

const serverId = await prepareBackupsScene({
  userId: CUSTOMER_ID,
  rebuild: process.argv.includes("--rebuild"),
});

const backupsUrl = appUrl(`/servers/${serverId}/backups`);

/** The name the episode gives the backup it takes. */
const BACKUP_NAME = "Vor dem Update";

/**
 * Asks the API a question about the filmed server, as the filmed customer.
 *
 * Fetched inside the page rather than through `page.request`: Playwright's
 * request context resolves hostnames with Node, and `app.virtbase.localhost`
 * is a name only Chromium invents an address for. A relative URL also carries
 * the session cookie without this having to handle one.
 */
const call = async (stage: Stage, route: string, input: unknown) =>
  stage.page.evaluate(
    async ([path, payload]) => {
      const response = await fetch(
        `/api/trpc/${path}?input=${encodeURIComponent(
          JSON.stringify({ json: payload }),
        )}`,
        { headers: { "content-type": "application/json" } },
      );

      return response.json();
    },
    [route, input] as const,
  );

/**
 * Waits for the backup to settle, out loud.
 *
 * `backups.list` rather than the row's own status query, because that is where
 * a finished task is *written down*: Proxmox reports an outcome once, and
 * reconciliation - which every one of these calls runs - is what turns it into
 * a row. Polling the API instead of the badge also means the wait no longer
 * depends on a component being mounted to make progress, which is the mistake
 * the ISO episode made and sat on for twenty-seven minutes.
 */
async function awaitBackup(stage: Stage): Promise<void> {
  const deadline = Date.now() + 900_000;
  let announced = 0;

  while (Date.now() < deadline) {
    /* The same input the page's own query uses, `id:desc` included, so the
       first row here is the first row on screen. */
    const listed = await call(stage, "servers.backups.list", {
      server_id: serverId,
      sort: ["id:desc"],
      expand: ["template"],
      per_page: 25,
    });

    const backup = listed?.result?.data?.json?.backups?.[0];

    if (backup?.failed_at) {
      throw new Error("the backup failed - check the node's backup storage");
    }

    if (backup?.finished_at) {
      /* The list is a separate query from the one the table renders, so give
         the row a moment to catch up before a beat points at its size. */
      await stage.hold(2_500);
      return;
    }

    if (Date.now() - announced > 10_000) {
      announced = Date.now();
      console.log("[backups] writing the archive");
    }

    await stage.hold(2_000);
  }

  throw new Error("the backup never finished");
}

/**
 * Waits for the restore, out loud.
 *
 * `installed_at` is the flag the whole operation hangs off - the workflow nulls
 * it before it stops the guest and stamps it after it has started the guest
 * again - so it is true for exactly as long as the server is unusable, which
 * is the thing being waited for. The state has to be `running` as well: the
 * flag is set in the last step, and a browser polling every five seconds can
 * catch the moment between that and the guest reporting itself up.
 */
async function awaitRestore(stage: Stage): Promise<void> {
  const deadline = Date.now() + 1_800_000;
  let announced = 0;

  /* The workflow is started asynchronously, so for the first seconds after the
     click the server still looks perfectly healthy. */
  await stage.hold(5_000);

  while (Date.now() < deadline) {
    const probed = await call(stage, "servers.status.get", {
      server_id: serverId,
    });

    const status = probed?.result?.data?.json?.status;

    if (status?.installed_at && status.state === ProxmoxServerStatus.RUNNING) {
      await stage.hold(3_000);
      return;
    }

    if (Date.now() - announced > 15_000) {
      announced = Date.now();
      console.log(`[backups] restoring - ${status?.state ?? "unknown"}`);
    }

    await stage.hold(3_000);
  }

  throw new Error("the restore never finished");
}

// --- the wide edit ---------------------------------------------------------

const LANDSCAPE_BEATS: Beat[] = [
  {
    say: "Ein Backup erfasst den gesamten Server: die Festplatte, so wie sie in diesem Moment aussieht.",
    tail: 400,
  },
  {
    say: "Hier gibt es noch keines - also legen wir eines an.",
    lead: 400,
    act: async (stage) => {
      await stage.focusOn(backupsCard, 1.2);
      await stage.hold(800);
      await stage.wide();
      await stage.click(headerButton(stage, 0));
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(600);
    },
  },
  {
    say: "Jedes Backup bekommt einen Namen. Vorgeschlagen wird Datum und Uhrzeit.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt("#name");
      await stage.hold(900);
    },
  },
  {
    say: `Ich nenne dieses hier "${BACKUP_NAME}".`,
    act: async (stage) => {
      await stage.click("#name");
      await stage.page.keyboard.press("ControlOrMeta+a");
      /*
       * Typed through the keyboard rather than `stage.type`, which clicks its
       * target first - and a click collapses the selection the line above just
       * made, putting the caret at the end of the default name. The take still
       * records perfectly; it just reads "Backup 27.8.2026, 21:37:46Vor dem
       * Update".
       */
      await stage.page.keyboard.type(BACKUP_NAME, { delay: 70 });
      await stage.hold(700);
    },
  },
  {
    say: "Darunter wählst du den Modus, und das ist die eine Entscheidung, die hier wirklich etwas ändert.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(
        `${dialog} [data-slot="field-label"]:has-text("Modus")`,
      );
      await stage.hold(1_000);
    },
  },
  {
    say: "Snapshot ist die Voreinstellung. Der Server läuft weiter, während seine Datenblöcke weggeschrieben werden.",
    lead: 200,
    act: async (stage) => {
      await stage.pointAt(mode("snapshot"));
      await stage.hold(1_400);
    },
  },
  {
    say: "Es gibt also keine Ausfallzeit. Und wenn der Gast-Agent läuft, friert Proxmox die Dateisysteme dafür kurz ein, damit im Abbild nichts halb geschrieben ist.",
    tail: 300,
  },
  {
    say: "Suspendieren hält den Server kurz an, macht den Snapshot und lässt ihn dann weiterlaufen.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(mode("suspend"));
      await stage.hold(1_400);
    },
  },
  {
    say: "Das kostet eine kurze Unterbrechung und bringt gegenüber Snapshot kaum etwas - Proxmox selbst führt den Modus nur noch aus Kompatibilitätsgründen.",
    tail: 300,
  },
  {
    say: "Stoppen fährt den Server vorher vollständig herunter.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(mode("stop"));
      await stage.hold(1_200);
    },
  },
  {
    say: "Danach startet er wieder. Das ist der sicherste Modus - es läuft nichts, es schreibt nichts - und der einzige mit echter Ausfallzeit.",
    tail: 400,
  },
  {
    say: "Für eine Datenbank, bei der nichts schiefgehen darf, ist er die richtige Wahl. Für alles andere bleibst du bei Snapshot.",
    lead: 200,
    act: async (stage) => {
      await stage.click(mode("snapshot"));
      await stage.hold(900);
    },
  },
  {
    say: "Ganz unten steht der Löschschutz.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(`${dialog} [data-testid="switch"]`);
      await stage.hold(900);
    },
  },
  {
    say: "Ist er an, lässt sich das Backup nicht mehr löschen - und der Schutz gilt bis in den Speicher hinein.",
    act: async (stage) => {
      await stage.click(`${dialog} [data-testid="switch"]`);
      await stage.hold(1_400);
    },
  },
  {
    say: "Proxmox markiert auch das Archiv selbst als geschützt, damit keine Aufräumregel es wegnimmt.",
    tail: 300,
  },
  {
    say: "Ich lasse ihn hier aus und zeige gleich, wie du ihn nachträglich setzt.",
    lead: 200,
    act: async (stage) => {
      await stage.click(`${dialog} [data-testid="switch"]`);
      await stage.hold(800);
    },
  },
  {
    say: "Dann erstellen.",
    act: async (stage) => {
      await stage.click(`${dialog} button[type="submit"]`);
      await stage.locate(dialog).waitFor({ state: "hidden" });
      await stage.hold(1_200);
    },
  },
  {
    say: "Der Server sichert jetzt, und du kannst ihn dabei ganz normal weiterbenutzen.",
    lead: 400,
    act: async (stage) => {
      await stage.focusOn(backupRow(stage), 1.4);
      await stage.hold(1_200);
    },
  },
  {
    say: "Nur eine zweite Sicherung geht nicht: pro Server läuft immer nur eine.",
    tail: 300,
  },
  {
    /* Twelve seconds on this guest, but a customer's disk is not three
       gigabytes. Nobody should watch either. */
    act: async (stage) => {
      await stage.cut(() => awaitBackup(stage), { keep: 1_000 });
    },
  },
  {
    say: "Fertig. In der Zeile steht jetzt die Größe des Archivs.",
    lead: 400,
    act: async (stage) => {
      await stage.hold(1_400);
    },
  },
  {
    say: "Daneben der Zeitpunkt, und das Betriebssystem, das in diesem Archiv liegt.",
    lead: 300,
    act: async (stage) => {
      await stage.hold(1_400);
      await stage.wide();
    },
  },
  {
    say: "Das ist bewusst der Stand von damals. Installierst du später etwas anderes, ändert das nichts am Inhalt dieses Backups.",
    tail: 400,
  },
  {
    say: "Anlegen und wiederherstellen darfst du je fünf Mal am Tag.",
    tail: 300,
  },
  {
    say: "Zurück zum Löschschutz: über das Menü sperrst du ein bestehendes Backup.",
    lead: 400,
    act: async (stage) => {
      await stage.click(rowMenu(stage));
      await stage.hold(1_100);
      await stage.click(menuItem(stage, "Sperren"));
      await stage.hold(1_600);
    },
  },
  {
    say: "Das Schloss vor dem Namen ist jetzt grün.",
    lead: 300,
    act: async (stage) => {
      await stage.focusOn(backupRow(stage), 1.5);
      await stage.hold(1_200);
      await stage.wide();
    },
  },
  {
    say: "Und Löschen ist ausgegraut. Erst entsperren, dann löschen - das ist genau ein Schritt mehr, als man aus Versehen tut.",
    lead: 400,
    act: async (stage) => {
      await stage.click(rowMenu(stage));
      await stage.hold(1_000);
      await stage.pointAt(menuItem(stage, "Löschen"));
      await stage.hold(1_600);
    },
  },
  {
    say: "Entsperrt wird über denselben Weg.",
    lead: 200,
    act: async (stage) => {
      await stage.click(menuItem(stage, "Entsperren"));
      await stage.hold(1_600);
    },
  },
  {
    say: "Bleibt das Wiederherstellen, und das liegt im selben Menü.",
    lead: 400,
    act: async (stage) => {
      await stage.click(rowMenu(stage));
      await stage.hold(900);
      await stage.click(menuItem(stage, "Wiederherstellen"));
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(800);
    },
  },
  {
    say: "Der Dialog sagt dir, auf welchen Stand der Server zurückgesetzt wird.",
    lead: 300,
    act: async (stage) => {
      /* By its words rather than by position. The dialog holds three bare
         paragraphs, and `${dialog} p` happens to resolve to this one only
         because `box()` takes `.first()`. */
      await stage.pointAt(`${dialog} p:has-text("zurückgesetzt")`);
      await stage.hold(1_400);
    },
  },
  {
    say: "Und welches Betriebssystem dabei auf der Platte landet.",
    act: async (stage) => {
      /* The block, so the logo and the name are both inside the pointer's
         reach - reached through the sentence above them rather than through
         the Tailwind class that happens to group them. */
      await stage.pointAt(
        stage
          .locate(dialog)
          .getByText("Das folgende Betriebssystem")
          .locator("xpath=.."),
      );
      await stage.hold(1_400);
    },
  },
  {
    say: "Das heißt wörtlich: alles, was seit diesem Zeitpunkt entstanden ist, ist danach weg.",
    tail: 400,
  },
  {
    say: "Der Server wird dafür gestoppt, die Festplatte ausgetauscht und wieder gestartet.",
    tail: 300,
  },
  {
    say: "Erhalten bleibt alles, was nicht auf der Platte liegt: dein Netzwerk, deine IP-Adresse, die Hardware deines Tarifs. Wiederhergestellt wird der Inhalt, nicht der Server.",
    tail: 400,
  },
  {
    say: "Also los.",
    lead: 200,
    act: async (stage) => {
      await stage.click(`${dialog} button:has-text("Backup wiederherstellen")`);
      await stage.locate(dialog).waitFor({ state: "hidden" });
      await stage.hold(1_200);
    },
  },
  {
    say: "Solange das läuft, steht der Server auf wird installiert, und keine andere Aktion ist möglich.",
    lead: 600,
    act: async (stage) => {
      await stage
        .locate('[data-testid="alert"]:has-text("wird installiert")')
        .waitFor({ state: "visible", timeout: 120_000 });
      await stage.hold(1_600);
    },
  },
  {
    /* Minutes, not seconds: a temporary guest is built from the archive and
       its disk is moved onto the real one. All of it really happens. */
    act: async (stage) => {
      await stage.cut(() => awaitRestore(stage), { keep: 1_200 });
    },
  },
  {
    say: "Danach läuft er wieder, mit dem Stand von vorhin.",
    lead: 600,
    act: async (stage) => {
      await stage.page.reload({ waitUntil: "domcontentloaded" });
      await stage.locate(backupsCard).waitFor({ state: "visible" });
      await stage.hold(1_600);
    },
  },
  {
    say: "Das sind Backups bei Virtbase: drei Modi, ein Löschschutz, der bis ins Archiv reicht, und ein Weg zurück, der die Platte ersetzt und den Server sonst so lässt, wie er ist.",
    lead: 300,
    tail: 1_400,
  },
];

// --- the portrait edit -----------------------------------------------------
//
// The table is the part that does not survive the trip to a phone: timestamp,
// size and operating system are all `max-md:hidden`, so three of the wide
// cut's beats have nothing to point at here. What does survive is the better
// half - the create dialog becomes a full-height drawer, and the three modes
// with their descriptions fill it exactly the way a vertical feed wants.

const PORTRAIT_BEATS: Beat[] = [
  {
    say: "Ein Backup erfasst den gesamten Server: die Festplatte, so wie sie in diesem Moment aussieht.",
    tail: 400,
  },
  {
    say: "Angelegt wird es hier.",
    lead: 400,
    act: async (stage) => {
      await stage.reveal(backupsCard);
      await stage.hold(700);
      await stage.click(headerButton(stage, 0));
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(700);
    },
  },
  {
    say: "Namen vergeben, Modus wählen.",
    lead: 300,
    act: async (stage) => {
      await stage.click("#name");
      await stage.page.keyboard.press("ControlOrMeta+a");
      /* Not `stage.type` - see the wide edit. */
      await stage.page.keyboard.type(BACKUP_NAME, { delay: 70 });
      await stage.hold(800);
    },
  },
  {
    say: "Snapshot ist die Voreinstellung: der Server läuft weiter, es gibt keine Ausfallzeit.",
    lead: 200,
    act: async (stage) => {
      await stage.pointAt(mode("snapshot"));
      await stage.hold(1_600);
    },
  },
  {
    say: "Suspendieren hält ihn kurz an und bringt gegenüber Snapshot kaum etwas.",
    act: async (stage) => {
      await stage.pointAt(mode("suspend"));
      await stage.hold(1_400);
    },
  },
  {
    say: "Stoppen fährt ihn ganz herunter: der sicherste Modus, und der einzige mit echter Ausfallzeit.",
    act: async (stage) => {
      await stage.pointAt(mode("stop"));
      await stage.hold(1_600);
    },
  },
  {
    say: "Der Löschschutz verhindert, dass das Backup gelöscht wird - bis ins Archiv hinein.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(`${dialog} [data-testid="switch"]`);
      await stage.hold(1_400);
    },
  },
  {
    say: "Dann erstellen.",
    lead: 200,
    act: async (stage) => {
      await stage.click(`${dialog} button[type="submit"]`);
      await stage.locate(dialog).waitFor({ state: "hidden" });
      await stage.hold(1_400);
    },
  },
  {
    say: "Der Server sichert jetzt, und läuft dabei weiter. Pro Server geht immer nur eine Sicherung gleichzeitig.",
    lead: 300,
    act: async (stage) => {
      await stage.reveal(backupRow(stage));
      await stage.hold(1_600);
    },
  },
  {
    act: async (stage) => {
      await stage.cut(() => awaitBackup(stage), { keep: 1_000 });
    },
  },
  {
    say: "Fertig. Über das Menü sperrst du es nachträglich.",
    lead: 400,
    act: async (stage) => {
      await stage.click(rowMenu(stage));
      await stage.hold(1_000);
      await stage.click(menuItem(stage, "Sperren"));
      await stage.hold(1_600);
    },
  },
  {
    say: "Das Schloss wird grün, und Löschen ist gesperrt, bis du es wieder entsperrst.",
    lead: 300,
    act: async (stage) => {
      await stage.click(rowMenu(stage));
      await stage.hold(1_000);
      await stage.pointAt(menuItem(stage, "Löschen"));
      await stage.hold(1_400);
      await stage.click(menuItem(stage, "Entsperren"));
      await stage.hold(1_400);
    },
  },
  {
    say: "Wiederherstellen liegt im selben Menü.",
    lead: 300,
    act: async (stage) => {
      await stage.click(rowMenu(stage));
      await stage.hold(900);
      await stage.click(menuItem(stage, "Wiederherstellen"));
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(1_200);
    },
  },
  {
    say: "Alles auf der Platte wird durch den Inhalt des Backups ersetzt. Was seitdem entstanden ist, ist danach weg.",
    lead: 300,
    act: async (stage) => {
      await stage.hold(1_800);
    },
  },
  {
    say: "Netzwerk, IP-Adresse und die Hardware deines Tarifs bleiben.",
    act: async (stage) => {
      await stage.click(`${dialog} button:has-text("Backup wiederherstellen")`);
      await stage.locate(dialog).waitFor({ state: "hidden" });
      await stage.hold(1_200);
    },
  },
  {
    say: "Der Server wird dafür gestoppt und danach wieder gestartet.",
    lead: 500,
    act: async (stage) => {
      await stage.reveal('[data-testid="alert"]:has-text("wird installiert")');
      await stage.hold(1_600);
    },
  },
  {
    act: async (stage) => {
      await stage.cut(() => awaitRestore(stage), { keep: 1_000 });
    },
  },
  {
    say: "Danach läuft er wieder, mit dem Stand von vorhin.",
    lead: 500,
    tail: 1_400,
    act: async (stage) => {
      await stage.page.reload({ waitUntil: "domcontentloaded" });
      await stage.locate(backupsCard).waitFor({ state: "visible" });
      await stage.hold(1_400);
    },
  },
];

const dryRun = process.argv.includes("--dry");
const gpu = process.argv.includes("--gpu");

/** Waits for the backups page to be worth filming. */
const openBackups = async (stage: Stage) => {
  await stage.goto(backupsUrl);
  await stage
    .locate(backupsCard)
    .waitFor({ state: "visible", timeout: 60_000 });

  /*
   * The create button is disabled until the server's status poll has answered,
   * and a disabled button swallows its click without failing - so a take that
   * opens any earlier is a take where the first beat silently does nothing.
   */
  const create = headerButton(stage, 0);
  await create.waitFor({ state: "visible", timeout: 60_000 });

  for (let attempt = 0; attempt < 60; attempt++) {
    if (await create.isEnabled()) break;
    await stage.hold(1_000);
  }

  await stage.hold(1_200);
};

const THUMBNAIL = {
  eyebrow: "Modi, Löschschutz\nund Wiederherstellung",
  title: "Backups\nanlegen",
  subtitle: "Ein Weg zurück,\nder die Platte ersetzt.",
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
  name: "backups",
  storageState,
  dryRun,
  gpu,
  open: openBackups,
  beats: LANDSCAPE_BEATS,
});

// --- the portrait cut ------------------------------------------------------

let portrait: Take | null = null;

if (!process.argv.includes("--no-vertical")) {
  /* Between the takes, not once per run: the wide cut leaves a backup in the
     list, and the portrait cut opens by saying this is where a new one goes.
     It also waits out the restore the wide cut just started. */
  await prepareBackupsScene({ userId: CUSTOMER_ID });

  portrait = await recordEpisode({
    name: "backups-portrait",
    storageState,
    dryRun,
    gpu,
    mobile: true,
    viewport: { width: 360, height: 640 },
    scale: 3,
    output: { width: 1080, height: 1920 },
    open: openBackups,
    beats: PORTRAIT_BEATS,
  });
}

if (dryRun) process.exit(0);

// --- deliverables ----------------------------------------------------------

const tools = await ensureTools("thorsten-high");
const out = workspaceFor("backups").output;

const cover = await renderThumbnail({
  tools,
  video: landscape.video,
  spec: {
    ...THUMBNAIL,
    backdropAt: whileSaying(landscape, "Snapshot ist die"),
  },
  shape: "youtube",
  output: join(out, "backups.de.thumbnail.png"),
});
console.log(`[thumbnail] ${cover}`);

if (portrait) {
  const portraitCover = await renderThumbnail({
    tools,
    video: portrait.video,
    spec: {
      ...THUMBNAIL,
      backdropAt: whileSaying(portrait, "Snapshot ist die"),
    },
    shape: "vertical",
    output: join(out, "backups.de.vertical-cover.png"),
  });

  const captionPath = join(
    workspaceFor("backups-portrait").frames,
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
    output: join(out, "backups.de.vertical.mp4"),
  });
}

console.log(`\n${landscape.video}`);
process.exit(0);
