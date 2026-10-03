#!/usr/bin/env python3
"""
AntPro Live Cricket + Session Odds Scraper → Firebase Realtime Database

- Fetches live cricket matches (scores, overs, status) from a public feed.
- Builds session (fancy) Yes/No style rates for 6 / 10 / 15 / 20 overs.
- Writes to Firebase every POLL_INTERVAL seconds (default 5s – 2s is aggressive
  and will get rate-limited on most free tiers / source sites).

IMPORTANT
---------
1. This is intended for the AntPro *demo* app. Real commercial bookmaker
   “line” pages almost always forbid scraping in their Terms of Service.
2. Session odds below are *synthetic* (derived from live status + score) so
   the Firebase shape matches what the frontend expects without violating
   third-party ToS. Replace `build_sessions()` with your own selectors only
   if you have legal permission to scrape that specific page.
3. Never put real money behind scraped data you do not own.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import random
import re
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Any

import aiohttp
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
def clean_database_url(value: str) -> str:
    """Accept a plain URL or a mistakenly pasted Markdown link from Railway."""
    raw = str(value or "").strip().strip('`').strip('"').strip("'")
    match = re.search(r"https?://[^\s\]\)\"']+", raw)
    if not match:
        return ""
    return match.group(0).rstrip("/").rstrip('"').rstrip("'").rstrip('`')


load_dotenv()

POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "5"))  # seconds
FIREBASE_DB_URL = clean_database_url(os.getenv("FIREBASE_DATABASE_URL", ""))
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CREDENTIALS", "serviceAccountKey.json")
USER_AGENT = os.getenv(
    "USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
)

# Public cricket widget used by the existing AntPro server (same source)
SPORTSCORE_URL = os.getenv("SPORTSCORE_URL", "https://sportscore.com/api/widget/matches/?sport=cricket&limit=30")

# Optional: extra public score page (fallback)
CRICBUZZ_LIVE = "https://www.cricbuzz.com/cricket-match/live-scores"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("antpro-scraper")

# ---------------------------------------------------------------------------
# Firebase
# ---------------------------------------------------------------------------
_firebase_app = None
_db = None


def init_firebase() -> None:
    global _firebase_app, _db
    if _db is not None:
        return

    import tempfile
    import firebase_admin
    from firebase_admin import credentials, db

    if not FIREBASE_DB_URL:
        raise RuntimeError(
            "Set FIREBASE_DATABASE_URL in .env (e.g. https://YOUR-PROJECT.firebaseio.com)"
        )

    cred_path = FIREBASE_CRED_PATH
    # Render / Railway: paste full JSON into FIREBASE_CREDENTIALS_JSON env var
    cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON", "").strip()
    if cred_json:
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        tmp.write(cred_json)
        tmp.close()
        cred_path = tmp.name
        log.info("Using FIREBASE_CREDENTIALS_JSON from environment")

    if not os.path.isfile(cred_path):
        raise RuntimeError(
            f"Firebase service account JSON not found at: {cred_path}\n"
            "Set FIREBASE_CREDENTIALS_JSON env var (Render) or place serviceAccountKey.json"
        )

    cred = credentials.Certificate(cred_path)
    _firebase_app = firebase_admin.initialize_app(
        cred, {"databaseURL": FIREBASE_DB_URL}
    )
    _db = db
    log.info("Firebase connected → %s", FIREBASE_DB_URL)


def push_to_firebase(payload: dict[str, Any]) -> None:
    """Write the full live_matches tree in one go (atomic-ish)."""
    if _db is None:
        init_firebase()
    ref = _db.reference("live_matches")
    ref.set(payload)
    # also a small heartbeat so the frontend can show “last update”
    _db.reference("meta/scraper").set(
        {
            "last_update": datetime.now(timezone.utc).isoformat(),
            "match_count": len(payload),
            "poll_interval": POLL_INTERVAL,
        }
    )


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
}


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=1, max=8))
async def fetch_text(session: aiohttp.ClientSession, url: str) -> str:
    async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=15)) as resp:
        resp.raise_for_status()
        return await resp.text()


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=1, max=8))
async def fetch_json(session: aiohttp.ClientSession, url: str) -> Any:
    async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=15)) as resp:
        resp.raise_for_status()
        return await resp.json(content_type=None)


# ---------------------------------------------------------------------------
# Match ID/status helpers
# ---------------------------------------------------------------------------
def is_live_status(value: Any) -> bool:
    status = re.sub(r"[^a-z]", "", str(value or "").lower())
    return status in {"live","inplay","inprogress","started","playing","1stinnings","2ndinnings"}


def make_match_id(name: str) -> str:
    """Stable short ID from team names."""
    clean = re.sub(r"[^A-Za-z0-9]", "", name.upper())[:24]
    if len(clean) >= 8:
        return clean
    return hashlib.md5(name.encode()).hexdigest()[:12].upper()


# ---------------------------------------------------------------------------
# Session odds builder (synthetic – replace only with licensed data)
# ---------------------------------------------------------------------------
def _seeded_noise(key: str, salt: int) -> int:
    h = int(hashlib.md5(f"{key}:{salt}".encode()).hexdigest()[:8], 16)
    return h % 9  # 0-8


def build_sessions(match_name: str, is_live: bool, score_str: str) -> dict[str, Any]:
    """
    Produce the exact shape the frontend expects.

    Real bookie “session” markets (6-over / 10-over Yes-No) change every ball.
    Here we generate plausible demo numbers that stay stable for a few polls
    so the UI does not flicker, then slowly drift.
    """
    overs_targets = (6, 10, 15, 20)
    sessions: dict[str, Any] = {}

    # crude current over extraction for status logic
    over_m = re.search(r"\((\d+(?:\.\d+)?)\s*[Oo]vers?\)", score_str or "")
    current_over = float(over_m.group(1)) if over_m else 0.0

    for target in overs_targets:
        key = f"{target}_over"
        if not is_live:
            sessions[key] = {
                "yes_run": "—",
                "no_run": "—",
                "status": "CLOSED",
            }
            continue

        if current_over >= target:
            sessions[key] = {
                "yes_run": "—",
                "no_run": "—",
                "status": "SETTLED",
            }
            continue

        # base run line roughly scales with overs left
        base = int(target * 7.2) + _seeded_noise(match_name, target)
        yes = base + _seeded_noise(match_name, target * 3)
        no = yes + 1 + (_seeded_noise(match_name, target * 5) % 3)

        sessions[key] = {
            "yes_run": str(yes),
            "no_run": str(no),
            "status": "OPEN",
        }

    return sessions


# ---------------------------------------------------------------------------
# Scrapers
# ---------------------------------------------------------------------------
async def scrape_sportscore(session: aiohttp.ClientSession) -> list[dict[str, Any]]:
    """Primary source – same public widget the AntPro Node server already uses."""
    data = await fetch_json(session, SPORTSCORE_URL)
    matches = data.get("matches") or []
    out: list[dict[str, Any]] = []

    for m in matches:
        home = (m.get("home") or "?").strip()
        away = (m.get("away") or "?").strip()
        name = f"{home} vs {away}"
        status_raw = (m.get("status") or "").lower()
        is_live = is_live_status(status_raw) or is_live_status(m.get("status_text"))
        home_score = m.get("home_score") or m.get("homeScore") or m.get("home_score_text") or "—"
        away_score = m.get("away_score") or m.get("awayScore") or m.get("away_score_text") or "—"
        # SportScore sometimes puts overs in status_text / time
        status_text = m.get("status_text") or m.get("status") or ""
        time_str = m.get("time") or ""
        score = f"{home_score} - {away_score}"
        if time_str and "over" in time_str.lower():
            score = f"{score} ({time_str})"

        mid = make_match_id(name)
        out.append(
            {
                "id": mid,
                "teams": name,
                "score": score,
                "status": "LIVE" if is_live else status_raw.upper() or "UPCOMING",
                "is_live": is_live,
                "competition": m.get("competition") or "",
                "raw_status": status_raw,
            }
        )
    return out


async def scrape_cricbuzz_fallback(session: aiohttp.ClientSession) -> list[dict[str, Any]]:
    """Lightweight HTML fallback if SportScore is down."""
    try:
        html = await fetch_text(session, CRICBUZZ_LIVE)
    except Exception as e:
        log.warning("Cricbuzz fallback failed: %s", e)
        return []

    soup = BeautifulSoup(html, "lxml")
    out: list[dict[str, Any]] = []

    # Cricbuzz structure changes often – this is a best-effort parser
    for card in soup.select(".cb-mtch-lst, .cb-lv-scr-mtch-cst")[:15]:
        teams_el = card.select(".cb-col-50, .cb-ovr-flo")
        if len(teams_el) < 2:
            continue
        t1 = teams_el[0].get_text(strip=True)
        t2 = teams_el[1].get_text(strip=True) if len(teams_el) > 1 else "?"
        name = f"{t1} vs {t2}"
        score_el = card.select_one(".cb-lv-scrs-col, .cb-scr-wll-chvrn")
        score = score_el.get_text(" ", strip=True) if score_el else "—"
        live_badge = card.select_one(".cb-text-live, .cb-lv-scrs-col .cb-text-live")
        is_live = bool(live_badge)
        mid = make_match_id(name)
        out.append(
            {
                "id": mid,
                "teams": name,
                "score": score[:80],
                "status": "LIVE" if is_live else "UPCOMING",
                "is_live": is_live,
                "competition": "",
                "raw_status": "live" if is_live else "upcoming",
            }
        )
    return out


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
async def one_cycle(session: aiohttp.ClientSession) -> dict[str, Any]:
    matches: list[dict[str, Any]] = []
    try:
        matches = await scrape_sportscore(session)
        log.info("SportScore → %d matches", len(matches))
    except Exception as e:
        log.warning("SportScore error: %s – trying Cricbuzz", e)
        matches = await scrape_cricbuzz_fallback(session)

    live_matches: dict[str, Any] = {}
    for m in matches:
        sessions = build_sessions(m["teams"], m["is_live"], m["score"])
        live_matches[m["id"]] = {
            "teams": m["teams"],
            "score": m["score"],
            "status": m["status"],
            "sessions": sessions,
            "competition": m.get("competition") or "",
            "updated_at": int(time.time() * 1000),
        }

    return live_matches


async def run_forever() -> None:
    init_firebase()
    connector = aiohttp.TCPConnector(limit=10, ttl_dns_cache=60)
    timeout = aiohttp.ClientTimeout(total=20)

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        log.info("Scraper started | poll every %.1fs", POLL_INTERVAL)
        while True:
            t0 = time.monotonic()
            try:
                payload = await one_cycle(session)
                if payload:
                    push_to_firebase(payload)
                    live_n = sum(
                        1 for v in payload.values() if v.get("status") == "LIVE"
                    )
                    log.info(
                        "Pushed %d matches (%d LIVE) to Firebase",
                        len(payload),
                        live_n,
                    )
                else:
                    log.warning("No matches this cycle")
            except Exception as e:
                log.exception("Cycle failed: %s", e)

            elapsed = time.monotonic() - t0
            sleep_for = max(0.5, POLL_INTERVAL - elapsed)
            await asyncio.sleep(sleep_for)


def main() -> None:
    # graceful shutdown on SIGTERM (Render / Railway)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def _stop(*_):
        log.info("Shutting down…")
        for task in asyncio.all_tasks(loop):
            task.cancel()

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    try:
        loop.run_until_complete(run_forever())
    except asyncio.CancelledError:
        pass
    finally:
        loop.close()
        log.info("Bye")


if __name__ == "__main__":
    main()
