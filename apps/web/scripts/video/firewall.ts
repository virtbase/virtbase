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
 * Read rather than retyped. The narration says how many protocols the picker
 * offers, and a number spoken in a video is the one place a stale constant
 * cannot be noticed by reading the diff - so it comes from the same array the
 * picker renders.
 */
import { FIRWALL_PROTOCOLS } from "@virtbase/utils";
import { appUrl } from "../../e2e/support/urls";
import { prependCover } from "./lib/render";
import { CUSTOMER_ID, ensureSession, prepareFirewallScene } from "./lib/scene";
import type { Beat, Stage, Take } from "./lib/studio";
import { recordEpisode } from "./lib/studio";
import { renderThumbnail } from "./lib/thumbnail";
import { ensureTools, workspaceFor } from "./lib/tools";
import { captions } from "./lib/voice";

/**
 * Episode one: the firewall.
 *
 * German, filmed against the local Proxmox cluster. The narration is written to
 * the German the product actually uses - "Eingehende Pakete", "Verwerfen",
 * "Empfehlungen" - so a viewer can follow it with the interface in front of
 * them rather than translating back from a marketing paraphrase. The informal
 * "du" is not a style choice either; it is what `de.po` says.
 *
 * It is a walkthrough rather than a trailer, and the length follows from that:
 * the wide cut runs about four and a half minutes, because the three default
 * actions, the protocol list, the firewall inside the guest and each kind of
 * recommendation are all things a customer has to understand once and then
 * never again. The portrait cut keeps the same order and drops the depth, at
 * a little over two minutes.
 *
 *   bun script video/firewall
 */
/*
 * Not simply `[role="dialog"]`: Next's dev error overlay is one too, and it is
 * in the DOM whether or not it is showing. Matching both makes every wait a
 * strict-mode violation the first time the dev server logs a warning.
 */
const dialog = '[role="dialog"]:not([data-nextjs-dialog])';

/** The card whose title is exactly this. Two cards mention "Regeln". */
const card = (title: string) =>
  `[data-slot="card"]:has([data-slot="card-title"]:text-is("${title}"))`;

const rulesCard = card("Firewall Regeln");
const findingsCard = card("Empfehlungen");

/** The default action for one direction, e.g. `card("Eingehende Pakete")`. */
const policySelect = (title: string) => `${card(title)} button`;

/**
 * A rule row, by which firewall it belongs to.
 *
 * [!] Not every `tbody tr` is a rule. Once a firewall is running inside the
 * guest the table emits a group heading above each layer, and those are rows
 * too - so "the first row" was the heading "Virtbase-Firewall" rather than the
 * SSH rule, and the lens opened this episode on a caption. `data-layer` is on
 * the data rows and on nothing else.
 */
const hostRow = `${rulesCard} tbody tr[data-layer="host"]`;
const guestRow = `${rulesCard} tbody tr[data-layer="guest"]`;

/** The heading the merged table puts above the rules read out of the guest. */
const guestSection = `${rulesCard} tbody tr:has-text("In deinem Server")`;

/** The warning that a second firewall is running inside the server. */
const guestAlert = '[data-testid="alert"]:has-text("läuft ebenfalls")';

/** Create, generate and refresh, in the order the header renders them. */
const headerButton = (index: number) =>
  `${rulesCard} [data-slot="card-header"] button >> nth=${index}`;

/**
 * Opens a Radix select and waits until its list is really on screen.
 *
 * Confirmed rather than assumed, and pressed again if it did not take: a select
 * opens on `pointerdown` and has its own opinion about the `pointerup` that
 * follows, and a beat that spends eight seconds naming three options over a
 * closed select is a lost take.
 */
async function openSelect(stage: Stage, trigger: string): Promise<void> {
  const list = stage.page.getByRole("listbox").first();

  const opened = () =>
    list.waitFor({ state: "visible", timeout: 2_000 }).then(
      () => true,
      () => false,
    );

  await stage.click(trigger);

  if (await opened()) return;

  await stage.click(trigger);
  await list.waitFor({ state: "visible", timeout: 5_000 });
}

/** An option in whatever list is open, by its label. */
const option = (stage: Stage, name: string) =>
  stage.page.getByRole("option", { name, exact: true });

/** Opens the protocol combobox and waits for its search field. */
async function openProtocols(stage: Stage): Promise<void> {
  await stage.click("#proto");
  await stage.page
    .getByPlaceholder("Nach Protokoll suchen...")
    .waitFor({ state: "visible" });
}

/**
 * Picks a value out of an already open protocol combobox.
 *
 * It is a `cmdk` list behind a popover rather than a native select, so the
 * value has to be searched for and then clicked - and the search matters, since
 * the unfiltered list is fifty-two entries long and `tcp` is not near the top.
 *
 * Matched by role rather than by `:text-is`, which matches the *smallest*
 * element carrying the text: `cmdk` wraps each label in a div, so the option
 * itself never qualifies and the selector silently found nothing.
 */
