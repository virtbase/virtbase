/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { AbuseSource } from "./abuse-source.ts";
import type { PortName } from "./common.ts";
import type { DnsProvider } from "./dns-provider.ts";
import type { EventSubscriber } from "./event-subscriber.ts";
import type { IdentityProvider } from "./identity-provider.ts";
import type { InvoiceProvider } from "./invoice-provider.ts";
import type { IpReputationProvider } from "./ip-reputation.ts";
import type { MetricsSink } from "./metrics-sink.ts";
import type { NotificationChannel } from "./notification-channel.ts";
import type { ObjectStore } from "./object-store.ts";
import type { PaymentProvider } from "./payment-provider.ts";
import type { ServerManagementPort } from "./server-management.ts";
import type { SignalIntake } from "./signal.ts";

/**
 * The one place that says which interface each capability slot expects. The
 * registry is typed against this, so `registry.require("dns")` is known to
 * return a {@link DnsProvider} without a cast.
 */
export interface PortMap {
  payment: PaymentProvider;
  invoice: InvoiceProvider;
  notifications: NotificationChannel;
  dns: DnsProvider;
  metrics: MetricsSink;
  abuse: AbuseSource;
  ipReputation: IpReputationProvider;
  signals: SignalIntake;
  objectStore: ObjectStore;
  events: EventSubscriber;
  identity: IdentityProvider;
  serverManagement: ServerManagementPort;
}

/**
 * Compile-time proof that {@link PortMap} and the `PORTS` constant stay in
 * step. Adding a key to one without the other stops the build here.
 */
type AssertPortMapMatchesPortNames = [
  Exclude<keyof PortMap, PortName>,
  Exclude<PortName, keyof PortMap>,
] extends [never, never]
  ? true
  : never;

export type PortsAreExhaustive = AssertPortMapMatchesPortNames;
