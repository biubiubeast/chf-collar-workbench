# CHF workbench development

Independent private CHF project. Do not edit the parent gold-options application.

- Node >=22.13, pnpm 11.25.0. Install frozen lockfile. Run pnpm test, pnpm typecheck, pnpm build.
- Preserve the existing Sites project ID and private audience. Use Sites skills for synchronization and publishing; GitHub is the user-owned source repository.
- S is USD per CHF. Borrowing multiple means borrowed USD equivalent / equity; total funds multiple is 1 + borrowing multiple.
- resolveFunding owns leverage conversion. Legacy scenarios without loanSizing stay manual. Already drawn CHF loans should use manual mode.
- strategy owns interest, custom formulas, payoff and net assets. Summaries and exports must use the same results.
- cashflowLedger owns chronological export rows. Final USD must equal endEquity and final CHF must be zero in asset and loan modes, funding deficits, early/late expiries.
- Excel is a browser-generated scenario snapshot with typed values and balance formulas. Keep dynamic import to avoid loading ExcelJS on initial page render.
- Never invent live quotes, locked protection or bank terms. Preserve conditional expiry and basis warnings.
- Financing changes do not silently resize existing legs; explicit sync is intentional.
- Routes: /, /client, /formulas, /api-manager, /settings, /legacy, /api/spot, /api/market.
- Preserve the V2 DOCX manual. V3 behavior is documented in README.
- Exclude node_modules, dist, .env, .sites-runtime, .wrangler and outputs. Never persist source-write or GitHub tokens.
- Browser checks should cover financing changes, manual mode, persistence, download and responsive layout.

- V3.1: global-bounds owns piecewise and Black convex-envelope extrema, including analytic infinite tails. Never substitute chart min/max for global bounds.
- CME fixing is a future, not spot: use strategy.futureRatio/fixing. All early cash ledgers must use earlySettlement and the same path ratio as terminal valuation.
- Vanilla numerical bounds require standard payoff and live-option pricing; disable unsupported custom formulas rather than certifying them. Keep conditional labels, IV fallback source, error and convergence status visible.

- V3.2: expiry-cases owns persistent case schema and the shared case valuation for UI and case-workbook export. Opening costs stay constant across cases. Keep finite stress examples distinct from global limits.
- Case sheets must reconcile terminal cash to case equity and interim components to mark PnL; do not write interim marks as settled cash. Chart interaction updates only the selected case, and hover must not mutate saved data.

- V3.3: cme-calendar/cme-roll own the planned monthly CME replacement contract and cash budgets. Preserve trade direction, strike and actual rounded amount. Exact source calendar dates outrank rule estimates. Explicitly disclose unverified listing/holiday assumptions.
- Never double-settle old legs after rolling. holdingValue is the live position; legValue includes signed historical roll cash. Use holdingValue for balance sheets/forced liquidation, and legValue for lifecycle attribution. Global bounds fix roll inputs and include deterministic roll cash, financing, margin interest and exit costs.
- Roll tests must reconcile USD/CHF ledger balances, book, components, interim marks and Excel formulas. A one-year deposit is not silently liquidated to pay roll premiums.

- V3.4: client-comparison owns premium-budget sizing. Gross purchased premiums are default; net mode is explicit. Margin and fees are separate. Zero-debit, credit or no-purchased-premium structures use the single ATM Call amount as a disclosed comparison anchor, never an unlimited size. Cap aggregate per-side CHF at the selected repayment amount; zero budget means zero option hedges; the client bank forward always covers all repayment CHF independently of premium x.
- Mixed client combinations preserve total bought CHF = total sold CHF; equally split within each side. CME uses UNIT*lcm(side counts) bundles so rounding cannot break 1:1. Keep settlement/roll pricing in strategy, and display numerical bound error/convergence.
- ForwardTrade has signed economic value H*(S-K). cashflowLedger records physical delivery USD -sign*H*K and CHF +sign*H, then spot-converts only the residual CHF. Never also post economic payout in the same cash ledger. All initial fees, margin interest, marks, bounds, book and chronological ledger must reconcile. Forward fair-value marks do not become long-option collateral.
- /client has isolated browser state (chf-client-view-v1); loading workbench parameters is explicit after initial setup. Client charts/cases and custom combos do not rewrite workbench legs. Margin ratios are assumptions, not CME portfolio margin quotes.

- V3.5: forward owns 1Y Investing reference points conversion: source USDCHF is CHF per USD; buy CHF uses 1/(spotBid+pointsBid/10000), sell CHF uses Ask inverse. Keep quote date/timezone unknown when absent. Snapshot retrieval time is not quote date. Nonannual dates use disclosed parity fallback; manual RFQ must be available. Auto forward H=N changes with funding; existing option legs remain unchanged.
- Strategy forward margin is added once to base option margin. Explicit forwardInputs bypass configured auto forward. Client comparisons disable auto forward for option/bare alternatives. Show fees and margin separately. /api/forward must disclose blocked retrieval and preserve dated snapshot.

- V3.6: client-budget owns shared executed premium costs and explicit quantity/strike optimizers. Preserve per-side buy:sell 1:1, whole CME bundles and repayment cap for quantity max. Manual client amounts are fixed and over-budget drafts must be labeled, never silently resized or shown as feasible. Lock freezes x and budget mode, not editing strikes or quantities; serialize the lock in the isolated client state. OTC Call strike max can be unbounded: explain, do not fabricate a finite maximum. CME strike searches use only the matching expiry reference chain. Global strike adjustment fixes H and strike ratios, with an explicit 0.01–100x search range. Every custom combination compares the same x separately; it is not one aggregated portfolio.

- V3.7: workbench-budget shares per-leg executed prices, actual rounding and opening fees with strategy; budget is max(net premium + opening option fees, 0). Preserve disabled legs and each expiry/product. Quantity max uses full repayment cap, aggregate 1:1 and complete CME bundles; strike adjustment leaves quantities fixed. Never call the clientConfig coercion from workbench. Lock freezes the budget only, not manual inputs; label infeasible drafts.
- chart-range custom axes affect display only and stay fixed outside the selected case. Invalid ranges retain the last valid viewport. Never derive global bounds from chart extrema.
- Module IDs in module-catalog are stable. Preferences in chf-module-layout-v1 migrate unknown/duplicate entries safely and append new modules. Hidden modules stay mounted; do not discard their state or exclude hidden financial inputs from valuation/export. Maintain display zones and fixed navigation/error access.

- V3.8: outcome-analysis must use strategy.boundConstant/boundLinear/boundTerms, never reimplement financing or solve only within chart axes. Piecewise roots/flat PNL platforms are exact; signed live Black terms require interval isolation and explicit unresolved mass. Nonstandard pricing/payoff disables unsupported portfolio probabilities. A zero live-option asymptote is not a finite equality plateau.
- probability owns P/Q distributions and all terminal events. Continuous FX point mass is zero; PNL equality can have positive mass on platforms. Aggregate every disconnected outcome region. Q/d2 is a pricing probability, not observed frequency or Call delta. The 4.75% equity-only USD benchmark uses same actual-day horizon and an independent explicit simple/compound convention.
- chf-probability-v1 is shared by formulas and workbench, isolated from client financing state. No fake historical data. History cutoffs cannot exceed strategy start; match actual calendar horizons for empirical windows, use 252-day horizons for bootstrap, preserve sequence within geometric stationary blocks and disclose overlap/Monte Carlo precision. Official ECB fallback must retain dated provenance and explicitly label live retrieval failure. Do not treat snapshot retrieval time as FX quote date.
