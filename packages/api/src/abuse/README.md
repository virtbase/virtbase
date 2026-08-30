# The abuse desk

Signal intake, case management, graduated server enforcement and the
correspondence around all three.

Everything that arrives — an Alertmanager alert, an AbuseIPDB finding, an email
to `abuse@`, an operator opening a case by hand — is normalised into one
envelope, attributed to a customer **as of when it happened**, run past a rule
set, and turned into a case, an enforcement decision and a set of
notifications.

```
sources ──▶ intake ──▶ decision ──▶ effects
            │          │            │
            │          │            ├─ lock servers      (enforce.ts)
            │          │            ├─ block new orders  (ordering.ts)
            │          │            ├─ notify            (../notifications)
            │          │            └─ mint case mailbox (mailbox/)
            │          ├─ match rules      (rules.ts)
            │          └─ open or join     (case.ts)
            ├─ sanitise               (sanitize.ts)
            ├─ deduplicate            (source, external_id)
            └─ attribute              (resolve-subject.ts)
```

## Where the code lives

| Layer | Path | Contents |
| --- | --- | --- |
| 2 Ports | `packages/ports/src/signal.ts` | `InboundSignal`, `SignalIntake`, `EnforcementLevel` |
| 2 Ports | `packages/ports/src/abuse-source.ts` | `AbuseSource` — pull sources only |
| 2 Ports | `packages/ports/src/ip-reputation.ts` | `IpReputationProvider` |
| 2 Ports | `packages/ports/src/notification-channel.ts` | `NotificationChannel` |
| 1 Platform | `packages/db/src/schema/abuse-*.ts`, `notifications.ts` | 11 tables, 15 enums |
| 1 Platform | `packages/config/src/notification-target-store.ts` | encrypted operator destinations |
| 4 Integrations | `packages/integration-alertmanager` | inbound alerts, three payload formats |
| 4 Integrations | `packages/integration-abuseipdb` | `abuse` + `ipReputation` |
| 4 Integrations | `packages/integration-webhook` | outbound operator notifications |
| 5 Composition | `packages/api/src/abuse` | this directory |
| 5 Composition | `packages/api/src/notifications` | the dispatcher |
| 5 Composition | `packages/api/src/router/abuse.ts` | the customer's tRPC surface |
| 5 Composition | `apps/web/src/features/admin/{api,components}/abuse` | the operator console |

The domain lives inside `packages/api` rather than the Layer 3
`packages/abuse` slot the layer rules reserve, because enforcement needs
Proxmox and Proxmox lives in `packages/api/src/proxmox`. It is written so the
eventual extraction is a move: no tRPC types in the core, no Next imports,
every external effect behind a port.

## Two things that are load-bearing

**Attribution is time-scoped.** `resolveSignalSubject()` reads
`subnet_allocations` as it stood at `signal.occurredAt`, not now. A report
arrives hours or days late and addresses get reallocated; resolving against
today's allocation is how an abuse desk suspends the wrong customer. When the
holder then and the holder now differ, the case is marked `stale_attribution`
and **never enforces automatically** — the server on that address today
belongs to somebody who did nothing.

**A lock the customer can delete is not a lock.** Their own API can edit
firewall options and the network device. `/api/cron/reconcile-abuse-locks`
re-reads the real hypervisor state every five minutes and puts back anything
that drifted, counting each occurrence on `abuse_case_servers.drift_count`.
Drift is evidence, not a bug report.

It re-asserts for **live cases only**, and finishes the releases that could not
be finished at the time. A settled case whose release met an unreachable node
leaves a row that still says "locked", and reading that as drift would re-lock
a paying customer every five minutes on a `resolved` case while the audit trail
blamed them for removing it. So a row belonging to a case that is `resolved` or
`rejected`, or to one whose release has already run, is released here instead -
which is also the retry, since a release is otherwise reached only from an
operator settling the case.

## What can happen to a server

| Level | Mechanism | Customer keeps |
| --- | --- | --- |
| `none` | case only | everything |
| `throttle` | `rate=` on the guest NIC | network, console, data |
| `isolate` | firewall `enable: 1, policy_out: DROP` | data, console, the ability to fix it |
| `power_off` | `onboot: false`, then stop | data, console once released |
| `terminate` | sets `terminates_at`, hands over to the existing deletion lifecycle | the normal deletion grace period |