async function chooseProtocol(stage: Stage, protocol: string): Promise<void> {
  /* The popover may be reopened with the previous search still in it. */
  await stage.page.keyboard.press("Control+a");
  await stage.page.keyboard.type(protocol, { delay: 90 });
  await stage.hold(250);
  await stage.click(option(stage, protocol));
}

/** Opens the protocol combobox and picks one value out of it. */
async function pickProtocol(stage: Stage, protocol: string): Promise<void> {
  await openProtocols(stage);
  await chooseProtocol(stage, protocol);
}

/** Anything that means the generation is over, one way or another. */
const GENERATED = `${dialog} button:has-text("Anwenden"), ${dialog} :text-is("Keine Regeln erforderlich.")`;
const GENERATION_FAILED =
  '[data-sonner-toast]:has-text("nicht generiert werden")';

/**
 * Waits for the model, and presses the button again if it gave up.
 *
 * "Keine Regeln erforderlich" is a valid answer rather than a failure - the
 * model may decide the server already satisfies the request - so both outcomes
 * end the wait. A genuine failure is worth exactly one retry: the request has a
 * 25 second budget of its own, and losing a whole take to one slow call is a
 * poor trade when the interface is asking to be pressed again. The retry
 * happens inside the cut, so it never reaches the finished video.
 */
async function awaitGeneration(stage: Stage): Promise<void> {
  const settle = async () => {
    await stage.page
      .locator(`${GENERATED}, ${GENERATION_FAILED}`)
      .first()
      .waitFor({ state: "visible", timeout: 60_000 });

    return (await stage.locate(GENERATION_FAILED).count()) === 0;
  };

  if (await settle()) return;

  console.warn("[firewall] generation failed, retrying once");

  await stage
    .locate(GENERATION_FAILED)
    .first()
    .waitFor({ state: "hidden", timeout: 20_000 })
    .catch(() => {
      /* The toast dismisses itself; a slow one is not fatal. */
    });

  await stage.click(`${dialog} button:has-text("Generieren")`);

  if (!(await settle())) {
    throw new Error(
      "rule generation failed twice - check AI_GATEWAY_API_KEY and the gateway's latency",
    );
  }
}

const storageState = await ensureSession();

await ensureSession();

const serverId = await prepareFirewallScene({
  userId: CUSTOMER_ID,
  rebuild: process.argv.includes("--rebuild"),
});

/** Applies whichever apply button the generation produced, if any. */
async function applyGenerated(stage: Stage): Promise<void> {
  /*
   * `:has-text` would also match "Alle anwenden", so the single-rule button is
   * matched exactly. Which one is shown depends on how many rules the model
   * came back with, and both are worth showing.
   */
  const applyAll = stage.locate(`${dialog} button:text-is("Alle anwenden")`);
  const applyOne = stage.locate(`${dialog} button:text-is("Anwenden")`);

  if ((await applyAll.count()) > 0) {
    await stage.click(applyAll);
  } else if ((await applyOne.count()) > 0) {
    await stage.click(applyOne.first());
  }
}

/**
 * One row of the recommendations card, found by what it says.
 *
 * By its words rather than by its position: the card is generated from whatever
 * the guest reports and sorted by severity, so "the first remove button" is
 * whichever finding happens to sort first - which once meant the cursor landed
 * on a rule the video had created a minute earlier while the narration talked
 * about a long-dead one.
 */
const finding = (stage: Stage, text: string) =>
  stage
    .locate(`${findingsCard} [data-testid="item-row"]`)
    .filter({ hasText: text });

/**
 * Opens the rule the exposure finding prepares, and closes it again.
 *
 * The dialog is opened rather than pointed at, because the narration says "ein
 * Klick, und die passende Regel ist vorbereitet" and pointing at the button
 * without pressing it made that line a promise the picture did not keep. It is
 * dismissed rather than submitted: the rule the AI section writes a minute
 * later is the better answer to the same problem, and creating both would leave
 * the episode arguing with itself.
 */
async function showPreparedRule(stage: Stage): Promise<void> {
  const exposed = finding(stage, "Redis");

  if ((await exposed.count()) === 0) {
    console.warn("[firewall] no exposed-port finding to act on");
    return;
  }

  await stage.click(exposed.getByRole("button", { name: "Regel erstellen" }));
  await stage.locate(dialog).waitFor({ state: "visible" });
  await stage.hold(2_000);
  await stage.page.keyboard.press("Escape");
  await stage.locate(dialog).waitFor({ state: "hidden" });
  await stage.hold(400);
}

