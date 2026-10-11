# @virtbase/integration-testing

The suites every integration runs from its own tests (TST-11, §4.7 and §4.8 of
`docs/architecture/integration-first.md`).

## The conformance suite

```ts
import { describeIntegration } from "@virtbase/integration-testing";

describeIntegration(integration, {
  packageDir: resolve(import.meta.dir, "../.."),
  config: { settings: { apiUrl: "https://dns.test" }, secrets: { apiKey: "key-1" } },
  backend: fakeProvider.fetch,
});
```

Call it from a test file of its own. The translations check replaces
`next-intl/server` through `mock.module` for the rest of the file, and
`--isolate` keeps it from reaching the package's other files (TST-2, ADR 0018).

| Check | Fails when |
| --- | --- |
| manifest | the integration is a v1 definition, its manifest does not parse, it requires another SDK version, or its `provides` differs from its runtime |
| fields | a schema key has no field, a field has no schema key, a `select` field's options differ from its enum, or a secret does not use the `password` widget |
| translations | `localize()` leaves out the name, the description or a field label, returns a string that did not come through `t()`, or asks `getExtracted` for a namespace other than `<id>-integration` |
| health | a provider that answers 503 or stops answering yields anything but `error`, or `backend` yields anything but `ok` |
| docs | `packageDir` holds no `package.json`, or one of the nine files of ADR 0016 is missing, no longer than its template in `templates/`, or still holds `TODO` |
| secrets | a secret value of `config.secrets` appears anywhere in the description, the health output or the translations |

`runConformance(definition, options)` runs the same checks and returns one line
per failure; the suite's own tests use it against broken fixtures.

- **Translations:** `next-intl/server` is resolved from `packageDir`, so the mock
  replaces the copy the integration loads. The recording translator marks every
  string it returns.
- **Health:** `backend` plays the provider behind `ctx.http`, through the
  registry's `fetch` option. A probe that talks to its provider through an SDK
  client of its own, such as Stripe's, is not served by it. The silent-provider
  check gives `ctx.http` a 50 ms timeout inside a 2 s budget, so the probe
  itself has to report the timeout.
- **Secrets:** the registry already redacts every secret of four or more
  characters from health messages, so the health outputs catch what the
  redaction does not.

### Not yet checked, from §4.7

| Item | Waits for |
| --- | --- |
| 1: `requires.features` and `requires.ports` | the manifest fields, Phase 3 |
| 2: settings migrations | `settings.migrations`, Phase 2 |
| 3: select-option labels, error messages | the typed `localize()` of ADR 0018 |
| 4, 5, 6: hooks, pages, procedures, routes, data | Phases 4 and 5 |
| 9: generated sentinel secrets, procedure outputs | sentinels that pass every schema; procedures (Phase 5) |

## Port contract suites

| Import | Proves |
| --- | --- |
| `@virtbase/integration-testing/ports/dns` | the record name is derived from the IPv4 or IPv6 address; upserts are idempotent and replace the hostname; a zone with or without a trailing dot is the same zone, for upserts and deletes; delete removes only the listed records, IPv6 ones included, and succeeds for absent ones |
| `@virtbase/integration-testing/ports/notifications` | `supports()` is honest for the listed audiences; `send()` delivers once and resolves with a receipt; a failed delivery rejects with no secret in the error or its cause chain. That target secrets never reach the logs rests on `ctx.logger`'s redaction, which the suite cannot see. |

Each takes a setup function that returns the adapter on a fresh fake provider,
and a view of that provider; `runDnsContract` and `runNotificationContract`
return the failures instead.

The other ports' suites are added with the first integration that provides
them: `invoice` with Lexware, `metrics` with Prometheus, `payment` with Stripe,
`identity`, `abuse` and `ipReputation` with Discord and AbuseIPDB, and
`provisioning` in Phase 6.

## Templates

`templates/` holds the nine docs files as ADR 0016 defines them. Their `TODO`
lines are the placeholders the docs check looks for, not tasks.

## Tests

Every check and suite runs against a reference implementation that passes and
against broken ones that must fail: a conforming example integration with
written docs, an in-memory DNS adapter and a fake notification channel.
