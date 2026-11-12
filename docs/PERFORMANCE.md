# Performance notes (12 November 2026)

Measured before changing code. Live site over a home connection from India is not available here; the
numbers below are from a laptop in a different region, so absolute latency is pessimistic but the
ratios between calls hold.

| What | Measured | Why it is slow |
| --- | --- | --- |
| `/` HTML | 287 KB, TTFB 0.5 s, 132 KB of inline RSC payload | The home page carries every section's data in the HTML. Not changed in this pass. |
| `/c/grocery` | 175 KB, TTFB 0.25 s | Fine. |
| `/api/location/serviceability` | 0.47 s | One RPC through the cookie-bound client. Called by the old flow twice per save (client check, then `find_zone` inside the action). |
| `/api/maps/geocode` | 0.43–1.57 s | Google Geocoding is refused (billing off), so every call paid for a dead Google round trip and then Nominatim (1.1 s on its own). |
| `/api/maps/search` | 0.72 s | Local places + Google autocomplete in parallel, Photon when Google declines. No upstream timeout. |
| Map picker | Leaflet 148 KB JS + 15 KB CSS + 12 tiles + geocode + zone check before the first field could be typed | The old wizard opened the map first; every pan ran geocode then zone check one after the other. |
| Rider home chunk | included `@vis.gl/react-google-maps` | `LiveMap` was imported statically by the active-delivery card. |
| Service worker | v9 live (v10 built) | Caches only the shell, icons, manifests and `/_next/static`; pages and API responses are never cached. No change needed. |

## What changed

- **Address first.** The new-address flow opens on the details form. "Choose on map" is an optional step that
  loads the map picker chunk, Leaflet and tiles only when tapped (`next/dynamic`, verified in the browser: no
  Leaflet, tiles or geocode calls until the tap). GPS stays a shortcut inside the form; the geocoder fills only
  empty fields, is cancelled after 6 s, and never blocks typing or saving.
- **One server-side zone check.** `saveAddressAction` refuses an address outside every zone (`find_zone`, pin
  first then pincode) with `outsideArea`, and runs that lookup in parallel with the default-address count. The
  separate client check before the save is gone; the form shows an early, debounced, cancellable zone hint as the
  pincode or pin changes, for feedback only.
- **Map picker.** Zone check and reverse geocode run side by side and are cancelled by the next pan; Confirm waits
  for the zone answer, never for the address text. Search suggestions cancel stale requests.
- **Geocode / search routes.** 4 s / 3.5 s upstream timeouts; a Google key that is refused is skipped for ten
  minutes instead of being retried on every pin.
- **Pre-existing bug fixed.** "Add new address" from the header's location picker did nothing: the picker closed
  its dialog and opened the sheet in the same tick, and the Back-to-close history pop landed on the sheet's entry and
  closed it. `useBackToClose` now counts pending pops: a panel that opens while one is pending waits for it (600 ms
  cap) before pushing its own entry, and the picker also defers the open with `afterOverlayClose`.
- **Form trimmed on request (12 Nov):** no destination selector, no landmark, no pincode; city fixed to Merta City.
  The pincode stays set to the city default behind the form, so `find_zone` still decides the zone (pin first).
- **Rider map** is a lazy chunk, fetched when the rider opens the folded map.

## Not changed, with reasons

- Home HTML size: no measured user-facing stall; trimming the RSC payload is a separate job.
- No new dependency: Leaflet stays self-hosted; Google Maps React stays for tracking.
- Vercel Hobby cron cadence (see `docs/CRONS.md`).