/** Deletes the rule the orphan finding is about. It really is deleted. */
async function removeOrphanRule(stage: Stage): Promise<void> {
  const orphan = finding(stage, "8080");

  if ((await orphan.count()) === 0) {
    console.warn("[firewall] no orphan-rule finding to act on");
    return;
  }

  await stage.click(orphan.getByRole("button", { name: "Regel entfernen" }));

  /*
   * Short, and allowed to expire. The row goes when the analysis refetches,
   * which is a cache away and not worth a beat's worth of dead air: the rule
   * is deleted either way, and waiting thirty seconds for the card to catch
   * up stretched this beat to three times its narration.
   */
  await orphan.waitFor({ state: "detached", timeout: 6_000 }).catch(() => {});
  await stage.hold(700);
}

// --- the wide edit ---------------------------------------------------------

const LANDSCAPE_BEATS: Beat[] = [
  {
    say: "Jeder Server bei Virtbase hat eine eigene Firewall. Sie läuft vor deinem Server, nicht darin. Aussperren kannst du dich damit also nicht.",
    tail: 500,
  },
  {
    /*
     * "Auf diesem Server", not "standardmäßig". A new server is provisioned
     * with `policy_in: ACCEPT` - see `apply-network-config.ts` - and this one
     * only drops because the scene sets it to. Describing the scene as the
     * default would be the one kind of mistake a video cannot correct later.
     */
    say: "Ganz oben stehen die Standardaktionen. Die Firewall ist immer aktiv, und auf diesem Server werden eingehende Pakete verworfen und ausgehende erlaubt.",
    lead: 700,
    act: async (stage) => {
      await stage.focusOn(card("Eingehende Pakete"), 1.5);
      await stage.pointAt(policySelect("Eingehende Pakete"));
    },
  },
  {
    say: "Für beide Richtungen stehen dieselben drei Aktionen zur Auswahl.",
    lead: 300,
    act: async (stage) => {
      /*
       * Out of the lens first. A select is portalled into the transformed body
       * but positioned from the trigger's on-screen rect, so the transform
       * would be applied to that position a second time.
       */
      await stage.wide(450);
      await openSelect(stage, policySelect("Eingehende Pakete"));
      await stage.hold(400);
    },
  },
  {
    say: "Akzeptieren lässt das Paket durch.",
    act: async (stage) => {
      await stage.pointAt(option(stage, "Akzeptieren"));
      await stage.hold(400);
    },
  },
  {
    say: "Verwerfen blockiert still: Es geht keine Antwort zurück, der Absender läuft in eine Zeitüberschreitung.",
    act: async (stage) => {
      await stage.pointAt(option(stage, "Verwerfen"));
      await stage.hold(400);
    },
  },
  {
    say: "Ablehnen blockiert offen und schickt sofort eine Fehlermeldung zurück.",
    act: async (stage) => {
      await stage.pointAt(option(stage, "Ablehnen"));
      await stage.hold(400);
    },
  },
  {
    say: "Zum Blockieren empfehlen wir Verwerfen. Wer deinen Server scannt, erfährt so nicht einmal, welche Ports du überhaupt benutzt.",
    tail: 400,
    act: async (stage) => {
      await stage.page.keyboard.press("Escape");
      await stage.hold(300);
    },
  },
  {
    say: "Ausgeliefert wird ein Server mit Akzeptieren in beide Richtungen. Eingehend auf Verwerfen zu stellen ist der erste Schritt, den wir dir empfehlen.",
    tail: 300,
  },
  {
    say: "Denn dann braucht alles, was hereinkommen soll, eine eigene Regel.",
    lead: 400,
    act: async (stage) => {
      await stage.focusOn(stage.locate(hostRow).first(), 1.4);
    },
  },
  {
    say: "Die Liste wird von oben nach unten geprüft, und die erste passende Regel entscheidet.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(stage.locate(hostRow).first(), { fx: 0.2 });
      await stage.hold(500);
      await stage.pointAt(stage.locate(hostRow).last(), { fx: 0.2 });
      await stage.hold(500);
    },
  },
  {
    say: "Spezielle Regeln gehören deshalb nach oben, allgemeine Sperren nach unten.",
    tail: 300,
  },
  {
    say: "Und nimmst du den Haken weg, wird die Regel übersprungen - löschen musst du sie dafür nicht.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(stage.locate(hostRow).first().getByRole("checkbox"));
      await stage.hold(700);
      await stage.wide();
    },
  },
  {
    say: "Eine neue Regel legst du über das Plus an.",
    act: async (stage) => {
      await stage.click(headerButton(0));
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(400);
    },
  },
  {
    say: "Die Richtung sagt, ob die Regel für eingehenden oder ausgehenden Verkehr gilt, und bei der Aktion stehen dieselben drei wie oben.",
    lead: 400,
    act: async (stage) => {
      await stage.pointAt("#direction");
      await stage.hold(500);
      await stage.pointAt("#action");
      await stage.hold(400);
    },
  },
  {
    say: `Beim Protokoll steht der Stern für alle. Auswählen kannst du aus ${FIRWALL_PROTOCOLS.length} einzelnen Protokollen.`,
    lead: 300,
    act: async (stage) => {
      /* The star is on the trigger, so it is worth a moment before the list
         covers it up. */
      await stage.pointAt("#proto");
      await stage.hold(700);
      await openProtocols(stage);
      await stage.hold(600);
    },
  },
  {
    say: "Von TCP und UDP über ICMP bis zu GRE, ESP und SCTP.",
    act: async (stage) => {
      /* Over the list before scrolling it. A wheel event goes to whatever is
         under the pointer, which after opening the combobox is still its
         trigger - and the popover stops the wheel from reaching the page, so
         this scrolls the protocols rather than the dashboard behind them. */
      await stage.pointAt(option(stage, "icmp"));
      await stage.page.mouse.wheel(0, 260);
      await stage.hold(500);
      await stage.page.mouse.wheel(0, 260);
      await stage.hold(400);
    },
  },
  {
    say: "Wählst du ICMP, verschwinden die Ports und das Formular fragt stattdessen nach dem ICMP-Typ.",
    lead: 300,
    act: async (stage) => {
      await chooseProtocol(stage, "icmp");
      await stage.hold(600);
      await stage.pointAt("#icmp_type");
    },
  },
  {
    say: "Echo-Request ist zum Beispiel ein Ping.",
    act: async (stage) => {
      await openSelect(stage, "#icmp_type");
      /* Radix' own type-ahead, which scrolls the list to the match: there are
         37 ICMP types and echo-request is not one of the first. */
      await stage.page.keyboard.type("echo-req", { delay: 60 });
      await stage.hold(400);
      await stage.pointAt(option(stage, "echo-request"));
      await stage.hold(600);
      await stage.page.keyboard.press("Escape");
    },
  },
  {
    say: "Quell- und Zielport gibt es nur bei Protokollen, die Ports kennen: TCP, UDP, DCCP, SCTP und UDP-Lite.",
    lead: 300,
    act: async (stage) => {
      await pickProtocol(stage, "tcp");
      await stage.hold(500);
      await stage.pointAt("#dport");
    },
  },
  {
    say: "Für HTTPS also TCP, Zielport 443, dazu ein Kommentar zur Erinnerung.",
    lead: 300,
    act: async (stage) => {
      await stage.type("#dport", "443");
      await stage.type("#comment", "HTTPS");
    },
  },
  {
    say: "Mit Quelle beschränkst du die Regel auf eine Adresse oder ein Netz. Leer heißt: von überall.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt("#source");
      await stage.hold(900);
    },
  },
  {
    say: "Haken bei Aktiviert, erstellen - und die Regel steht sofort ganz oben in der Liste.",
    tail: 700,
    act: async (stage) => {
      await stage.click("#enabled");
      await stage.click(`${dialog} button[type="submit"]`);
      await stage.locate(dialog).waitFor({ state: "hidden" });
      await stage.hold(1_500);
      await stage.focusOn(stage.locate(hostRow).first(), 1.4);
      await stage.hold(500);
    },
  },
  {
    say: "Bestehende Regeln verschiebst du mit den Pfeilen nach oben oder unten.",
    lead: 300,
    act: async (stage) => {
      /*
       * A locator, not a string: `>> nth=` has to end a selector, so anything
       * appended after it is parsed as part of the index rather than as a
       * descendant.
       */
      const row = stage.locate(hostRow).nth(1);

      await stage.focusOn(row, 1.5);
      await stage.pointAt(
        row.locator('button[aria-label="Nach oben bewegen"]'),
      );
      await stage.hold(500);
      await stage.pointAt(
        row.locator('button[aria-label="Nach unten bewegen"]'),
      );
      await stage.hold(400);
    },
  },
  {
    say: "Über das Menü bearbeitest oder löschst du sie.",
    lead: 200,
    act: async (stage) => {
      /* Out of the lens before the menu opens, for the same reason a select is
         opened wide: a portalled menu would be positioned twice. */
      await stage.wide(450);
      /* The last button in the row, not the third: the enabled checkbox is a
         button too, so counting from the left lands on "nach unten bewegen"
         and quietly reorders the customer's rules instead of opening a menu. */
      await stage.click(stage.locate(hostRow).nth(1).locator("button").last());
      await stage.hold(1_200);
      await stage.page.keyboard.press("Escape");
    },
  },
  {
    say: "Auf diesem Server läuft noch eine zweite Firewall: ufw, direkt im Gast.",
    lead: 400,
    act: async (stage) => {
      await stage.focusOn(guestAlert, 1.3);
      await stage.hold(900);
    },
  },
  {
    say: "Virtbase erkennt ufw, firewalld, nftables und iptables von selbst, über den Gast-Agenten - und warnt dich, weil dein Verkehr durch beide muss.",
    lead: 300,
    tail: 400,
  },
  {
    say: "Beide stehen in derselben Tabelle: oben die Virtbase-Firewall, darunter die Regeln aus deinem Server.",
    lead: 400,
    act: async (stage) => {
      /* Let the lens come out before it goes back in somewhere else: the two
         transitions on top of each other read as a stumble. */
      await stage.wide(400);
      await stage.hold(450);
      await stage.focusOn(guestSection, 1.35);
      await stage.hold(900);
    },
  },
  {
    say: "Lesen kannst du sie hier, ändern nicht - das Schloss heißt: verwaltet wird im Server selbst.",
    lead: 400,
    act: async (stage) => {
      await stage.wide(450);
      await stage.pointAt(
        stage
          .locate(guestRow)
          .first()
          .locator('[aria-label="Wird in deinem Server verwaltet"]'),
      );
      await stage.hold(1_400);
    },
  },
  {
    say: "Und jede Zeile steht so da, wie ufw sie selbst ausgibt.",
    tail: 500,
    act: async (stage) => {
      /* The cell holding the untouched line, found by the verdict ufw printed
         in it: the last cell is the empty actions column, and counting to the
         comment column would break the next time one is added. */
      await stage.pointAt(
        stage.locate(guestRow).nth(1).locator('td:has-text("ALLOW")'),
      );
      await stage.hold(1_400);
    },
  },
  {
    say: "Aus beidem zusammen entsteht die Karte Empfehlungen.",
    lead: 400,
    act: async (stage) => {
      await stage.focusOn(findingsCard, 1.3);
      await stage.hold(700);
    },
  },
  {
    say: "Virtbase liest die offenen Ports in deinem Server und vergleicht sie mit beiden Regelwerken.",
    lead: 300,
  },
  {
    say: "Redis lauscht hier auf allen Adressen, und beide Firewalls lassen es durch - deshalb steht der Fund ganz oben und ist rot.",
    lead: 300,
    act: async (stage) => {
      await stage.pointAt(finding(stage, "Redis"), { fx: 0.15 });
      await stage.hold(900);
    },
  },
  {
    say: "Ein Klick, und die passende Regel ist vorbereitet: eingehend, verwerfen, Port 6379.",
    lead: 300,
    act: async (stage) => {
      await stage.wide(450);
      await showPreparedRule(stage);
    },
  },
  {
    say: "Port 9000 ist in der Virtbase-Firewall offen, aber ufw blockiert ihn - deshalb kommt trotzdem nichts an.",
    lead: 400,
    act: async (stage) => {
      await stage.focusOn(finding(stage, "9000"), 1.35);
      await stage.hold(900);
    },
  },
  {
    say: "Ändern kannst du das nur im Server selbst, und genau das sagt die Empfehlung auch.",
    tail: 300,
  },
  {
    say: "Und wo längst kein Dienst mehr lauscht, entfernst du die veraltete Regel direkt hier.",
    lead: 300,
    act: async (stage) => {
      await removeOrphanRule(stage);
    },
  },
  {
    say: "SSH, HTTP und HTTPS stehen bewusst nicht in der Liste. Eine Warnung, die auf jedem Server steht, liest irgendwann niemand mehr.",
    lead: 300,
    tail: 500,
    act: async (stage) => {
      await stage.wide();
    },
  },
  {
    say: "Wenn du nicht in Ports denken willst, übernimmt das die KI.",
    act: async (stage) => {
      await stage.click(headerButton(1));
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(400);
    },
  },
  {
    say: "Beschreib in einem Satz, was du brauchst.",
    act: async (stage) => {
      await stage.type(
        "#prompt",
        "Die Datenbank soll nur aus dem internen Netz erreichbar sein.",
        38,
      );
    },
  },
  {
    say: "Virtbase schlägt dann konkrete Regeln vor.",
    lead: 250,
    act: async (stage) => {
      await stage.click(`${dialog} button:has-text("Generieren")`);
    },
  },
  {
    /*
     * Said over the spinner, on purpose. The model takes fifteen to twenty
     * seconds, and this is the one thing worth knowing about the feature that
     * the screen cannot show: it is a sentence that costs nothing to place
     * here and turns dead air into the answer to "how would it know that".
     */
    say: "Das Modell kennt dabei deine bestehenden Regeln, die Standardaktionen und die Ports, auf denen dein Server wirklich lauscht.",
    lead: 200,
  },
  {
    /*
     * Silent on purpose. A viewer should not spend the rest of the wait
     * watching a spinner - but a cut may not overlap narration, so the waiting
     * gets a beat with nothing to say and `stage.cut` removes the middle of
     * it. The request is really made and really waited for; only the dead air
     * is missing.
     */
    act: async (stage) => {
      await stage.cut(() => awaitGeneration(stage), { keep: 1_100 });
    },
  },
  {
    say: "Im Klartext siehst du, was angelegt wird - und in deiner Firewall landet nichts, bevor du es übernimmst.",
    lead: 300,
    tail: 800,
    act: async (stage) => {
      await applyGenerated(stage);
      await stage.hold(2_000);
      await stage.page.keyboard.press("Escape");
      await stage.locate(dialog).waitFor({ state: "hidden" });
    },
  },
  {
    say: "Das ist die Firewall bei Virtbase: drei Standardaktionen, Regeln in der richtigen Reihenfolge, die Firewall im Gast daneben, Vorschläge per KI und Empfehlungen aus deinem laufenden Server.",
    lead: 300,
    tail: 1_400,
    act: async (stage) => {
      await stage.wide();
      await stage.page.mouse.wheel(0, -1_600);
    },
  },
];