Every level below `terminate` is reversible and stores what it replaced in
`abuse_case_servers.previous_state`, so a release restores the customer's
actual prior firewall policy rather than a default. A guest that was stopped
before the lock is not started by the release.

The column is **keyed by level** - `{ throttle, isolate, power_off }` - because
the ladder is climbed rather than swapped. A case that escalates from
`throttle` to `isolate` has replaced two different things, and each level
records what it found; the release then undoes every level that was applied, in
reverse. Keying it is what stops the second level from reading the first one's
capture as "already recorded" and overwriting nothing, which would leave the
customer's firewall policy unrecorded and their rate limit permanent. Rows
written before the column was keyed hold one bare capture and are still read
correctly: which level took it is decided by which key it carries.

Six router files carry `forbiddenStates: ["abuse-locked"]` — firewall rules and
options, advanced, mounts, template change, backup restore — rejecting with
`ABUSE_LOCKED` rather than a bare `FORBIDDEN` so the UI can point at the case.
Power-on is guarded separately in `router/servers/status.ts` and only when the
level is `power_off`: the other locks leave the guest running, and rebooting is
part of fixing it. Console, status reads, graphs, backup listing and
`resetPassword` stay open deliberately — the customer needs them to fix the
problem.

## Rules

`abuse_rules` is what turns a signal into a decision. First match by `priority`
wins, and the winner's id is written onto the signal, because a suspension has
to be explainable by pointing at the rule that caused it months later.

Every condition on a rule is an `AND`, and **an unset column is not a
condition** — a rule carrying only `match_type` is a catch-all for its
namespace rather than something that matches nothing.

`trusted_source` is the column that matters. Without it a match still opens a
case, but the case lands in `triage` and enforces nothing. A fresh database has
no rules at all, so **every report waits for a person** until somebody writes
one — a safe default rather than a broken one, and the rules page says so at
the top when it is the current state.

`decideNewCase()` is the whole of what a rule may cause, in one function, so
the editor's dry run and the pipeline cannot answer "what would this do"
differently. It refuses to enforce on stale attribution even for a trusted
rule. `terminate` is absent from the rule schema entirely: deleting a
customer's server is the one irreversible level, and an operator signs it on
the case.

The editor is at `/admin.virtbase.com/abuse/rules`. Its dry run
(`dryRunAbuseRules()`) replays a draft — saved or not — against the last 500
signals that reached the matcher, and reports three numbers: how many it
matches, how many it would actually **decide** (the rest being taken first by a
higher-priority rule, named and counted), and how many of those would have
locked a server. It writes nothing. The one thing it cannot recover is a
customer's repeat count as it stood at the time, so a rule gated on
`match_repeat_count_min` reads slightly hot.

## The clocks

`/api/cron/reconcile-abuse-cases` (\*/5) advances three:

1. **Grace window** — `enforce_at` elapses and the decision is applied. A case
   settled inside the window is never enforced at all.
2. **Response deadline** — `respond_by` elapses with no answer, so enforcement
   tightens one level. It stops at `power_off`: destroying data is a decision
   an operator signs, not one a clock reaches.
3. **Observation window** — a `mitigated` case with no new signal closes
   itself and releases everything it locked.

## Sources

| Source | How | Trust |
| --- | --- | --- |
| Alertmanager / Grafana | `POST /api/integrations/alertmanager/alerts` | our own stack; a rule may trust it |
| AbuseIPDB | hourly CIDR sweep of our own ranges | third-party score, confidence-gated |
| `abuse@` mailbox | Resend inbound → `mailbox/receive.ts` | a stranger; always `triage` |
| Operator | admin console | a human decided |
| Internal | `submitSignal` with `source: "internal"` | platform conditions |

Bad or missing ingest tokens answer **404**, matching the Prometheus scrape
endpoint — the endpoint cannot be used to confirm what this deployment runs.

## The mailbox

Each case mints `abuse+<number>.<hmac6>@` on open. The tag is not decoration:
without it the address is guessable and anybody who can count could post into
another customer's case.

