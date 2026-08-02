# Overgoal

The player client is a Vite/React application. It renders match state returned by
the sibling `match_server`; it does not run the match engine locally.

## Prerequisites

- Local development and CI use exactly Node.js 22.14.0 (`.nvmrc` and the CI
  workflow) plus pnpm 10.24.0 (the integrity-pinned `packageManager`).
  `engines.node` deliberately allows Node.js `22.x` so Vercel can select its
  supported Node 22 runtime; it is not an exact Node 22.14.0 deployment pin.
- The `match_server` checkout that owns this submodule, or a sibling standalone
  checkout.
- `mkcert` only when running the client over local HTTPS.

## Install

For a standalone clone:

```bash
git clone https://github.com/overgoal/client.git client
cd client
pnpm install --frozen-lockfile
```

When this repository is checked out as `match_server/bauti_client`, run the
client install from the server root with:

```bash
cd bauti_client
pnpm install --frozen-lockfile
```

Then install and start the backend from the parent directory in a separate
terminal:

```bash
cd ..
npm install
npm run dev
```

For standalone sibling checkouts, use `cd ../match_server` instead.

Configure the backend on an explicit non-3000 port, for example `3100`, then
confirm it is ready with:

```bash
PORT=3100 npm run dev
curl http://localhost:3100/health
```

## Environment

Create a local configuration from the committed template:

```bash
cp .env.example .env.development
```

Development commands load `.env.development`. Production builds load
`.env.production.local`, so create that ignored file separately before a
production build or HTTPS preview:

```bash
cp .env.example .env.production.local
```

For local development, keep `VITE_MATCH_API_BASE_URL=/api` and
`VITE_MATCH_API_PROXY_TARGET=http://localhost:3100`. Vite proxies `/api/*`
to the backend, so the browser uses one origin even when the client is served
over HTTPS.

For a deployed reverse proxy, keep `/api`. The client uses the server-managed
cookie and retains only its CSRF token in memory. A direct staging or production
API URL must be HTTPS, for example
`VITE_MATCH_API_BASE_URL=https://match.staging.overgoal.example/api`. Direct
origins deliberately use bearer transport: the browser requests it with
`Overgoal-Session-Transport: bearer`, sends no credentialed CORS requests, and
keeps the returned bearer token in memory only. An invalid direct URL is
reported as an API configuration error instead of silently falling back to a
different endpoint. Plain HTTP remains valid only for localhost development.

All `VITE_` values are included in browser code. Do not put private keys,
tokens, or production secrets in `.env` files or `VITE_` variables. The client
does not accept a browser-side master private key.

## Run

Start the development server over HTTP:

```bash
pnpm dev:http
```

Open `http://localhost:3002`. `pnpm dev` also uses the value of
`VITE_LOCAL_HTTPS` from the environment file.

### Local HTTPS

Generate trusted local-only certificates once:

```bash
pnpm mkcert
```

Set `VITE_LOCAL_HTTPS=true` in `.env.development`, then run:

```bash
pnpm dev:https
```

Open `https://localhost:3002`. The certificate files default to `dev-key.pem`
and `dev.pem`; configure different local paths with `VITE_HTTPS_KEY_PATH` and
`VITE_HTTPS_CERT_PATH`. They are ignored by Git. When HTTPS is requested but
either file is missing or unreadable, Vite exits with an explicit setup error;
it never falls back to HTTP.

## Build And Preview

```bash
pnpm build
pnpm preview
```

`pnpm preview` serves the production build over HTTP by default. With generated
certificates and `VITE_LOCAL_HTTPS=true` in `.env.production.local`,
`pnpm preview:https` serves it over HTTPS. Vite preview does not proxy `/api`;
configure a same-origin reverse proxy or set `VITE_MATCH_API_BASE_URL` to a
reachable direct HTTPS backend before running `pnpm build`. Vite embeds public
variables at build time; changing them after `pnpm build` does not update the
bundle.

## Quality Gates

The client quality gates run on exactly Node.js 22.14.0 and pnpm 10.24.0. Local
version managers use `.nvmrc`; CI verifies both executable versions after
Corepack resolves the integrity-pinned `packageManager` entry. `engines.node`
intentionally remains `22.x` for Vercel's supported runtime selection, while the
explicit Vercel install and build commands remain in place because deployed
commit `f6faa371b8eed341e3bc9ec1c067ef099ccfdd10` was empirically green. The
configuration alone does not prove a host enables Corepack, so deployment
evidence and the explicit commands are required alongside the local/CI policy.
Its stable job check is `client-quality`.