// --- the portrait edit -----------------------------------------------------
//
// The same order, less depth. A phone screen shows one card at a time, so the
// pacing is scroll-then-talk rather than zoom-then-talk, and there is no lens:
// at 360 CSS pixels the interface is already the size a reader wants.
// Reordering rules is dropped entirely - those controls sit off the right-hand
// edge of a horizontally scrollable table on a phone, and chasing them would be
// a worse demonstration than leaving them out. So is the ICMP type: it is a
// second dependent field inside a drawer, and it costs more screen than it
// teaches here.

const PORTRAIT_BEATS: Beat[] = [
  {
    say: "Jeder Server bei Virtbase hat eine eigene Firewall. Sie läuft vor deinem Server, nicht darin.",
    tail: 400,
  },
  {
    say: "Auf diesem Server werden eingehende Pakete verworfen und ausgehende erlaubt.",
    lead: 500,
    act: async (stage) => {
      await stage.reveal(card("Eingehende Pakete"));
      await stage.pointAt(policySelect("Eingehende Pakete"));
      await stage.hold(500);
    },
  },
  {
    say: "Zur Auswahl stehen drei Aktionen.",
    act: async (stage) => {
      await openSelect(stage, policySelect("Eingehende Pakete"));
      await stage.hold(400);
    },
  },
  {
    say: "Verwerfen antwortet gar nicht, der Absender läuft in eine Zeitüberschreitung. Ablehnen schickt sofort eine Fehlermeldung.",
    act: async (stage) => {
      await stage.pointAt(option(stage, "Verwerfen"));
      await stage.hold(700);
      await stage.pointAt(option(stage, "Ablehnen"));
      await stage.hold(500);
    },
  },
  {
    say: "Ausgeliefert wird beides mit Akzeptieren. Stell eingehend auf Verwerfen: So erfährt ein Scanner nicht einmal, welche Ports du benutzt.",
    tail: 300,
    act: async (stage) => {
      await stage.page.keyboard.press("Escape");
      await stage.hold(300);
    },
  },
  {
    say: "Alles, was dann hereinkommen soll, braucht eine eigene Regel.",
    lead: 300,
    act: async (stage) => {
      await stage.reveal(rulesCard);
      await stage.hold(600);
    },
  },
  {
    say: "Die Tabelle wischst du zur Seite, um Aktion, Protokoll und Port zu sehen.",
    lead: 300,
    act: async (stage) => {
      const table = `${rulesCard} table`;

      await stage.pan(table, "end");
      await stage.hold(900);
      await stage.pan(table, "start");
    },
  },
  {
    say: "Geprüft wird von oben nach unten, und die erste passende Regel entscheidet.",
    tail: 300,
  },
  {
    say: "Eine neue Regel legst du über das Plus an.",
    act: async (stage) => {
      await stage.click(headerButton(0));
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(500);
    },
  },
  {
    say: "Richtung eingehend, Aktion akzeptieren.",
    lead: 400,
    act: async (stage) => {
      await stage.pointAt("#direction");
      await stage.hold(400);
      await stage.pointAt("#action");
      await stage.hold(300);
    },
  },
  {
    say: `Dazu ${FIRWALL_PROTOCOLS.length} Protokolle - Ports haben davon nur TCP, UDP, DCCP, SCTP und UDP-Lite.`,
    lead: 300,
    act: async (stage) => {
      await openProtocols(stage);
      await stage.hold(800);
      await chooseProtocol(stage, "tcp");
    },
  },
  {
    say: "Zielport 443 für HTTPS, aktivieren, erstellen.",
    lead: 300,
    tail: 900,
    act: async (stage) => {
      await stage.type("#dport", "443");
      await stage.type("#comment", "HTTPS");
      await stage.click("#enabled");
      await stage.click(`${dialog} button[type="submit"]`);
      await stage.locate(dialog).waitFor({ state: "hidden" });
      await stage.hold(1_200);
    },
  },
  /*
   * The guest rules before the warning that explains them, which is the
   * opposite of the wide cut. On a phone the page is a column - options,
   * warning, recommendations, rules - and introducing the warning first would
   * mean scrolling up, back down into the table and up again. This way there
   * is one jump, and everything after it moves down the page.
   */
  {
    say: "Auf diesem Server läuft zusätzlich ufw, eine zweite Firewall im Gast. Ihre Regeln stehen unten in derselben Tabelle.",
    lead: 400,
    act: async (stage) => {
      await stage.reveal(guestSection);
      await stage.hold(1_200);
    },
  },
  {
    say: "Virtbase erkennt sie von selbst und warnt dich. Ändern kannst du sie nur im Server selbst.",
    lead: 300,
    act: async (stage) => {
      await stage.reveal(guestAlert);
      await stage.hold(900);
    },
  },
  {
    say: "Die Empfehlungen vergleichen beide Firewalls mit dem, was dein Server wirklich offen hat.",
    lead: 400,
    act: async (stage) => {
      await stage.reveal(findingsCard);
      await stage.hold(700);
    },
  },
  {
    say: "Redis ist aus dem Internet erreichbar - ein Tippen, und die passende Regel ist vorbereitet.",
    lead: 300,
    act: async (stage) => {
      await showPreparedRule(stage);
    },
  },
  {
    say: "Port 9000 blockiert ufw, und wo nichts mehr lauscht, entfernst du die alte Regel direkt.",
    lead: 300,
    act: async (stage) => {
      await stage.reveal(findingsCard);
      await removeOrphanRule(stage);
    },
  },
  {
    say: "Oder du lässt die KI ran.",
    act: async (stage) => {
      await stage.reveal(rulesCard);
      await stage.click(headerButton(1));
      await stage.locate(dialog).waitFor({ state: "visible" });
      await stage.hold(400);
    },
  },
  {
    say: "Beschreib in einem Satz, was du brauchst.",
    act: async (stage) => {
      await stage.type(
        "#prompt",
        "Die Datenbank soll nur aus dem internen Netz erreichbar sein.",
        38,
      );
    },
  },
  {
    say: "Virtbase schlägt dann konkrete Regeln vor.",
    lead: 250,
    act: async (stage) => {
      await stage.click(`${dialog} button:has-text("Generieren")`);
    },
  },
  {
    say: "Deine bestehenden Regeln und die offenen Ports kennt das Modell dabei.",
    lead: 200,
  },
  {
    act: async (stage) => {
      await stage.cut(() => awaitGeneration(stage), { keep: 1_000 });
    },
  },
  {
    say: "Du siehst genau, was angelegt wird, und übernimmst es mit einem Tippen.",
    lead: 300,
    tail: 700,
    act: async (stage) => {
      await applyGenerated(stage);
      await stage.hold(1_800);
      await stage.page.keyboard.press("Escape");
      await stage.locate(dialog).waitFor({ state: "hidden" });
    },
  },
  {
    say: "Firewall bei Virtbase: Regeln, die zweite Firewall im Gast, KI-Vorschläge und Empfehlungen aus deinem laufenden Server.",
    lead: 300,
    tail: 1_400,
    act: async (stage) => {
      await stage.reveal(card("Eingehende Pakete"));
    },
  },
];

