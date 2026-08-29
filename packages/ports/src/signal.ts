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

export type SignalSeverity = "info" | "warning" | "critical";

/**
 * Whether the condition is still true.
 *
 * Alertmanager sends both, and a `resolved` signal is what lets a transient
 * flood release its own throttle without an operator. A one-shot report - an
 * abuse email, an AbuseIPDB record - only ever fires.
 */
export type SignalState = "firing" | "resolved";

/**
 * What the source *claims* the signal is about, before anything has been
 * verified against our own records.
 *
 * `ip` is the common case and the only one that needs resolving: an address
 * belongs to whoever held it at the moment of the event, which is not
 * necessarily whoever holds it now.
 */
export type SignalSubject =
  | { kind: "ip"; value: string }
  | { kind: "cidr"; value: string }
  | { kind: "server"; value: string }
  /**
   * A guest by its hypervisor coordinates.
   *
   * The shape an alerting stack can actually produce: Prometheus knows the
   * node and the vmid off a tap interface, and has no idea what a Virtbase
   * server id is. Resolving the pair is the pipeline's job - an integration
   * cannot reach the database that maps it.
   */
  | { kind: "vm"; value: string; node: string }
  | { kind: "user"; value: string }
  | { kind: "node"; value: string }
  | { kind: "order"; value: string }
  | { kind: "none" };

/**
 * What the pipeline decided to do to the servers a signal implicates.
 *
 * Ordered by severity: every level above `none` is reversible, and
 * `terminate` is reachable only by an operator.
 */
export type EnforcementLevel =
  | "none"
  | "throttle"
  | "isolate"
  | "power_off"
  | "terminate";

/**
 * Something that happened and that somebody thinks we should know about.
 *
 * One envelope for every source, deliberately: abuse reports are the first
 * consumer but not the only one. A failed order fulfilment, a Proxmox node
 * at 95% disk and an IPAM pool with four addresses left are the same thing
 * arriving through the same door with a different {@link type}. Building an
 * abuse-only envelope now means building a second one later.
 */
export interface InboundSignal {
  /**
   * Where it came from: an integration id, or `manual` / `internal` for the
   * platform's own. One half of the deduplication key.
   */
  source: string;
  /**
   * Source-scoped identity - an Alertmanager fingerprint, an AbuseIPDB
   * report id, an inbound `Message-ID`. The other half.
   *
   * The pipeline upserts on `(source, externalId)`, which is what makes
   * Alertmanager's `repeat_interval` harmless rather than a case per repeat.
   */
  externalId: string;
  /**
   * Dotted, e.g. `abuse.spam`, `node.disk_pressure`, `ipam.pool_exhausted`.
   *
   * The `abuse.` prefix is what routes a signal into the case pipeline.
   * Everything else is recorded and notified without opening a case.
   */
  type: string;
  state: SignalState;
  severity: SignalSeverity;
  subject: SignalSubject;
  /** Short, safe to render. Sanitised by the intake before it is stored. */
  title: string;
  /**
   * [!] Untrusted. Verbatim reporter text, retained for the case record.
   *
   * Same trust level as `servers.detected_os_name`: sanitised on the way in,
   * and escaped again at every sink that interprets markup.
   */
  body?: string;
  /** Low-cardinality routing labels only - `alertname`, `job`. Never PII. */
  labels?: Record<string, string>;
  /** 0-100 where the source expresses one. AbuseIPDB does. */
  confidence?: number;
  reporter?: { name?: string; email?: string; organization?: string };
  /**
   * When the reported thing happened - not when we heard about it.
   *
   * Load-bearing. Attribution reads the IP allocation table as it stood at
   * this instant, because a report that arrives three days late must not
   * suspend whoever holds the address today.
   */
  occurredAt: Date;
  /** Provider payload as received, for the evidence trail. */
  raw?: unknown;
}

export interface SignalIngestResult {
  signalId: string;
  /** True when this collapsed onto an already-known signal. */
  deduplicated: boolean;
  /** Set when the signal opened or joined an abuse case. */
  caseId?: string;
  /** What the matched rule decided. `undefined` when no rule matched. */
  enforcement?: EnforcementLevel;
}

/**
 * The pipeline, as an integration sees it.
 *
 * Inbound alerts arrive on an integration's own webhook, which normalises the
 * provider's payload and submits the result here. It is a port rather than an
 * import because an integration may not depend on `@virtbase/api` - the same
 * reason `serverManagement` exists, and it is provided the same way, by the
 * internal `core` integration in the composition root.
 */
export interface SignalIntake {
  readonly id: string;
  submit(signal: InboundSignal): Promise<SignalIngestResult>;
  /**
   * Submitted together so a poll that returns two hundred records costs one
   * transaction rather than two hundred.
   */
  submitMany(signals: InboundSignal[]): Promise<SignalIngestResult[]>;
}
