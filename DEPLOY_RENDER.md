# AntPro → Render deploy (site + scraper)

## A. GitHub pe code daalo

1. Naya GitHub repo banao (private recommended)
2. `antpro` folder ka content push karo:

```bash
cd antpro
git init
git add .
git commit -m "AntPro deploy"
# GitHub pe repo bana ke:
git remote add origin https://github.com/YOUR_USER/antpro.git
git branch -M main
git push -u origin main
```

**Important:** `serviceAccountKey.json` mat commit karo public repo me.  
Render pe JSON env var se jayega.

---

## B. Website (Web Service)

1. [render.com](https://render.com) → Sign up / Login (GitHub se)
2. **New → Web Service**
3. Repo connect karo
4. Settings:

| Field | Value |
|--------|--------|
| Name | `antpro-web` |
| Runtime | **Node** |
| Build Command | `npm install --omit=dev` |
| Start Command | `node server.mjs` |
| Instance | Free |

5. Environment:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `FIREBASE_DATABASE_URL` | `https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `FIREBASE_CREDENTIALS_JSON` | Same complete service-account JSON used by the scraper |

6. **Create Web Service** → URL milega: `https://antpro-web-xxxx.onrender.com`

Free tier ~15 min inactive pe sleep ho sakta hai — pehli request thodi slow.

---

## C. Scraper 24/7 (Background Worker)

1. **New → Background Worker**
2. Same repo
3. Settings:

| Field | Value |
|--------|--------|
| Name | `antpro-scraper` |
| Root Directory | `scraper` |
| Runtime | **Python 3** |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `python cricket_scraper.py` |

4. Environment:

| Key | Value |
|-----|--------|
| `FIREBASE_DATABASE_URL` | `https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `POLL_INTERVAL` | `5` |
| `FIREBASE_CREDENTIALS_JSON` | **poora** `serviceAccountKey.json` content (ek line / paste) |

JSON kaise daale:
- File kholo → Ctrl+A → Copy  
- Render env value me paste  
- Quotes mat todna, poora `{ ... }` paste

5. **Create Worker**

Logs me dikhna chahiye:
```
Firebase connected → https://antpro-live-...
Scraper started | poll every 5.0s
Pushed N matches to Firebase
```

### Durable application state (required)

Render's local filesystem is ephemeral. The website now stores users, virtual rounds, marquee text, and demo bet history in Firebase through the Admin SDK, in addition to the local `data/` backup files. Set both `FIREBASE_DATABASE_URL` and the complete `FIREBASE_CREDENTIALS_JSON` on the **web service** and the scraper. Never commit the service-account JSON.

The Admin SDK writes under `antpro_state/` and `users/`; keep those paths server-only in Firebase Rules. On restart, the hierarchy is restored before the web server starts accepting requests.

---

## D. Firebase Rules (ek baar)

Realtime Database → Rules → Publish:

```json
{
  "rules": {
    "live_matches": { ".read": true, ".write": false },
    "users": { ".read": true, ".write": false },
    "meta": { ".read": true, ".write": false }
  }
}
```

---

## E. Check

1. Web URL kholo → login `P2001` / `play123`
2. Firebase Console → `live_matches` update hote dikhne chahiye
3. Worker logs green / no crash

---

## Note (Free tier)

- **Web**: sleep after idle (normal)
- **Worker**: Render free worker availability change ho sakti hai; agar worker create na ho to paid starter (~$7) ya Railway pe same commands use karo
- Scraper band = live sessions freeze; site phir bhi chalegi

## Railway alternative (agar Render worker na mile)

1. railway.app → New Project → GitHub repo
2. Service 1: start `node server.mjs`
3. Service 2: root `scraper`, start `python cricket_scraper.py`
4. Same env vars

Railway is only needed for the scraper if Render cannot run a background worker. The main site can remain on Render; both services share Firebase.
