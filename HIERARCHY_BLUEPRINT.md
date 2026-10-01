# AntPro Hierarchy Rebuild Blueprint

**Source:** `Main hietrechyy.mp4` from the connected Google Drive, 4m40s, vertical 384×864 reference recording.

> This blueprint records visible product behavior and UI patterns from the reference. It is an implementation specification for the AntPro demo app; visual references do not authorize copying credentials or introducing real-money payment processing.

## 1. Product structure

The app has four distinct experiences:

1. **Client / Player** — betting-facing mobile portal.
2. **Agent** — player management, balances, ledger, settlement, and reports.
3. **Master** — agent/client hierarchy, exposure, game reports, ledger, and commissions.
4. **Super Master** — top hierarchy control over masters, agents, clients, and platform settings.

The visual system is shared, but the login and dashboard information architecture must be role-specific.

## 2. Shared visual system

- **Viewport:** Mobile-first vertical layout, centered inside a 384–430px app shell; wide tables scroll horizontally.
- **Primary brown:** `#5D4037` / dark chocolate-brown.
- **Gold:** `#FFD54F` for accents and highlight values.
- **Header:** compact olive/brown bar with brand mark, user identity, chips/exposure, hamburger menu.
- **Typography:** compact Arial-like sans-serif, dense 10–13px portal UI, uppercase section labels.
- **Cards:** rounded brown/gold action cards, thin separators, pale gray content background.
- **Icons:** circular colored menu icons for client; white/gold line icons on brown cards for back-office roles.
- **Tables:** dense rows, horizontal scroll on mobile, blue action buttons, green/red financial status colors.
- **Modals:** white or pale panels over a dim backdrop; brown/gold headings; explicit Close/Back action.
- **Status colors:** blue for actionable/in-play, pink/red for lay or suspended, green for receivable/active, red for payable/blocked.
- **No visual noise:** preserve the legacy betting-portal density; do not add modern gradients or unrelated decorative UI.

## 3. Client / Player experience

### 3.1 Login

- Brown-to-gold gradient background.
- Centered crisp `antpro` mark.
- White Username and Password fields.
- Brown/black Login button with right-arrow.
- Footer links: **Privacy Policy**, **Terms & Condition**, **Rules & Regulation**.
- On first successful login, show a mandatory **Welcome to antpro999** security/disclaimer modal with Hindi and English duplicate-site warning and Close/Cancel action.

### 3.2 Client home

Header shows:

- Client code and/or display name.
- **Chips** balance.
- **Exposure** balance.
- Hamburger menu.

Two-column circular icon grid:

- In Play
- Games
- Matka
- Aviator
- Statement
- Rules
- My Ledger
- Change Password

Sidebar items:

- Home
- Change Password
- In Play
- Matka
- Rules
- Ledger
- Casino Games
- Logout

### 3.3 Client cricket

Match detail must show:

- Teams, current score, overs, match state.
- Bookmaker table with **LAGAI**, **KHAI**, and **POS** columns.
- Blue back odds and pink/red lay odds.
- Session rows such as **6 OVER RUN**, **10 OVER RUN**, **15 OVER RUN**, **20 OVER RUN**, and innings totals.
- Session columns **NOT** and **YES**.
- Status labels: **Ball Running**, **SUSPENDED**, or appropriate provider status.
- Refresh/update state must be explicit; never show fabricated numeric score when the provider has no number.

### 3.4 Client casino

Sections:

- **Virtual Casino**
- **Live Casino**

Two-column square card grid including the visible reference games:

- Dus Ka Dum
- Roulette
- Andar Bahar
- Teen Patti / T20 Teen Patti
- Lucky 7
- Dragon Tiger
- Amar Akbar Anthony
- One Day Teen Patti

### 3.5 Client records

- Statement: bets and transactions.
- My Ledger: personal credit/debit/balance.
- Rules: English/Hindi tabs and dense betting rules.
- Change Password: validated form with success/error modal.

## 4. Agent experience

### 4.1 Agent login

Separate role login screen with:

- User ID
- Password
- 6-digit OTP
- **Verify OTP** button

For the demo build, OTP is a local deterministic demo challenge; never send or store a real OTP.

### 4.2 Agent dashboard

Header/status:

- Bookie status (`Bk` in reference)
- Agent code
- Chips balance

Large brown rounded action cards:

- Agent
- Sports Details
- Ledger
- Cash Transaction
- Setting
- Logout

Statistics cards:

- `{agentId} — You are Agent`
- Chips
- Members
- My Share
- Company Share
- Match Commission
- Session Commission

### 4.3 Agent navigation

Tree-style sidebar:

- Dashboard
- Agent Detail
- Sports-Betting
  - Casino
  - Matka
- Ledger
- Cash Transaction
- Comm. Report
- Reports
  - ANTPRO999 Setting
  - Dead Agent Master
- Logout

### 4.4 Agent client management

Client Details table columns:

- Code
- Name
- Agent
- Contact
- D.O.J
- Share%
- PWD
- Exposure
- Commission %
- C.Chips
- Status

Actions menu per client:

- Deposit
- Withdraw
- InActive
- Block Betting
- Block Casino
- Edit
- Statement
- Account Operations
- Login Report
- Reset Password

All actions are demo/local-state operations in this build and must be auditable in the UI.

### 4.5 Agent ledger and settlement

- **My Ledger:** Date, Event Name, Credit, Debit, Balance.
- **Client Ledger:** two tabs/sections:
  - **Lena** / receivable, green.
  - **Dena** / payable, red.
- User rows show username and balance.
- Blue **Settlement** button per row.
- Cash Transaction view with transaction list and account filters.

## 5. Master experience

### 5.1 Master dashboard

Same back-office card language as Agent, but with master identity and values:

- `{masterId} — You are Master`
- Chips
- Members
- My Share
- Company Share
- Match Commission
- Session Commission

### 5.2 Master hierarchy views

Selection modal/layer switcher:

- Super Master
- Agent Master
- Client Master

Reference tables:

- **Super Details:** super code/name, associated master, PWD, share, commission, chips, status.
- **Agent Details:** agent code/name, associated super/master, PWD, share, commission, chips, status.
- **Client Details:** client management table with the same drill-down actions as Agent where permitted.

### 5.3 Master sports and reports

- Active Matches list: S/N, Name, Open Date, Inplay button, Details.
- Game Reports modal:
  - Active Games
  - Finished Games
- User Exposure modal showing:
  - Match name
  - Selection Name
  - Stake
  - Rate/Odds
  - Type (`KHAI` / Lay or `LAGAI` / Back)
  - Timestamp
  - Loss
  - Profit

### 5.4 Master ledger and commission

- Hierarchy selector for Super / Agent / Client ledger.
- My Ledger, client ledger, commission report, P&L report, bet history.
- Exposure and settlement drill-downs must preserve the selected hierarchy scope.

## 6. Super Master experience

The reference does not show a complete dedicated Super Master screen, but the hierarchy confirms the role is above Master. Implement a dedicated version using the same back-office shell:

- Dashboard stats and platform totals.
- Master Details table.
- Agent Details and Client Details drill-down.
- Create/Edit/Block/Reset actions for Masters.
- Hierarchy selector: Master → Agent → Client.
- Platform settings, reports, commission configuration, and audit history.

## 7. Permission model

| Capability | Client | Agent | Master | Super Master |
|---|---:|---:|---:|---:|
| View own dashboard | Yes | Yes | Yes | Yes |
| View client bets | Own | Assigned clients | Downline | All |
| Manage clients | No | Assigned clients | Downline clients | All |
| Manage agents | No | No | Assigned agents | All |
| Manage masters | No | No | No | Yes |
| View exposure | Own | Assigned clients | Downline | All |
| View ledger | Own | Own + clients | Own + hierarchy | All |
| Commission report | No | Own | Hierarchy | Platform |
| Block betting/casino | No | Assigned clients | Downline | All |
| Reset password | Self | Assigned clients | Downline | All |
| Platform settings | No | No | Limited | Yes |

## 8. Implementation order

1. Preserve the current client betting shell and replace its stale/placeholder cricket source behavior.
2. Split login routing into Client, Agent, Master, and Super Master role flows.
3. Rebuild back-office dashboard cards and responsive tables from the reference.
4. Add hierarchy selectors and scoped data views.
5. Add modal-driven client/agent/master actions.
6. Add live cricket score/bookmaker/session states with provider availability messaging.
7. Replace raster branding with crisp vector assets and normalize card/icon graphics.
8. Add role-wise smoke tests and deploy only after all four role flows render without errors.

## 9. Acceptance checklist

- No role can see a dashboard or action outside its permission scope.
- Client login never lands in Agent/Master UI.
- Agent, Master, and Super Master each have separate login/dashboard navigation.
- Every reference table is horizontally usable on a 384px viewport.
- Modals have close/back behavior and do not trap navigation.
- Live cricket clearly distinguishes numeric score, innings status, suspended sessions, and unavailable provider data.
- No fake real-money payment, external payout, or production OTP is introduced.
- All visible assets are crisp at mobile scale.
- `node --check app.js`, `node --check server.mjs`, and live HTTP/browser smoke tests pass.
