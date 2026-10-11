# Architecture

The runtime provides `dns` through an in-memory adapter. The health probe sends one `GET /status` through `ctx.http` and reports `ok` on a 200 answer, `error` on anything else.
