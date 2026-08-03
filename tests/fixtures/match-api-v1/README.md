# Match API v1 Contract Artifacts

`openapi.json` is the machine-readable OpenAPI 3.1 contract. The JSON format is
intentional: repository validation does not depend on a YAML parser.

The fixture manifest binds each provider and player-client body to a named
component schema and exact method/path/status association; scene examples bind
to their named pending-action schemas. Run static and live checks with:

```sh
node contracts/match-api/v1/validate.mjs
npm run test:contract
```

`npm run test:contract` also validates every manifest fixture with AJV's
JSON Schema 2020-12 implementation, lints the OpenAPI document with the pinned
Redocly CLI, and validates live provider responses with both AJV and the local
contract validator. Redocly's `operation-4xx-response` advisory is skipped
because the read-only health and team-list operations have no client-error
response; all other recommended rules remain enabled.

The local validator additionally checks route inventory, exact manifest
method/path/status/body associations, complete scene coverage, lifecycle minute
boundaries, field-state linkage, and timeline ordering. It is intentionally not
treated as a replacement for AJV or Redocly.

Public errors use `ErrorResponse` with required `error`, `code`, and integer
`status` fields. Each public HTTP status references its exact status-specific
schema component: `400` malformed/request/transition codes, `401 UNAUTHORIZED`,
`403 FORBIDDEN`, `404 RESOURCE_NOT_FOUND`, explicit `409` conflict codes,
explicit `422` validation codes, and `500 INTERNAL_ERROR`. Error schemas reject
unknown top-level fields after composition and bound error/request-ID strings.
Negative AJV fixtures cover credential, wallet, signature, verifier-output, and
generic unknown-field injection. Live tests require malformed/oversized JSON and
malformed URI failures to remain safe JSON without HTML, stacks, or paths. AJV
fixtures include each status and reject code/status mismatches.

Human-facing lifecycle, compatibility, and M0/M1 implementation semantics are
defined in `docs/contracts/match-api-v1.md`.

M1-I1 activates the reserved `Match.seed`, `Match.engine_version`, and
`Match.ruleset_version` response fields and documents the additive
`initial_state`, action/decision sequence, and action-version metadata. Replay
remains an internal domain operation rather than a public Match API v1 route.

M2-I3 adds canonical tactical kick input and server-authored control envelopes
for Open Play, Free Kick, Corner, and Penalty. New canonical kicks persist as
decision version `2`; the version `1` flat kick schema remains readable for
debug and replay compatibility. Flight, collision, outcome, receiving pose, and
physical or Timeline follow-up metadata are provider-authored.

M2-I4 makes Dribble a standalone server-selected scene under `match-engine/3`.
Both choices submit an eight-second timed lane trace; simulation additionally
targets an authoritative pressure window. Current Dribble decisions persist as
version `3`, while engine versions 1 and 2 remain frozen and replay-readable.

M2-I6 advances live matches to `match-engine/5` and freezes the complete v4
dependency closure. Legend availability, halftime summary, and full-time handoff
are mandatory progress/snapshot projections. Halftime Continue, administrative
abandonment, regulation point deltas, pending settlement handoff, and terminal
contribution/event summaries are server-authored, persisted, and replayable.
