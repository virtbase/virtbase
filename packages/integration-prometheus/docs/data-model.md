# Data model

Prometheus owns no tables and reads none. The platform counts come from core
through the `platformMetrics` port. Samples recorded through the `metrics`
port live in process memory until the process ends, or until the runtime is
replaced because the prefix, the bucket bounds or the runtime-metrics switch
changed. No metric is labelled with a user, a server or an address.
