# Feed diagnostic snapshot — 2026-10-03

- Firebase source: `https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app/live_matches.json`
- Firebase metadata: `https://antpro-live-default-rtdb.asia-southeast1.firebasedatabase.app/meta/scraper.json`
- SportScore proxy source: `https://sportscore.com/api/widget/matches/?sport=cricket&limit=20`
- At audit time, Firebase reported 18 matches and a fresh `updated_at`; `Pakistan vs India` was **FINISHED** with `192/6 - 211/6`, while `India vs West Indies` was **LIVE** but the provider supplied no numeric score.
- The client must show provider data honestly and must not invent player/bowler/score fields when the provider does not supply them.