Inbound routes through five steps, strongest first: signed address tag →
quoted `Message-ID` → `[AB-1042]` subject token → known sender on a live case →
a new case in `triage`. The weaker steps append to a case but never create one.

Reporters are acknowledged once per contact per case. The loop guards are all
four of: never acknowledge `Auto-Submitted` / `Precedence: bulk|list` / a
`List-Id`; never more than once per contact; never to one of our own domains;
and our own mail carries `Auto-Submitted` so the far side stays quiet.

## Assisted triage

Optional, gated on `AI_GATEWAY_API_KEY`, swept by
`/api/cron/triage-abuse-reports`. It fills in the category and severity an
operator would set by hand and resolves the reported address to a customer.

**It emits no signal.** Rules act on signals, so a classifier that never
produces one cannot cause an enforcement whatever a rule is configured to do —
a structural guarantee rather than a confidence cap someone could later change.
An address it names is discarded unless it appears verbatim in the report,
which makes the model a highlighter rather than a source of facts. The lookup
it then runs is the ordinary time-scoped one, and its answer is carried through
whole: a case it attributes from an address that has been reallocated since
carries `stale_attribution` exactly as a signal's would, so the guard in
`enforceCase` covers a model's reading too. Its output lands as an **internal**
note; a machine's reading of an accusation is not something to put in front of
the accused.

`triage/eval/` measures it against ten real report shapes and exits non-zero on
a miss, so it can gate a prompt or model change:

```
bun --env-file .env packages/api/src/abuse/triage/eval/run.ts
```

## The customer's side

`router/abuse.ts` is session-only — no `openapi` metadata and no API key
permissions, because answering an accusation is a thing a person does and a
bearer credential has nobody behind it at request time.

Three surfaces in `apps/web`, all reading that router:

| Surface | Path | Shows |
| --- | --- | --- |
| Dashboard card | `features/dashboard/components/active-abuse-cases*` | open cases, answer-first ordering; renders nothing when there are none |
| List | `/app.virtbase.com/abuse` | active cases, settled ones behind a toggle |
| Case | `/app.virtbase.com/abuse/<id>` | the thread, the accusation, what is locked |

The redaction is in the tRPC output schema rather than in a component: the
`reporter` author kind is absent from `AbuseCaseMessageSchema`, and the query
filters `audience = 'customer'`, so an internal note or a reporter's wording
cannot reach the browser even from a component that asks for it.

The customer has exactly two actions — reply, and claim it is fixed. Neither
sets `mitigated`: that is the operator accepting the claim, and letting a
customer release their own lock would defeat the point. Both land the case in
`awaiting_operator` and stop the response clock.

The vocabulary is translated at the edge (`useCaseLabels`), not stored twice.
`awaiting_customer` is an accurate description of a queue and a useless thing
to show the person standing in it, so it reads "Needs your answer"; `isolate`
reads "Network blocked". The icons come from `ui/abuse/case-meta.tsx`, shared
with the operator console so a status does not look like two different things.

## Notifications

`dispatchNotification()` writes the delivery row before anything leaves the
building, so "did the customer actually get the notice?" has an answer — the
first question in any dispute about a suspension. Failures never reach the
caller; `/api/cron/retry-notifications` picks them up.

Text is resolved by the dispatcher, per delivery, not by each channel: one case
can notify a German customer and an English operator webhook, and a channel
owns its markup but not its words. Three channels exist — `email` (on the
internal `core` integration), `discord` (DM to a linked account, or an operator
webhook) and `webhook` (signed JSON to anything).

## Setting it up

A fresh database has no rules, no notification targets, and every integration
switched off. In that state the desk **still works** — reports arrive, cases
open, operators answer — and **nothing is ever enforced automatically**. Every
case lands in `triage` and waits for a person.

That is the intended starting point, not a broken install. The steps below move
off it in an order where each one is verifiable before the next, and where
nothing can suspend a customer until you have watched it be right for a while
first.

### The short version

