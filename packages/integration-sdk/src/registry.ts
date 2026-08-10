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

import type { PortMap } from "@virtbase/ports";
import type { ConfigSource } from "./config-source";
import type { IntegrationDescription } from "./describe";
import { describeIntegration, localizeDescription } from "./describe";
import { consoleLogger } from "./logger";
import type {
  Integration,
  IntegrationContext,
  IntegrationHealth,
  IntegrationLogger,
  IntegrationWebhook,
  PortAccessor,
} from "./types";

/** Thrown when a caller requires a capability nothing currently provides. */
export class PortUnavailableError extends Error {
  readonly port: keyof PortMap;

  constructor(port: keyof PortMap, detail: string) {
    super(`No integration provides the "${String(port)}" port: ${detail}`);
    this.name = "PortUnavailableError";
    this.port = port;
  }
}

export interface IntegrationRegistryOptions {
  integrations: Integration[];
  config: ConfigSource;
  logger?: IntegrationLogger;
  /**
   * How long a resolved configuration is reused before being re-read, in
   * milliseconds. Defaults to 30 seconds; pass `Infinity` to cache forever.
   *
   * This is what makes an admin toggling an integration take effect without a
   * deploy. A push-based invalidation would be tighter, but the Redis client
   * here speaks the Upstash REST API, which has no subscribe — so every
   * instance re-reads on its own schedule and the TTL bounds the staleness.
   */
  configTtlMs?: number;
}

interface ResolvedIntegration {
  context: IntegrationContext | null;
  /** Set when the integration is installed but its configuration is invalid. */
  configError: string | null;
}

/**
 * Binds integrations to capability slots.
 *
 * This is the only object that knows both an integration and a port, which is
 * why it is constructed in the composition layer and nowhere else. Domain code
 * asks it for a capability and never learns which integration answered.
 */
export class IntegrationRegistry {
  private readonly integrations: Map<string, Integration>;
  private readonly config: ConfigSource;
  private readonly logger: IntegrationLogger;

  private readonly configTtlMs: number;

  private readonly resolved = new Map<
    string,
    { value: Promise<ResolvedIntegration>; expiresAt: number }
  >();
  private readonly adapters = new Map<string, unknown>();

  /**
   * Handed to every integration context. Bound to the registry's own methods so
   * an integration resolving a port it needs goes through the same enablement
   * and configuration checks as the rest of the system.
   */
  private readonly portAccessor: PortAccessor = {
    resolve: (port, options) => this.resolve(port, options),
    require: (port, options) => this.require(port, options),
  };

  constructor(options: IntegrationRegistryOptions) {
    this.integrations = new Map(
      options.integrations.map((integration) => [integration.id, integration]),
    );
    this.config = options.config;
    this.logger = options.logger ?? consoleLogger;
    this.configTtlMs = options.configTtlMs ?? 30_000;

    this.config.onChange?.((integrationId) => this.invalidate(integrationId));
  }

  list(): Integration[] {
    return [...this.integrations.values()];
  }

  find(integrationId: string): Integration | undefined {
    return this.integrations.get(integrationId);
  }

  /**
   * Serialisable descriptions, for the admin console.
   *
   * Async because an integration may translate its own text, which needs a
   * request context. A translation that fails falls back to the declared
   * strings rather than taking the page down — a missing label is a cosmetic
   * problem, not a reason to hide the configuration behind an error.
   */
  async describeAll(): Promise<IntegrationDescription[]> {
    return Promise.all(
      this.list().map(async (integration) => {
        const description = describeIntegration(integration);
        if (!integration.localize) return description;

        try {
          return localizeDescription(description, await integration.localize());
        } catch (error) {
          this.logger.warn(
            `[${integration.id}] Failed to localize metadata; using declared text`,
            { error: error instanceof Error ? error.message : String(error) },
          );
          return description;
        }
      }),
    );
  }

