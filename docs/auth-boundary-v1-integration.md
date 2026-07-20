# Auth Boundary v1 Client Integration

The client uses Auth Boundary v1 only through `src/auth/api.ts`. Production
browser traffic is same-origin and uses the server-managed
`__Host-overgoal_session` cookie; JavaScript never reads or persists that
credential. `GET /auth/v1/session` retains only
`response_context.cookie_csrf_token` in memory. Cookie mutations send that
value as `X-CSRF-Token`; browser fetch supplies `Origin` naturally. Bearer
transport is supported only by the same in-memory store and does not retain a
cookie CSRF value.

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
`9918cbc1beb502f0675895b9fbe64d77a96127dc`:

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