const dryRun = process.argv.includes("--dry");
/*
 * Hardware encoding, off unless asked for. It is about five times quicker and
 * measurably worse on this content - see `videoEncoder` - so it belongs to
 * iteration, not to the cut that gets published.
 */
const gpu = process.argv.includes("--gpu");

const url = appUrl(`/servers/${serverId}/firewall`);

/**
 * Waits until the page has noticed the firewall inside the guest.
 *
 * One inspection is cached server-side for ninety seconds, so the first page
 * load after `prepare` installed or reset ufw can legitimately still be
 * answering from the state before it - and half this episode is about a warning
 * that would then not be on screen. Reloading does not shorten the wait, since
 * the cache is on the server, so this simply keeps looking until it turns over.
 *
 * It costs nothing in the finished video: `open()` runs before the screencast
 * starts, so a wait here is wall-clock time rather than footage.
 */
async function awaitGuestFirewall(stage: Stage): Promise<void> {
  const deadline = Date.now() + 210_000;

  while (Date.now() < deadline) {
    /*
     * [!] Waited for, not sampled.
     *
     * `isVisible()` answers about this instant, and this instant is the worst
     * one to ask about: the warning is client-only and arrives with a query,
     * so a check fired the moment the rules card renders is always too early.
     * Sampling then sleeping then reloading asked at exactly the wrong point
     * of every cycle and could have sat here until the deadline with the
     * warning on screen for fourteen of every fifteen seconds.
     */
    const arrived = await stage
      .locate(guestAlert)
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(
        () => true,
        () => false,
      );

    if (arrived) return;

    console.log("[firewall] waiting for the guest inspection to turn over");

    await stage.page.reload({ waitUntil: "domcontentloaded" });
    await stage.locate(rulesCard).waitFor({ state: "visible" });
  }

  throw new Error(
    "the firewall inside the guest was never detected - re-run bun script video/prepare",
  );
}

