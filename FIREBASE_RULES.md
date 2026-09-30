# Firebase Realtime Database — FULL RULES

Console → Realtime Database → **Rules** tab → neeche poora paste → **Publish**

```json
{
  "rules": {
    ".read": false,
    ".write": false,

    "live_matches": {
      ".read": true,
      ".write": false
    },

    "users": {
      ".read": true,
      ".write": false
    },

    "meta": {
      ".read": true,
      ".write": false,

      "scraper": {
        ".read": true,
        ".write": false
      },
      "app": {
        ".read": true,
        ".write": false
      }
    }
  }
}
```

## Matlab

| Path | Read | Write |
|------|------|-------|
| `live_matches` | Public (site + app) | Sirf Admin SDK (scraper / server) |
| `users` | Public (hierarchy load) | Sirf Admin SDK |
| `meta` | Public | Sirf Admin SDK |
| baaki sab | Band | Band |

Write client se nahi hota — scraper service account se hota hai. Safe for demo.

## Database URL
`https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app`