```bash
pnpm install --frozen-lockfile
pnpm ci:verify
pnpm test:policy
pnpm test:fixtures
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm exec playwright install --with-deps chromium
pnpm test:browser
OVERGOAL_REAL_SERVER_ROOT=/path/to/match_server \
  OVERGOAL_REAL_SERVER_NODE=/path/to/node-v24.18.0 \
  pnpm test:browser:real-server
pnpm test:browser:stale-port
pnpm test:browser:signal
pnpm build
```

`pnpm test:fixtures` verifies the hardcoded source revision, a hardcoded
fixture-manifest digest, and a hardcoded aggregate tree digest for the
checked-in, test-only Match API v1 mirror at `tests/fixtures/match-api-v1`.
The mirror includes canonical `openapi.json`; AJV 2020-12 with `ajv-formats`
checks all declared payloads against its schemas, route associations, and
declared formats. Its canonical source is
`mgrunwaldt/match_server` revision
`8bfcdec94f33054e73176fdc9af939f189f4369e`. The mirror includes the final
Auth Boundary v1 challenge/proof requests and challenge/session responses;
tests validate their route associations, schemas, two-field proof shape, file
hashes, and aggregate tree seal. Runtime source must not import these fixtures.
The self-pass packet under `tests/fixtures/reproductions` has
its own source-revision/hash manifest plus an independently hardcoded manifest
seal. It preserves a historical M0 packet rather than claiming conformance to
the current M1 response schema. It is client hydration input only; the server
harness owns executable engine reproduction and causal correctness.

The browser smoke builds the normal production bundle, including Dojo SDK
initialization and `DojoSdkProvider`, starts an owned Vite preview on an
OS-assigned port, exports that URL as `PLAYWRIGHT_BASE_URL`, and verifies the
routes in desktop Chromium plus a Pixel 5 viewport with real touch dispatch.
Startup, early preview exit, and failed teardown fail the command. Signal mode
selects one desktop-only worker rather than duplicating its 60-second hold in
the mobile project. `pnpm test:browser:stale-port` occupies a separate
OS-assigned listener and passes that port to the runner; it never requires a
specific port to be free. `pnpm test:browser:signal` starts the actual
Corepack/pnpm package script, terminates its active process group while
Playwright is running, then proves the runner PID, package-script, preview, and
Playwright process groups are gone and the preview port can be rebound. The
smoke confirms application mounting and fatal-error handling only.

`pnpm test:browser:real-server` is the distinct M2-I2 deployment smoke. It
requires a trusted Match API checkout with its existing Node 24 dependencies;
the command does not install or rebuild either package. The runner validates
that checkout's declared exact Node runtime and LOCAL_CI production-repository
launcher, refuses to kill or reuse occupied listeners, and uses only ports
`4176` (production client preview) and `3444` (actual Match API). If either port
is already occupied, stop that listener before running the smoke.

The runner creates private ephemeral TLS, SQLite, wallet, and auth-material
state outside both repositories. It drives the real signed LOCAL_CI
challenge/session path, then create/start through the first Timeline state over
`https://127.0.0.1:3444`. The production bundle embeds that direct API URL,
Vite preview has no proxy, and browser assertions require the exact CORS origin,
preflight, opaque bearer, absence of cookies, command headers, and Match API v1
responses. Cleanup terminates only runner-owned process groups and deletes all
ephemeral credentials and build output, including on signals or child failure.

The build keeps every JavaScript chunk below Vite's 500 kB warning boundary
and verifies that the login static graph excludes the game route. The Chromium
smoke also rejects browser warnings and any login-time game model request. These
are interim startup guards; M0-I7 owns the final mobile transfer and runtime
budgets.

The intended `main` branch protection settings are machine-readable in
`.github/branch-protection.main.json` and checked by `pnpm ci:verify`. Live
repository enforcement requires a GitHub administrator and remains external to
this checkout.

## Troubleshooting

- `VITE_LOCAL_HTTPS=true requires a local certificate and key`: run `pnpm mkcert`
  or set `VITE_LOCAL_HTTPS=false`.
- Requests to `/api` fail: start the parent or sibling `match_server`, check its
  `/health` endpoint, and verify `VITE_MATCH_API_PROXY_TARGET`.
- A direct `VITE_MATCH_API_BASE_URL` is blocked by the browser: use an HTTPS
  backend with an appropriate CORS policy, or restore the local `/api` proxy.
