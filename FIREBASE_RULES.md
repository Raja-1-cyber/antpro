# Firebase Realtime Database — FULL RULES

Console → Realtime Database → **Rules** tab → paste → **Publish**

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
      ".write": false
    }
  }
}
```

Database URL:
`https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app`
