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
the existing session for safe CSRF recovery, then establishes a fresh signed
session for that wallet before rendering protected match state. The frozen
public session summary does not contain a wallet subject, so treating cookie
hydration alone as wallet proof would permit an old browser cookie to be shown
under a newly selected account.

## Server Envelope Confirmation

The frozen Auth Boundary v1 machine contract defines request fields, routes,
transport, and session-context semantics, but not success JSON envelopes. The
client currently requires the following narrow envelopes from the M1 server:

```ts
POST /auth/v1/challenges -> {
  challenge: { challenge_id: string; typed_data: TypedData }
}

POST /auth/v1/sessions -> {
  session: { legend?: { id?: string; display_name?: string } | null }
  transport?: { kind?: "cookie" | "bearer"; bearer_credential?: string }
}

GET /auth/v1/session -> {
  session: { legend?: { id?: string; display_name?: string } | null }
  response_context: { cookie_csrf_token: string | null }
}
```

`typed_data` is deliberately server-supplied because the server is the source
of trusted audience, deployment, origin, timestamps, and challenge bindings.
If the parallel M1 server publishes a different response envelope, change this
typed boundary and its fixtures together; do not add fallback endpoint shapes.