/** Waits for the page to be worth filming: rules listed, analysis done. */
const settle = async (stage: Stage) => {
  await stage.goto(url);
  await stage.locate(rulesCard).waitFor({ state: "visible" });
  /*
   * The recommendations run commands inside the guest and are cached for
   * ninety seconds. Waiting for the card means the take is filmed against a
   * warm cache instead of opening on a spinner.
   */
  await stage.locate(findingsCard).waitFor({
    state: "visible",
    timeout: 180_000,
  });
  await awaitGuestFirewall(stage);
  await stage.hold(1_200);
};

const THUMBNAIL = {
  /* Two lines each, as the reference sets them: a monospace kicker above a
     two-line headline, and a two-line subtitle on the portrait cover. */
  eyebrow: "Regeln, KI-Vorschläge\nund Empfehlungen",
  title: "Firewall\neinrichten",
  subtitle: "Regeln, KI und Empfehlungen\naus deinem Server.",
};

/**
 * A moment inside the line that starts with this, in seconds.
 *
 * The cover frames are chosen by what is being said rather than by a timecode,
 * because a timecode is wrong the next time a sentence is added anywhere before
 * it - which is how a cover ends up being a half-open dialog.
 */
const whileSaying = (take: Take, start: string): number => {
  const cue = take.cues.find((line) => line.text.startsWith(start));

  if (!cue) {
    throw new Error(`no narration starts with "${start}"`);
  }

  return cue.start + cue.duration / 2;
};

