# Tactical Kick Browser Fixtures

These test-only response fixtures were generated from backend commit
`1a13a59be73e4945be5268226701dae8b25fe6ef` with
`test/helpers/match-fixtures.mjs`, `createInMemoryMatchRepository`, and
`createMatchEngine(repository).createPendingAction(...)`. They retain the
authoritative 22-player field state for each canonical tactical scene:
Open Play, Free Kick, Corner, and Penalty.

The browser suite imports these files only to intercept the Match API in an
isolated client test. Runtime modules must not import this directory or derive
player placement, set-piece geometry, or control envelopes.

`controlled-result.ts` builds a deterministic test-only response from the Open
Play fixture. Its explicit continuation coordinates mirror the d140b81
receiver-control contract: the controlled teammate, facing target/vector,
carry offset, and ball position are all distinct so a client-side fixed offset
or axis swap cannot satisfy the assertions.
