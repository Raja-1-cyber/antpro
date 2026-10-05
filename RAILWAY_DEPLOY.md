# AntPro Railway deployment

AntPro is deployed on Railway as **two services from the same GitHub repository**:

1. **antpro-web** — Node web server, all game engines, timers, controller, login, APIs, and Firebase durable state.
2. **antpro-scraper** — Python worker that writes live cricket matches and sessions to the same Firebase Realtime Database.

Do not run the scraper as part of the web process. Keeping it separate prevents a scraper restart or exception from taking down the website and game engines.

## Service 1: web + games

1. Railway → **New Project** → **Deploy from GitHub Repo** → select `Raja-1-cyber/antpro`.
2. Open the service **Settings**.
3. Root Directory: `/` (repository root).
4. Railway detects the root `railway.json`; if it asks for a start command, use:

```text
node server.mjs
```

The repository includes a root `Dockerfile` based on `node:22-bookworm-slim`. This is intentional: it prevents Railway from accidentally using the scraper's old Python image for the web service, which would produce `The executable node could not be found`.

5. Generate a public domain for this service.
6. Add these variables to the **web service**:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `FIREBASE_DATABASE_URL` | `https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `FIREBASE_CREDENTIALS_JSON` | Complete Firebase service-account JSON, exactly as one variable |

Do not add the JSON to GitHub or paste it into source files.

The server listens on Railway's injected `PORT` and binds to `0.0.0.0`. The health check is:

```text
/api/health
```

After deployment, verify:

```text
https://YOUR-RAILWAY-DOMAIN/api/health
https://YOUR-RAILWAY-DOMAIN/login
https://YOUR-RAILWAY-DOMAIN/x9k2-ns-ctrl
```

The public controller path is `/x9k2-ns-ctrl`; the controller password is separate from the normal user login.

## Service 2: cricket scraper

In the same Railway project, add another service from the same GitHub repository.

1. Service Settings → Root Directory: `/scraper`.
2. Railway detects `scraper/railway.json`; if it asks for a start command, use:

```text
python cricket_scraper.py
```

The scraper has its own `scraper/Dockerfile` based on `python:3.12-slim`.

3. Add these variables to the **scraper service**:

| Variable | Value |
|---|---|
| `FIREBASE_DATABASE_URL` | Same RTDB URL as the web service |
| `FIREBASE_CREDENTIALS_JSON` | Same complete Firebase service-account JSON |
| `POLL_INTERVAL` | `5` |

The scraper writes:

- `live_matches`
- `meta/scraper`

The web service reads those Firebase paths. The scraper does not need a public domain.

## Important deployment rules

- Use **two Railway services**, not one combined command.
- Do not use `npm start` for the scraper service.
- Do not set the scraper service root directory to `/`; it must be `/scraper`.
- Do not put Firebase credentials in GitHub.
- Keep `FIREBASE_DATABASE_URL` and `FIREBASE_CREDENTIALS_JSON` identical in both services.
- Do not set `PORT` manually; Railway supplies it for the web service.
- Do not set `RESET_HIERARCHY_ONCE` unless an intentional clean reset is required. It is not needed for normal deployment.

## Railway deployment versus Render

Once Railway web health and login are verified, stop using the Render web service to avoid two servers writing the same state. Keep only one production web service active. The Firebase database remains the durable source of user, round, marquee, bet, and scraper state.

## Expected game behavior

Railway runs the same `server.mjs` and browser assets as the repository. Therefore the following remain enabled:

- Andar Bahar, Lucky 7, Teen Patti, and Dragon Tiger engines
- Shared round timers and automatic next rounds
- Controller live totals and decision window
- Automatic smart decision when no controller decision arrives
- Login and controller password pages without pre-entry refresh
- Firebase-backed persistence across container restarts