// --- the wide cut ----------------------------------------------------------

const landscape = await recordEpisode({
  name: "firewall",
  storageState,
  dryRun,
  gpu,
  open: settle,
  beats: LANDSCAPE_BEATS,
});

// --- the portrait cut ------------------------------------------------------
//
// Filmed, not cropped. A 9:16 slice of a 16:9 dashboard is 31% of its width,
// and letterboxing the wide cut into a tall frame gives a phone-shaped video of
// a desktop screenshot. Filming the app's own mobile layout at 360 CSS pixels
// instead means everything on screen is already the size a phone would show it.
// It is also a shorter edit: reordering rules lives off the right-hand edge of
// a scrollable table on a phone, and a vertical feed is not the place for it.

let portrait: Take | null = null;

if (!process.argv.includes("--no-vertical")) {
  /*
   * The scene, again, between the takes.
   *
   * An episode changes the server it is filmed on: the wide cut deletes the
   * orphaned rule, creates one for 443 and applies whatever the model wrote.
   * Filming the second cut against what the first one left behind meant a
   * recommendations card one finding short - the portrait take's own line about
   * removing a rule nothing listens on had nothing to remove, and said so into
   * a cut that still showed the sentence.
   *
   * Seconds on a guest that is already up, and it is the only thing that keeps
   * the two cuts telling the same story.
   */
  await prepareFirewallScene({ userId: CUSTOMER_ID });

  portrait = await recordEpisode({
    name: "firewall-portrait",
    storageState,
    dryRun,
    gpu,
    mobile: true,
    /* 360x640 at 3x is exactly 1080x1920, and a phone-sized viewport. */
    viewport: { width: 360, height: 640 },
    scale: 3,
    output: { width: 1080, height: 1920 },
    open: settle,
    beats: PORTRAIT_BEATS,
  });
}

