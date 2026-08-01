# Match Session State Machine

## Boundary

`src/match/api-v1` is the only Match API v1 transport boundary. It validates
every success and error body at runtime and requires `Match-API-Version: 1`.
It preserves request ID and retry metadata for recoverable UI errors.

`src/match/session-machine.ts` is a pure reducer. Zustand in
`src/match/session-store.ts` only stores reducer output and exposes semantic
commands to React. Route components must not infer score, minute, possession,
field positions, outcomes, or the next scene.

## Authoritative Phases

| Phase                           | Backend source                                     | Route projection           |
| ------------------------------- | -------------------------------------------------- | -------------------------- |
| `created`                       | `NOT_STARTED`                                      | Prematch                   |
| `starting`                      | Start command in flight                            | Prematch                   |
| `timeline_playback`             | `IN_PROGRESS` or `WAITING_FOR_DECISION`            | Timeline                   |
| `scene_ready`                   | Timeline reached an advertised known pending scene | Field                      |
| `submitting`                    | Action command in flight                           | Field                      |
| `result_playback`               | Accepted action response, before acknowledgement   | Field                      |
| `halftime`                      | `HALFTIME`                                         | Timeline lifecycle surface |
| `finished`                      | `FINISHED`                                         | Timeline lifecycle surface |
| `legend_unavailable_simulation` | `IN_PROGRESS` with `NOT_PARTICIPATING`             | Timeline lifecycle surface |
| `recoverable_error`             | Transport, stale command, or illegal transition    | Safe diagnostic surface    |
| `unsupported_contract`          | Unknown Match API status or scene                  | Safe diagnostic surface    |

`idle` and `creating` are local pre-match phases. They never fabricate an
authoritative match state.

## Transition Rules

- `MATCH_CREATED` accepts only `NOT_STARTED`.
- `START_REQUESTED` is legal only from `created`.
- `ACTION_REQUESTED` is legal only from `scene_ready` and must match the
  current authoritative action ID.
- Hydration accepts backend snapshots, validates every known status, and only
  preserves Timeline playback for the same match.
- A command response with a lower revision or another match ID is ignored into
  a recoverable stale-command diagnostic.
- Action responses enter `result_playback`; `RESULT_ACKNOWLEDGED` returns to
  the backend-derived lifecycle phase. This makes result hold a presentation
  concern without changing backend chronology.
- Duplicate retention of the same idempotency key is a no-op. A different
  command while one is pending is a safe diagnostic.

## Scene Coverage

The state machine recognizes `OPEN_PLAY`, `DRIBBLE`, `FREE_KICK`, `CORNER`,
`PENALTY`, `JUMPER`, `BRAWL`, `ARGUMENT_OPPONENT`, `ARGUMENT_TEAMMATE`, and
`BATHROOM`. Each maps to exactly one field-ready state after Timeline reaches
the server-provided minute. Unknown future scene values never route to a blank
screen; they enter `unsupported_contract`.

## Non-Goals Of M2-I1

This layer does not implement final controls, scene visual design, reconnect
transport, asset preloading, or complete browser certification. Those features
consume this contract in later M2 issues.
