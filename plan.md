# AntPro recreation plan

## Outcome
Create a responsive, demo-only web app that closely recreates the supplied 384×848 AntPro mobile screen recording. The app mirrors the observed visual hierarchy, branded chrome, screens, labels, tables, cards, and navigation, but intentionally contains no real-money transactions, payment processing, deposits, withdrawals, or financial actions.

## Architecture
- Static browser-rendered SPA served from the project root with `index.html`, `styles.css`, and `app.js`.
- No backend, database, credentials, or payment integration; all state is local demo state.
- App routes are represented as view states within one SPA and declared in `public/manus-routes.json`.
- The preview listens on port 3000 using a small Node static server.

## UI structure
- Fixed mobile-first shell with the olive/brown AntPro header, compact user/chips strip, central content surface, and a browser-like bottom bar echoing the recording.
- Dashboard view with the 2-column circular icon grid.
- Rules view with English/Hindi tabs and dense sectioned copy.
- In-play list and match-detail views with match rows, score strip, bookmaker table, and collapsible demo sections.
- Casino lobby and black Andar Bahar demo view.
- Ledger, personal information, and change-password views.
- Side menu overlay and login overlay/state.

## Visual direction
The recording itself is the ground truth. Use AntPro's muted gold/olive/brown chrome, pale gray content background, saturated red/green/blue icon disks, compact all-caps labels, thin separators, and dense legacy mobile portal typography. Avoid new gradients or decorative elements not visible in the reference.

## Verification
Run the static server, request `/` and `/manus-routes.json`, verify syntax by loading the app in a browser-capable runtime if available, and use static inspection plus HTTP checks. Save the working version to the managed Git checkpoint.