if (dryRun) process.exit(0);

// --- deliverables ----------------------------------------------------------

const tools = await ensureTools("thorsten-high");
const out = workspaceFor("firewall").output;

const cover = await renderThumbnail({
  tools,
  video: landscape.video,
  /* The closing line: the lens is out and the whole page is on screen. */
  spec: { ...THUMBNAIL, backdropAt: whileSaying(landscape, "Das ist die") },
  shape: "youtube",
  output: join(out, "firewall.de.thumbnail.png"),
});
console.log(`[thumbnail] ${cover}`);

if (portrait) {
  /* The portrait cover shows a portrait frame - taken from that cut, not the
     wide one, so the card holds a phone screen rather than a letterbox. The
     rules table is what it holds: a list of rules reads as the feature at a
     glance, where a card of body text does not. */
  const portraitCover = await renderThumbnail({
    tools,
    video: portrait.video,
    spec: {
      ...THUMBNAIL,
      backdropAt: whileSaying(portrait, "Alles, was dann hereinkommen"),
    },
    shape: "vertical",
    output: join(out, "firewall.de.vertical-cover.png"),
  });

  const captionPath = join(
    workspaceFor("firewall-portrait").frames,
    "..",
    "captions.ass",
  );

  await Bun.write(
    captionPath,
    captions(portrait.cues, {
      width: 1080,
      height: 1920,
      fontSize: 44,
      /* Low enough to clear the interface, high enough to clear the
         platform's own controls along the bottom edge. */
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
    output: join(out, "firewall.de.vertical.mp4"),
  });
}

console.log(`\n${landscape.video}`);
process.exit(0);
