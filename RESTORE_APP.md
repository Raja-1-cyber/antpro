# URGENT: Restore app.js

A bad deploy overwrote `app.js`. Restore from the last good commit:

```bash
git fetch origin
git checkout 1adf0f39e922fe2934b1e50115447696bd6b5e0a -- app.js
git add app.js
git commit -m "restore app.js from good commit"
git push origin main
```

Or on GitHub web:
1. Open https://github.com/Raja-1-cyber/antpro/commits/main
2. Open commit `1adf0f39` (scraper India priority)
3. Browse files → app.js → three dots → View file
4. Copy full content
5. Paste into current app.js on main and commit

After restore, hard-refresh the site (Ctrl+Shift+R).
