# Server Reproduction Boundary

`self-pass-follow-up-response.json` is a frozen Match API v1 response packet
that the client consumes without reinterpreting its player ownership or
same-minute event ordering. It represents the known M0 carrier/self-collision
case at `overgoal/match_server`
`b9d96f8e3d2e584d52329c4a90abdd770e3b88c7`.

`reproduction-manifest.json` records the packet source revision and SHA-256.
The fixture verifier seals that mutable manifest with an independent hardcoded
SHA-256, so changing the packet and its manifest together still fails.

This directory is not an executable simulation harness and does not claim to
derive engine output. The match-server harness owns deterministic reproduction,
the causal engine assertion, and any replacement response. The client owns only
hydrating the frozen authoritative packet as received. Update this packet only
after the server harness has produced and reviewed the replacement response.
