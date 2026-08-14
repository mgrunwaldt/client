# Overgoal Mobile Shell

Overgoal remains a browser application but ships an installable mobile shell. The web manifest
prefers fullscreen where supported and falls back to standalone mode. A normal browser tab remains
a supported presentation.

## Safe areas

`src/styles/globals.css` exposes the four device insets as `--overgoal-safe-*` variables. Full-screen
UI surfaces use `overgoal-safe-screen`; FIELD keeps the pitch full bleed and applies the same tokens
only to interactive HUD, dialogs, results, and recoverable errors. This avoids moving the game world
while keeping controls outside notches and home indicators.

## Cache and updates

`public/sw.js` is intentionally not an offline match engine.

- Match/API requests are always network-only and are never written to Cache Storage.
- Navigations are network-first and use the cached application shell only when offline.
- Only Vite's content-hashed `/assets/` files plus manifest/install icons use runtime cache.
- Worker updates do not call `skipWaiting`; an active match is never replaced mid-session. The new
  worker activates after existing game tabs close, and registration checks for an update on launch.
- Cache names are versioned and obsolete Overgoal shell caches are deleted at activation.

The cached shell can reopen the client while offline, but authoritative match state still follows
the existing session hydration and reconnect flow. No service worker response may invent or replay
a match command.