  /**
   * Validates a candidate settings object against an integration's schema
   * without storing it, so the admin form can report field-level errors.
   */
  validateSettings(
    integrationId: string,
    value: unknown,
  ): { success: true; data: unknown } | { success: false; errors: string[] } {
    const integration = this.integrations.get(integrationId);
    if (!integration)
      return { success: false, errors: ["Unknown integration"] };
    if (!integration.settings) return { success: true, data: {} };

    const result = integration.settings.schema.safeParse(value);
    if (result.success) return { success: true, data: result.data };

    return {
      success: false,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }

  /**
   * Every enabled implementation of a port, in registration order. Use this
   * where fan-out is the point — notification channels, event subscribers,
   * metrics sinks.
   */
  async resolveAll<K extends keyof PortMap>(port: K): Promise<PortMap[K][]> {
    const adapters: PortMap[K][] = [];
    for (const integration of this.integrations.values()) {
      const adapter = await this.adapterFor(integration, port);
      if (adapter) adapters.push(adapter);
    }
    return adapters;
  }

  /**
   * The single enabled implementation of a port, or `null` when none is
   * configured. Callers that can degrade — server deletion when PowerDNS is
   * off — branch on the `null`.
   *
   * Pass `integrationId` when more than one integration can fill the slot, as
   * Stripe and Anonpay both do for `payment`.
   */
  async resolve<K extends keyof PortMap>(
    port: K,
    options: { integrationId?: string } = {},
  ): Promise<PortMap[K] | null> {
    if (options.integrationId) {
      const integration = this.integrations.get(options.integrationId);
      if (!integration) return null;
      return this.adapterFor(integration, port);
    }

    const candidates = await this.resolveAll(port);
    const [first] = candidates;
    if (!first) return null;
    if (candidates.length > 1) {
      throw new PortUnavailableError(
        port,
        `${candidates.length} integrations provide it; pass an integrationId to disambiguate`,
      );
    }
    return first;
  }

  /** Like {@link resolve}, but throws instead of returning `null`. */
  async require<K extends keyof PortMap>(
    port: K,
    options: { integrationId?: string } = {},
  ): Promise<PortMap[K]> {
    const adapter = await this.resolve(port, options);
    if (!adapter) {
      throw new PortUnavailableError(
        port,
        options.integrationId
          ? `"${options.integrationId}" is not installed or not enabled`
          : "no integration is enabled",
      );
    }
    return adapter;
  }

  /**
   * Finds the webhook an inbound request addresses, together with the context
   * to run it with. Returns `null` when the integration is unknown, disabled,
   * misconfigured, or does not declare that path — the dispatcher turns all
   * four into the same 404 so it cannot be used to probe which integrations
   * exist.
   */
  async resolveWebhook(
    integrationId: string,
    path: string,
    method: string,
  ): Promise<{
    webhook: IntegrationWebhook;
    context: IntegrationContext;
  } | null> {
    const integration = this.integrations.get(integrationId);
    if (!integration) return null;

    const normalized = path.replace(/^\/+|\/+$/g, "");
    const webhook = integration.webhooks?.find(
      (candidate) =>
        candidate.path.replace(/^\/+|\/+$/g, "") === normalized &&
        candidate.methods.includes(
          method.toUpperCase() as IntegrationWebhook["methods"][number],
        ),
    );
    if (!webhook) return null;

    const { context } = await this.contextFor(integration);
    if (!context) return null;

    return { webhook, context };
  }

  /** Probes every enabled integration. Drives the admin console's status list. */
  async health(): Promise<Record<string, IntegrationHealth>> {
    const entries = await Promise.all(
      this.list().map(
        async (integration): Promise<[string, IntegrationHealth]> => {
          const { context, configError } = await this.contextFor(integration);

          if (configError) {
            return [
              integration.id,
              { status: "error", checkedAt: new Date(), message: configError },
            ];
          }
          if (!context) {
            return [
              integration.id,
              {
                status: "degraded",
                checkedAt: new Date(),
                message: "Not enabled",
              },
            ];
          }
          if (!integration.health) {
            return [integration.id, { status: "ok", checkedAt: new Date() }];
          }

          try {
            return [integration.id, await integration.health(context)];
          } catch (error) {
            return [
              integration.id,
              {
                status: "error",
                checkedAt: new Date(),
                message: error instanceof Error ? error.message : String(error),
              },
            ];
          }
        },
      ),
    );

    return Object.fromEntries(entries);
  }

  /**
   * Runs an integration's `onEnable` hook. The caller is responsible for having
   * already flipped the enabled flag in the config source — the hook is the
   * side effect, not the switch.
   */
  async runEnableHook(integrationId: string): Promise<void> {
    await this.runLifecycleHook(integrationId, "onEnable");
  }

  async runDisableHook(integrationId: string): Promise<void> {
    await this.runLifecycleHook(integrationId, "onDisable");
  }

  /** Drops cached contexts and adapters so the next call re-reads config. */
  invalidate(integrationId?: string): void {
    if (!integrationId) {
      this.resolved.clear();
      this.adapters.clear();
      return;
    }
    this.resolved.delete(integrationId);
    for (const key of this.adapters.keys()) {
      if (key.startsWith(`${integrationId}:`)) this.adapters.delete(key);
    }
  }

  private async runLifecycleHook(
    integrationId: string,
    hook: "onEnable" | "onDisable",
  ): Promise<void> {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Unknown integration "${integrationId}"`);
    }

    this.invalidate(integrationId);

    const { context, configError } = await this.contextFor(integration);
    if (configError) {
      throw new Error(
        `Cannot run ${hook} for "${integrationId}": ${configError}`,
      );
    }
    if (!context) return;

    await integration[hook]?.(context);
  }

  private async adapterFor<K extends keyof PortMap>(
    integration: Integration,
    port: K,
  ): Promise<PortMap[K] | null> {
    const factory = integration.provides[port];
    if (!factory) return null;

    // Resolve the context first: an expired one clears the adapter cache, so
    // checking that cache earlier would keep serving an adapter built from
    // configuration that has since changed.
    const { context } = await this.contextFor(integration);
    if (!context) return null;

    const cacheKey = `${integration.id}:${String(port)}`;
    const cached = this.adapters.get(cacheKey);
    if (cached) return cached as PortMap[K];

    const adapter = factory(context);
    this.adapters.set(cacheKey, adapter);
    return adapter;
  }

  private contextFor(integration: Integration): Promise<ResolvedIntegration> {
    const cached = this.resolved.get(integration.id);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    // Expired: drop any adapter built from the previous configuration too,
    // otherwise a rotated credential would stay live in this process.
    if (cached) this.invalidate(integration.id);

    const pending = this.buildContext(integration);
    this.resolved.set(integration.id, {
      value: pending,
      expiresAt: Date.now() + this.configTtlMs,
    });
    return pending;
  }

  private async buildContext(
    integration: Integration,
  ): Promise<ResolvedIntegration> {
    if (!(await this.config.isEnabled(integration))) {
      return { context: null, configError: null };
    }

    const settings = integration.settings?.schema.safeParse(
      await this.config.settings(integration),
    );
    const secrets = integration.secrets?.schema.safeParse(
      await this.config.secrets(integration),
    );

    // A misconfigured optional integration must not take the process down the
    // way a boot-time env check does; it reports through health() instead.
    for (const [kind, result] of [
      ["settings", settings],
      ["secrets", secrets],
    ] as const) {
      if (result && !result.success) {
        const message = `Invalid ${kind}: ${result.error.issues
          .map(
            (issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`,
          )
          .join("; ")}`;
        this.logger.error(`[${integration.id}] ${message}`);
        return { context: null, configError: message };
      }
    }

    return {
      context: {
        id: integration.id,
        settings: settings?.success ? settings.data : {},
        secrets: secrets?.success ? secrets.data : {},
        logger: this.logger,
        ports: this.portAccessor,
      },
      configError: null,
    };
  }
}
