# novnc-proxy

Bridges noVNC browser consoles to the `vncwebsocket` endpoint of a Proxmox VE
node. Shipped as a single executable (`bun build --compile`) in a distroless
image.

The web app (`servers.console` in `packages/api`) mints an AES-256-GCM
encrypted, expiring payload naming the node, the guest and the credentials to
open its console. noVNC hands it back as `GET /?payload=...`. The proxy verifies
it with the same `@virtbase/utils` and `@virtbase/validators` code that minted
it, upgrades the connection, dials the node over TLS and forwards frames both
ways. It has no database and trusts nothing from the browser that is not inside
the authenticated payload.

## Running it

```bash
docker run -p 8443:8443 -e NOVNC_PROXY_SECRET=... ghcr.io/virtbase/novnc-proxy:latest
```

| Variable              |          |                                                                                         |
| --------------------- | -------- | --------------------------------------------------------------------------------------- |
| `NOVNC_PROXY_SECRET`  | required | 64 hex characters, the same value the web app has. The proxy will not start without it. |
| `PORT`                | `8443`   | Listening port.                                                                         |
| `NODE_EXTRA_CA_CERTS` | —        | PEM bundle trusted on top of Bun's bundled roots, for nodes with a private CA.          |

TLS is terminated in front of the proxy; it speaks plain HTTP and `ws://`.
`GET /api/status` returns `{"uptime": <seconds>}`, and `novnc-proxy healthcheck`
checks it from inside the container - the image has no shell, so that is its
Docker `HEALTHCHECK`.

**Images:** `X.Y.Z`, `X.Y` and `latest` are releases, `edge` is the newest
`main`, `sha-<short>` pins one commit. Each GitHub release also carries the
`linux-x64` executable as a tarball. It needs glibc and nothing else.

## Developing

```bash
bun run start      # run from source, reading the root .env
bun run test       # unit, end-to-end and executable tests
bun run compile    # build dist/novnc-proxy
```

The executable is built with `.env` and `bunfig.toml` autoloading switched off,
so a stray file in its working directory cannot change its configuration. Its
version lives in `version.txt`, which release-please bumps - not in
`package.json`, whose version `bun.lock` would record and a release would then
leave stale.

| File             |                                                        |
| ---------------- | ------------------------------------------------------ |
| `src/index.ts`   | The command line: serve, or `healthcheck`.             |
| `src/config.ts`  | The environment, parsed with zod.                      |
| `src/payload.ts` | `verifyPayload()`: format, decryption, schema, expiry. |
| `src/server.ts`  | HTTP, the websocket handlers and shutdown.             |
| `src/bridge.ts`  | `Bridge`, one console's two sockets and its lifecycle. |
| `src/log.ts`     | The one logging helper.                                |

The tests run the real proxy against a local Bun server standing in for the
node; only the base URL the proxy dials is swapped.

## Behaviour worth knowing

- **Every bad payload gets the same 400.** Tampered, expired, wrong key or an
  outdated schema all look alike from outside. The reason only goes to the log.
- **Nothing in a websocket handler may throw.** A throw there takes down the
  whole process, every console with it. `close()` throws for 1005 (no status)
  and 1006 (dropped connection), which only describe a connection locally, so
  close codes are mapped to 1000 or 1011 first. `new WebSocket()` throws for a
  ticket it cannot put in a header, quoting it, so the dial is guarded and that
  error is never logged.
- **Nothing routes through shared state.** In particular nothing is keyed on
  `vmid`, which is only unique per node. The one shared set holds open consoles
  so a shutdown can reach them.
- **The browser may speak first.** Up to 64 frames or 1 MiB are held until the
  node answers; more closes the console.
- **The node gets 15 seconds** for TCP, TLS and the websocket handshake.
- **A node that stops reading cannot hold its socket.** Bun ignores
  `terminate()` once a close is queued, and a close queued behind data the node
  is not reading never goes out. So a node that has fallen behind gets 5
  seconds to catch up before its close, and is terminated if it has not.
- **SIGTERM closes open consoles with 1001** and waits up to 10 seconds for
  them to finish.
