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

/**
 * A thing that happened, past tense. The catalogue of concrete event types and
 * their payloads is owned by `@virtbase/events` (Layer 3); this port carries
 * only the envelope so that integrations can subscribe without depending on
 * the domain.
 */
export interface DomainEvent<TPayload = unknown> {
  /** Unique per emission — subscribers use it to deduplicate. */
  id: string;
  /** Dotted name, e.g. `server.provisioned`, `order.paid`. */
  type: string;
  occurredAt: Date;
  /**
   * The user the event concerns, when it concerns one. Customer-facing webhook
   * subscribers are scoped by this so a customer only ever sees their own
   * resources.
   */
  userId: string | null;
  payload: TPayload;
}

/**
 * An integration that reacts to domain events.
 *
 * `types` supports a trailing `*` wildcard (`server.*`), which is what makes a
 * customer webhook subscribing to everything expressible without enumerating
 * the catalogue.
 */
export interface EventSubscriber {
  readonly id: string;
  readonly types: readonly string[];
  handle(event: DomainEvent): Promise<void>;
}