| Step | Without it |
| --- | --- |
| 1. `CONFIG_ENCRYPTION_KEY` | no integration can be configured and no notification target can be stored |
| 2. At least one notification target | the desk works and tells nobody |
| 3. At least one source enabled | no signals, so only the mailbox and hand-made cases exist |
| 4. `ABUSE_MAILBOX_SECRET` + Resend inbound | no per-case addresses; reporters route by subject token only |
| 5. At least one enabled rule with `trusted_source` | nothing ever enforces |
| 6. `AI_GATEWAY_API_KEY` *(optional)* | assisted triage is off |

Steps 1–4 are safe to do on day one. **Step 5 is the one that can take a
customer's server away**, and it deserves the week of watching described below.

### 1. Keys

```bash
openssl rand -base64 32   # CONFIG_ENCRYPTION_KEY
openssl rand -hex 32      # ABUSE_MAILBOX_SECRET
openssl rand -hex 32      # the Alertmanager ingest token, entered in the console
```

`CONFIG_ENCRYPTION_KEY` wraps a per-installation data key rather than
encrypting anything directly, so rotating it rewraps one short string per
installation and touches no ciphertext. Without it `DisabledConfigSource`
reports every integration as off and logs a warning — the application still
boots and serves.

`ABUSE_MAILBOX_SECRET` signs the tag in `abuse+<number>.<hmac6>@`. Without a
tag the address is guessable, so the mailbox refuses to route by it and falls
back to the `[AB-1042]` subject token. It falls back to
`CONFIG_ENCRYPTION_KEY` if unset, which is fine for a single deployment and
wrong the moment you want to rotate one without the other.

`ABUSE_MAILBOX_DOMAIN` defaults to `NEXT_PUBLIC_APP_DOMAIN`. Set it only if
abuse mail arrives on a different domain than the app.

### 2. Somewhere to tell

`/admin.virtbase.com/notifications` → **Add target**.

Do this before enabling a source. An operator notification is how you find out
that ingestion is working at all, and a source turned on with nowhere to
report lands its first surprise in the database silently.

| Channel | Needs | Good for |
| --- | --- | --- |
| `email` | an address | the durable record; always have one |
| `discord` | a webhook URL, or a linked account for a DM | the one people actually read |
| `webhook` | a URL and a signing secret | anything else — PagerDuty, an internal bot |

A target matches on **key globs** and a **minimum severity**. Start with one
target on `abuse.*` at `info` while you are setting up, and tighten it to
`warning` once the volume is known. The keys that exist today:

| Key | Fires when |
| --- | --- |
| `abuse.case.opened` | a case is created from a signal |
| `abuse.case.triaged` | assisted triage filled one in |
| `abuse.case.enforced` | a lock was actually applied |
| `abuse.case.escalated` | a response deadline elapsed and enforcement tightened |
| `abuse.case.customer_replied` | the customer answered or claimed it is fixed |
| `abuse.lock.drift_detected` | a customer's API undid a lock and reconciliation put it back |
| `abuse.signal.unattributed` | a report arrived that nobody can be held responsible for |
| `abuse.source.poll_failed` / `.poll_incomplete` | a pull source errored or ran out of quota |
| `abuse.report.received` | mail arrived at `abuse@` |

`abuse.lock.drift_detected` and `abuse.signal.unattributed` are the two worth
routing somewhere a human looks the same day. The first means a customer is
fighting the lock; the second means the attribution table and reality
disagree.

The **Send test** button on a saved target delivers a real notification, which
is the only way to find out that a Discord webhook URL was pasted correctly.

### 3. A source

#### Alertmanager — the one that matters

Detection is not Virtbase's job, and polling every server for traffic anomalies
would cost more than it catches. The fleet already has Prometheus watching it;
this is where that stack says so.

`packages/integration-alertmanager/README.md` is the reference — the full label
contract, the three payload formats, and worked PromQL. The setup order:

1. `/admin.virtbase.com/integrations/alertmanager` → enable, paste an **ingest
   token**, leave **Payload format** on `alertmanager`.
2. Point a receiver at it:

   ```yaml
   receivers:
     - name: virtbase
       webhook_configs:
         - url: https://virtbase.com/api/integrations/alertmanager/alerts
           http_config:
             authorization:
               type: Bearer
               credentials: "<ingest token>"
           max_alerts: 200
   ```

