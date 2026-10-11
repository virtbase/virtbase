# Events

None. Prometheus emits no events and runs no hooks.

As of 2026-10-11 no code in `packages/` or `apps/` resolves the `metrics` port.
A caller resolves it with `integrations.resolve("metrics")` and calls
`increment`, `gauge` or `observe` directly. It may pass:

- a dotted name (`MetricSample.name`), used with one of the three methods only,
  and not the name of a platform gauge (`PLATFORM_GAUGE_SUFFIXES` in
  `src/collectors.ts`);
- labels whose values are low cardinality, never a user, a server or an address
  (`MetricLabels` in `@virtbase/ports`);
- a finite number.

The sink drops anything else with a warning, as
[architecture](architecture.md#recording-through-the-port) describes.
