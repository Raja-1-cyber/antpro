# AntPro Live Cricket Scraper → Firebase

Python bot that pulls live cricket scores and builds session-style Yes/No rates, then writes them into Firebase Realtime Database in this exact shape:

```json
{
  "live_matches": {
    "MATCH_ID": {
      "teams": "Team A vs Team B",
      "score": "145/3 (15.2 Overs)",
      "status": "LIVE",
      "sessions": {
        "6_over":  { "yes_run": "48", "no_run": "50", "status": "OPEN" },
        "10_over": { "yes_run": "85", "no_run": "87", "status": "OPEN" },
        "15_over": { "yes_run": "120","no_run": "122","status": "OPEN" },
        "20_over": { "yes_run": "155","no_run": "157","status": "OPEN" }
      }
    }
  }
}
```

Also writes a small heartbeat at `meta/scraper`.

---

## Important (read once)

- **Session odds are synthetic** (stable demo numbers derived from live status + score).  
  Real bookmaker “line” pages almost always forbid scraping. Using this for real-money markets without permission can violate Terms of Service and local law.
- The existing AntPro Node server already does a similar thing with SportScore + generated sessions. This scraper is the Firebase version so multiple clients can share one live feed.
- Default poll interval is **5 seconds**. 2 seconds is aggressive and will get rate-limited on free hosting + source sites.

---

## 1. Firebase setup (one-time)

1. Go to [Firebase Console](https://console.firebase.google.com/) → create / open project.
2. **Build → Realtime Database → Create Database** (start in test mode for demo, then lock rules).
3. Copy the database URL → `https://YOUR-PROJECT-ID-default-rtdb.firebaseio.com`
4. **Project Settings → Service accounts → Generate new private key** → save as `serviceAccountKey.json`.
5. Security rules (demo – tighten later):

```json
{
  "rules": {
    "live_matches": {
      ".read": true,
      ".write": "auth != null"
    },
    "meta": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

(For a pure server-side writer you can keep write restricted to the service account only.)

---

## 2. Local run

```bash
cd scraper
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env → put FIREBASE_DATABASE_URL and make sure serviceAccountKey.json is in this folder

python cricket_scraper.py
```

You should see:

```
Firebase connected → https://...
Scraper started | poll every 5.0s
SportScore → 12 matches
Pushed 12 matches (3 LIVE) to Firebase
```

---

## 3. Deploy 24/7 on Render (free tier)

1. Push the `scraper/` folder to a GitHub repo (or the whole AntPro project).
2. [Render.com](https://render.com) → **New → Background Worker**.
3. Connect the repo, set:
   - **Root Directory**: `scraper` (if whole project is in repo)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python cricket_scraper.py`
4. Environment variables (Render dashboard):
   - `FIREBASE_DATABASE_URL` = your RTDB URL
   - `POLL_INTERVAL` = `5`
5. For the service account JSON:
   - Easiest: paste the entire JSON into an env var `FIREBASE_CREDENTIALS_JSON` and change the script to load from env (or keep the file and use a Render Secret File).
   - Quick patch if you use env:

```python
# replace the credentials load in init_firebase()
import json, tempfile
cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
if cred_json:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        f.write(cred_json)
        FIREBASE_CRED_PATH = f.name
```

6. Deploy. Free tier sleeps after inactivity on web services; **Background Workers** stay up longer but still have monthly hour limits – upgrade if you need true 24/7.

---

## 4. Deploy on Railway

1. [Railway.app](https://railway.app) → New Project → Deploy from GitHub.
2. Add variables same as above.
3. For the JSON key: Railway supports **Variables** or a volume; same env-JSON trick works.
4. Start command: `python cricket_scraper.py`

---

## 5. Connect AntPro frontend

In `app.js` (or wherever you currently call `/api/cricket/...`) you can also listen to Firebase:

```js
// example with Firebase JS SDK (add the CDN or npm package)
import { getDatabase, ref, onValue } from "firebase/database";

const db = getDatabase();
onValue(ref(db, "live_matches"), (snap) => {
  const data = snap.val() || {};
  // render match list + session tables
  console.log("live from Firebase", data);
});
```

Keep the existing SportScore path as fallback so the demo still works without Firebase.

---

## File list

| File | Purpose |
|------|---------|
| `cricket_scraper.py` | Main async scraper + Firebase writer |
| `requirements.txt` | Dependencies |
| `.env.example` | Config template |
| `serviceAccountKey.json` | **You** add this (never commit it) |

---

## Tuning

| Env var | Default | Notes |
|---------|---------|-------|
| `POLL_INTERVAL` | `5` | Seconds between full cycles |
| `FIREBASE_DATABASE_URL` | — | Required |
| `FIREBASE_CREDENTIALS` | `serviceAccountKey.json` | Path to key file |

If the source page changes structure, only `scrape_sportscore` / `scrape_cricbuzz_fallback` need updating – the Firebase shape stays the same.
