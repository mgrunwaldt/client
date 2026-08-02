# Auth Boundary v1 Client Integration

The client uses Auth Boundary v1 only through `src/auth/api.ts`. A same-origin
`VITE_MATCH_API_BASE_URL` (normally `/api`) uses the server-managed
`__Host-overgoal_session` cookie; JavaScript never reads or persists that
credential. `GET /auth/v1/session` retains only
`response_context.cookie_csrf_token` in memory. Cookie mutations send that
value as `X-CSRF-Token`; browser fetch supplies `Origin` naturally.

A distinct HTTPS API origin uses bearer transport only. The client sends
`Overgoal-Session-Transport: bearer` only when it creates the session, always
uses `credentials: "omit"` for that origin, and keeps the returned
`session_credential` in memory. Match API requests then carry
`Authorization: Bearer ...` without a cookie CSRF value. A browser reload has
no bearer to hydrate by design and requires a fresh wallet sign-in. Plain HTTP
is allowed only for localhost development; malformed direct URLs produce a
safe configuration diagnostic before a request is attempted.

The login sequence is `POST /auth/v1/challenges`, wallet `signMessage` over
the server-supplied SNIP-12 `typed_data`, then `POST /auth/v1/sessions` with
the challenge ID and `{ r, s }` proof. No owner, principal, session, or test
identity header is sent by the client.

When a connected wallet reloads a protected route, the client first hydrates
the existing session for safe CSRF recovery. A matching session subject is
rendered without another wallet signature. A mismatched subject is logged out
before the connected wallet establishes a fresh signed session, so an old
account's match state is never exposed after an account switch.

## Server Envelope Confirmation

The client boundary follows the Match API v1 OpenAPI and fixtures pinned at
`d5393cf3ff6efa4d9c893e0534284b08b2f98d2c`:

```ts
POST /auth/v1/challenges
request -> {
  action: "CREATE_SESSION"
  chain_id: string
  account_address: string
}
response -> {
  challenge_id: string
  action: "CREATE_SESSION"
  account_address: string
  chain_id: string
  expires_at: string
  typed_data: TypedData
}

POST /auth/v1/sessions
request -> {
  challenge_id: string
  signature: { r: string; s: string }
}

POST /auth/v1/sessions and GET /auth/v1/session
response -> {
  session: {
    issued_at: string
    idle_expires_at: string
    absolute_expires_at: string
    subject: {
      provider: "starknet"
      chain_id: string
      account_address: string
    }
  }
  legend: { legend_id: string } | null
  response_context: { cookie_csrf_token: string | null }
  session_credential?: string
}
```

`typed_data` is deliberately server-supplied because the server is the source
of trusted audience, deployment, origin, timestamps, and challenge bindings.
The proof does not repeat account or chain authority: the server resolves both
from its stored challenge. `session_credential` is returned once only for
bearer creation and remains in memory. Cookie creation and hydration expose the
session-bound CSRF token in `response_context`; bearer hydration exposes null
and never returns the credential again.