3. Add one alerting rule and let it fire once. The label that decides
   everything is `virtbase_type`: only a type beginning `abuse.` enters the
   case pipeline. Anything else is recorded and forwarded to the operator
   targets without opening a case, which makes `alert.*` a safe way to
   rehearse the whole path.

4. Confirm the signal landed. `/admin.virtbase.com/abuse` will show a case in
   `triage`; the subject on it tells you whether attribution worked.

**Attribution is the part that goes wrong.** One of these labels has to
resolve to a customer, in this order of reliability:

| Label | Resolves through |
| --- | --- |
| `virtbase_server_id` | directly, unambiguously — use it when you have it |
| `virtbase_vmid` + `virtbase_node` | `unique(proxmox_node_id, vmid)` |
| `virtbase_ip` | the allocation table **as it stood when the alert fired** |
| `virtbase_user_id` | the account, for alerts that are not about one machine |
| `node` / `instance` | the node. Opens no case — a node is ours |

Per-VM traffic appears on the node's `tap<vmid>i<n>` interfaces, and the device
name is the only place the vmid exists, so it has to be lifted out with
`label_replace` in the expression rather than hoped for as a label. The
integration README has the two rules to start from.

A wrong or missing token answers **404**, not 401 — the same answer the
webhook dispatcher and the Prometheus scrape endpoint give, so the endpoint
cannot be used to confirm what this deployment runs. If your alerts are not
arriving, that 404 is the first thing to check.

#### AbuseIPDB — optional, and advisory

`/admin.virtbase.com/integrations/abuseipdb` → enable, paste an **API key**.
`/api/cron/poll-abuse-sources` sweeps hourly at `:37`. The ranges come from the
platform's own allocation table, not from configuration, so there is nothing to
list by hand.

| Setting | Default | Change it when |
| --- | --- | --- |
| Confidence threshold | `50` | you are drowning — raise it, don't add rules to compensate |
| Report age | `30` days | rarely |
| Block size | `/24` | you have a paid key; `check-block` is capped by plan and asking wider than the key allows **fails the call** rather than degrading |
| Calls per run | `4` | you have a paid key. Four per hourly run is 96/day, inside a free key's allowance |
| Look up categories | **off** | see below |
| Allow reporting back | off | you want the operator-confirmed report-back offer on resolved cases |

**Look up categories, off by default, is the setting that surprises people.**
With it off every AbuseIPDB signal has type `abuse.other`, because the block
endpoint returns a score and not a reason. A rule written against `abuse.spam`
will never match one. On, it spends one extra call per finding and the customer
gets a case that says what to fix instead of one labelled "other". Turn it on
if the quota allows.

Severity comes from the confidence score — `>= 90` critical, `>= 60` warning,
below that info — and the raw score is on the signal as `confidence`, which is
what `match_confidence_min` reads.

#### The `abuse@` mailbox

Point Resend inbound at `/api/resend/webhook`. Mail is routed strongest-first:
signed address tag → quoted `Message-ID` → `[AB-1042]` subject token → known
sender on a live case → a new case in `triage`. The weaker steps append to a
case but never create one.

Reporters are acknowledged once per contact per case, and never when the mail
carries `Auto-Submitted`, `Precedence: bulk|list` or a `List-Id`. Our own
replies carry `Auto-Submitted` so the far side stays quiet too.

### 4. Watch it with no rules

Leave the rule set empty for a week of real traffic.

Cases still open — a signal with no matching rule produces a `triage` case with
`enforcement: none`, exactly as if a rule had matched and not been trusted. So
this week costs nothing except operator attention, and buys the two things rule
authoring needs: which signal types actually arrive, and how many of them are
wrong.

Read `/admin.virtbase.com/abuse` daily. The questions to answer before writing
a rule:

- Does attribution land on the right customer? A case marked **stale
  attribution** means the address was reallocated between the report and now.
- How many are false positives? A source you would not trust to be right at 3am
  is a source that does not get `trusted_source`.
- What is the ratio of `abuse.ddos` to `abuse.other`? That tells you whether
  your labels are doing their job.

### 5. The rules

`/admin.virtbase.com/abuse/rules`.

