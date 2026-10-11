# Events

The integration emits no events and runs no hooks. Every accepted alert becomes
an `InboundSignal` submitted to the `signals` port; what follows, a case, a
notification or nothing, is the abuse desk's rules.
