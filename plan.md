# AntPro full reference-parity rebuild plan

## Outcome
Rebuild the supplied AntPro mobile portal as a responsive, demo-only web app using both Drive recordings as the visual and interaction source of truth. Target a 384–430px mobile shell with the same brown/gold chrome, dense legacy portal typography, tables, drawers, modals, and role-specific flows. **No payments, deposits/withdrawals as real financial actions, real-money wagering, production OTP, or third-party credential collection.** All stakes, balances, settlements, and controller operations are virtual demo coins with visible demo labeling in copy.

## Audited reference scope
- Player/client: login, first-login duplicate-site warning, home icon grid, drawer menu, rules Hindi/English tabs, in-play list, match scorecard, bookmaker rows, session/fancy rows, match/fancy history panels, completed-fancy strip, casino lobby with virtual/live sections, Andar Bahar game surface, result ribbon, game history, my-ledger table, personal information, password update form.
- Agent: separate login with User ID, password, and local demo OTP; dashboard action grid; member summary cards; menu tree; client-details table; blue action menu with Deposit/Withdraw/InActive/Block Betting/Block Casino/Edit/Statement/Account Operations/Login Report/Reset Password; profit-loss date/type filters; my ledger; client Lena/Dena settlement tables; cash transactions; commission/report views.
- Master: separate login/dashboard; hierarchy selector modal for Super Master/Agent Master/Client Master; super and agent detail tables; client details with pagination; create/assign flows; reports; user exposure modal with match, selection, stake, rate, type, time, loss, profit columns.
- Super Master/controller: top-level hierarchy summary and role-gated demo controller route for virtual round state, demo game visibility, marquee, and live-bet inspection.

## Architecture
- Keep the existing static browser-rendered SPA in `index.html`, `styles.css`, and `app.js`.
- Keep the small Node server in `server.mjs` for static serving, demo user persistence, virtual rounds, marquee, and provider-backed cricket read-only feed.
- Use `public/manus-routes.json` for every user-facing route; no hidden route is treated as a security boundary.
- Keep local/session storage for demo state; never expose or store real credentials or payment data.
- Cricket scores remain read-only provider data. If a provider gives no score, render a pending marker rather than inventing a score. Demo session lines are explicitly synthetic/demo-only.

## Design system
- **Design movement:** dense legacy mobile bookmaker/admin portal, tuned to the recordings rather than a modern dashboard aesthetic.
- **Core principles:** compact information density, brown/gold chrome, strong blue/red/green status coding, role-specific hierarchy, and predictable tap targets.
- **Color philosophy:** chocolate/olive/gold frame the brand; pale gray keeps dense tables legible; blue means actionable/back odds, red/pink means lay/suspended, green means active/receivable.
- **Layout paradigm:** one narrow vertical application shell with stacked sections, horizontal-scroll tables, full-width gold section bars, and drawers/modals over the shell.
- **Signature elements:** antpro wordmark header, scrolling JAI SHREE SHYAM strip, gold section bars with blue action buttons.
- **Interaction philosophy:** every screen exposes a clear back/menu action; modals are explicit and reversible; role permissions gate staff views; all demo mutations are auditable in tables/toasts.
- **Animation:** restrained marquee and game spinner only; no decorative motion beyond what the recordings show.
- **Typography:** Arial/Helvetica-like compact sans-serif; 9–13px dense portal labels, 16–22px identity/score emphasis.
- **Brand essence:** a faithful mobile demo shell for inspecting client-to-hierarchy sports/casino portal flows; compact, role-aware, and safe to test.
- **Brand voice:** terse portal copy such as “Live scores + sessions via demo feed” and “Demo coins only — no cash value.”
- **Wordmark:** reuse the supplied antpro artwork and logo assets from the repository.
- **Signature brand color:** muted antpro gold `#9a8700` against chocolate brown.

## Project structure
- `index.html`: shell and metadata.
- `styles.css` / `refinement.css`: mobile layout, portal chrome, tables, drawers, modals, cards, and responsive behavior.
- `app.js`: role-aware routing, client/staff views, demo state, virtual game rounds, provider-backed cricket rendering, hierarchy actions, reports, and controller.
- `server.mjs`: static server and read-only/demo APIs.
- `assets/`: supplied reference logos, icons, and casino artwork.
- `data/`: demo users, marquee, and virtual round state.
- `public/manus-routes.json`: complete navigable route declaration.

## Implementation decisions
1. Preserve working reference-matched client/game components and improve missing copy, labels, history, and profile details.
2. Replace simplified staff hierarchy/report sections with recording-shaped tables, modal selectors, action menus, pagination, Lena/Dena settlement, profit-loss filters, and exposure detail.
3. Keep demo actions reversible and local; label virtual coins and demo OTP/controller state.
4. Do not add payment processors, cash settlement, real OTP delivery, credential harvesting, or unauthorized bookmaker scraping.

## Verification
Run syntax checks, route-manifest validation, local/public HTTP checks, provider fallback checks, and browser checks for player login/home/casino/game/ledger/password, agent login/client details/ledger/reports, master hierarchy/exposure, and controller route. Compare the rendered mobile layout against representative reference frames before delivery.