First match by `priority` wins — lower runs first — and the winner's id is
written onto the signal, because a suspension has to be explainable by pointing
at the rule that caused it months later, after the rule has been edited. Every
condition on a rule is an `AND`, and **an unset field is not a condition**: a
rule carrying only a type glob is a catch-all for its namespace rather than
something that matches nothing.

**Use the dry run before saving anything.** It replays the draft against the
last 500 signals that reached the matcher and reports three numbers that mean
different things:

- **matched** — the conditions accept it.
- **decides** — the draft is also first by priority. A rule that matches 500
  and decides none is sitting behind a catch-all; the panel names the rule
  taking them and how many.
- **would have locked** — how many customers would have lost a server with
  nobody reading the report first. If that number surprises you, the rule is
  wrong.

It writes nothing, so run it as often as you like. The one thing it cannot
recover is a customer's repeat count as it stood at the time, so a rule gated
on prior cases reads slightly hot.

#### A recommended starting set

Ordered by how much they are trusted, which is also priority order. Adjust the
thresholds to the fleet — these are shapes, not numbers that transfer.

| # | Rule | Matches | Trusted | Does |
| --- | --- | --- | --- | --- |
| 10 | Confirmed flood, our own alerting | `abuse.ddos` · source `alertmanager` · severity ≥ `critical` | **yes** | `isolate` after 15 min, answer within 12 h |
| 20 | Outbound spam, our own alerting | `abuse.spam` · source `alertmanager` · severity ≥ `warning` | **yes** | `throttle` after 60 min, answer within 24 h |
| 30 | Repeat offender, third-party report | source `abuseipdb` · confidence ≥ 90 · ≥ 1 prior case | **yes** | `throttle` after 4 h, answer within 48 h |
| 40 | Third-party report, first offence | source `abuseipdb` · confidence ≥ 75 | no | opens at `high`, waits for a person |

The reasoning behind the shape, which matters more than the numbers:

- **Our own alerting is trusted; a third party is not.** Rules 10 and 20 act
  on a stack we run, watching interfaces we own. Rule 40 acts on strangers
  agreeing with each other, and a competitor filing plausible reports must not
  be able to suspend a customer.
- **A third party gets trusted only with corroboration.** Rule 30 is the same
  source as rule 40 and enforces, because `>= 1 prior case` means we already
  settled something against this customer inside 90 days. One stranger is an
  accusation; a stranger plus our own history is a pattern. Cases we closed as
  `false_positive` or `not_our_range` are excluded from that count: a report we
  ourselves rejected is not corroboration, and counting it would let a reporter
  manufacture the very history that arms the rule - file once, have it thrown
  out, file again and watch the second one throttle.
- **The ladder is short.** `isolate` is the harshest thing in this set. It
  leaves the customer their data, their console, and the ability to fix the
  problem — everything except the ability to keep causing it. `power_off` is
  for cases an operator has read.
- **`terminate` is absent, and cannot be added.** It is not in the rule schema
  at all: deleting a customer's server is the one irreversible level, and an
  operator signs it on the case.
- **Grace windows are not politeness.** A case settled inside its window is
  never enforced at all, so 15 minutes on a flood is the difference between a
  customer who killed their own runaway process and a customer who has to open
  a ticket. Set it to zero only when the abuse is actively costing the network.
- **Anything not matched falls through to `triage`.** There is no catch-all
  rule in this set and none is needed — a signal with no matching rule opens a
  case that waits for a person, which is the same thing an untrusted rule
  produces.

Seeded directly, for a deployment that would rather diff a migration than
click. `id` is supplied explicitly because the prefixed identifier is generated
in application code — the column is a bare `text PRIMARY KEY` with no database
default, so an insert that omits it fails. Readable seed ids are worth having
anyway: `abuse_signals.matched_rule_id` points at them, and
`abrul_seed_flood` reads better in a year than a random string.

