# AntPro

Demo mobile betting portal (coins only) + live cricket scraper → Firebase.

Users, virtual rounds, marquee text, and demo bet history are persisted through Firebase Admin so Render restarts do not erase them. Railway is optional for the scraper worker only.

The approved clean reset uses `RESET_HIERARCHY_ONCE=1` for one deployment: it keeps only `MASTER` with `50,000,000` coins, removes old hierarchy IDs, preserves game timers/logic, and then records a durable reset marker. Remove the variable after the successful reset log.

## Repo
https://github.com/Raja-1-cyber/antpro

## Firebase Realtime Database Rules (paste + Publish)

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "live_matches": { ".read": true, ".write": false },
    "users": { ".read": true, ".write": false },
    "meta": { ".read": true, ".write": false }
  }
}
```

Database URL:
`https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app`

## Run local
```bash
node server.mjs
# scraper:
cd scraper && pip install -r requirements.txt && python cricket_scraper.py
```

## Render
See `DEPLOY_RENDER.md`

## Initial login
- Master: `MASTER` / `master123`
- Master account se Super Masters, Agents aur Clients create karein.
- Controller: /x9k2-ns-ctrl

**Note:** Upload full project from `antpro-complete.zip` if any large files (app.js, assets) are missing — GitHub web UI → Upload files.
