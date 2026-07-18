# Overgoal

The player client is a Vite/React application. It renders match state returned by
the sibling `match_server`; it does not run the match engine locally.

## Prerequisites

- Node.js 22.14.0 and pnpm 10.24.0 (pinned in `.nvmrc` and `package.json`).
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

The backend listens on `http://localhost:3000`; confirm it is ready with:

```bash
curl http://localhost:3000/health
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

For local development, keep `VITE_MATCH_BACKEND_URL=/api` and
`VITE_MATCH_BACKEND_PROXY_TARGET=http://localhost:3000`. Vite proxies `/api/*`
to the backend, so the browser uses one origin even when the client is served
over HTTPS. Use `VITE_MATCH_BACKEND_URL` only for a deployed backend URL that
already supports the required browser security policy.

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
set `VITE_MATCH_BACKEND_URL` to a reachable deployed backend before running
`pnpm build`, or use `pnpm dev` for local proxying. Vite embeds public variables
at build time; changing them after `pnpm build` does not update the bundle.

## Quality Gates

The client quality gates run on exactly Node.js 22.14.0. Local version managers
use `.nvmrc`, while `package.json` constrains deployments to the Vercel-supported
Node 22 line through `engines`. The `Client Quality` GitHub Actions workflow and
runtime policy verifier enforce exact Node.js 22.14.0 and pnpm 10.24.0 versions.
Its stable job check is `client-quality`.

```bash
pnpm install --frozen-lockfile
pnpm ci:verify
pnpm test:policy
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm exec playwright install --with-deps chromium
pnpm test:browser
pnpm build
```

The browser smoke builds the normal production bundle, including Dojo SDK
initialization and `DojoSdkProvider`, serves it with Vite preview, and verifies
the `/login` route in Chromium. It confirms application mounting and fatal-error
handling only; broader client regression coverage is owned by M0-I5.

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
  `/health` endpoint, and verify `VITE_MATCH_BACKEND_PROXY_TARGET`.
- A direct `VITE_MATCH_BACKEND_URL` is blocked by the browser: use an HTTPS
  backend with an appropriate CORS policy, or restore the local `/api` proxy.