```sql
insert into abuse_rules (
  id, name, priority, enabled, trusted_source,
  match_type, match_source, match_severity_min,
  match_confidence_min, match_repeat_count_min,
  action_case_severity, action_enforcement, action_grace_minutes,
  action_block_orders, action_notify_user, action_response_hours
) values
  ('abrul_seed_flood',  'Confirmed flood (our alerting)', 10, true, true,
   'abuse.ddos', 'alertmanager', 'critical', null, null,
   'critical', 'isolate',   15, false, true, 12),

  ('abrul_seed_spam',   'Outbound spam (our alerting)',   20, true, true,
   'abuse.spam', 'alertmanager', 'warning',  null, null,
   'high',     'throttle',  60, false, true, 24),

  ('abrul_seed_repeat', 'Repeat offender (AbuseIPDB)',    30, true, true,
   'abuse.*',    'abuseipdb',    null,         90,    1,
   'high',     'throttle', 240, false, true, 48),

  ('abrul_seed_third',  'Third-party report (AbuseIPDB)', 40, true, false,
   'abuse.*',    'abuseipdb',    null,         75, null,
   'high',     'none',       0, false, true, 48);
```

Everything left out takes its column default: `match_labels` is `{}`,
`action_category` is null so the category comes from the signal type, and
`action_open_case` / `action_auto_close_hours` are the two columns nothing
reads.

Enable them one at a time, newest last, and dry-run each against real traffic
before saving. A rule that has been live for a week with `trusted_source` off
and looks right is a rule you can turn on with some confidence.

#### When to reach for `action_block_orders`

None of the starting rules set it. It stops the customer buying more servers
until the case settles, which is the correct answer to somebody signing up,
abusing a machine, and rolling to a new one — and the wrong answer to a
customer whose WordPress got owned. Reserve it for `compromised` and repeat
categories, and prefer setting it by hand on a case an operator has read.

### 6. The first enforcement, by hand

Before any rule is trusted, drive one case through the whole path manually:

1. Open a case from `/admin.virtbase.com/abuse` against a server you own.
2. Set an enforcement level on it and use **Enforce now** to skip the grace
   window.
3. Check Proxmox directly. `throttle` writes `rate=` on the guest NIC,
   `isolate` sets firewall `enable: 1, policy_out: DROP`, `power_off` sets
   `onboot: false` and stops the guest.
4. Undo it from Proxmox, and wait for `/api/cron/reconcile-abuse-locks` to put
   it back — that is the drift path, and `abuse_case_servers.drift_count`
   should increment.
5. Resolve the case and check the server comes back **to the policy it had
   before**, not to a default. A guest that was already stopped must not be
   started by the release.

This is the step nothing in the test suite covers. Enforcement is tested
against a fake hypervisor, which proves the decision logic and not the Proxmox
API shapes.

### After that, the clocks run it

Nothing above needs a person once it is set. `reconcile-abuse-cases` applies
grace windows, tightens on missed deadlines and closes quiet mitigated cases;
`reconcile-abuse-locks` re-asserts whatever the customer's API undid;
`retry-notifications` picks up failed deliveries. Schedules live in
`apps/web/vercel.json`, and what each one advances is under
[The clocks](#the-clocks) above.

## What is not built

- **No `dev/verify-abuse-lock`.** Enforcement is tested against a fake
  hypervisor, which proves the logic and not the Proxmox API shapes.
- **The AbuseIPDB sweep is IPv4 only**, matching its block endpoint.
- **Abuse cases reach the JSON data export but not the PDF.**
- `abuse_rules.action_open_case` and `action_auto_close_hours` are read by
  nothing and are absent from the editor. The observation window after
  `mitigated` is a fixed 24 hours.
- The queue table has not had a design pass — see `TODO.md`.

## Tests

132 in this package covering the domain (`__tests__/`), 37 across the three new
integration packages, 8 for the notification target store. The ones worth
knowing about:

- `resolve-subject.test.ts` — overlapping subnets, nesting versus collision,
  and a report dated before the current allocation.
- `enforce.test.ts` — an unreachable node leaves the row unlocked, a release
  restores the prior policy rather than a default, drift is re-asserted without
  overwriting `previous_state`, an escalation records what each level replaced
  and the release undoes both, a settled case is released rather than re-locked,
  and a release that met an unreachable node is retried until it settles.
- `triage.test.ts` — the classifier emits no signal, never leaves `triage`,
  and discards an address the report does not contain.
- `dry-run.test.ts` — a draft replaces its stored twin rather than being
  shadowed by it, a disabled rule above it does not shadow, and a trusted rule
  still reports no enforcement on stale attribution.
