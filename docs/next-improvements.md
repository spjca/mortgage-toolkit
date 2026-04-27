# Next improvement opportunities

1. Add end-to-end browser tests (Playwright/Cypress) for key user flows (affordability recalc, toggling loan mode, share link restore).
2. Add input validation + inline error messaging for impossible values (negative rates, down payment greater than price, term <= 0).
3. Replace `alert()` usage with non-blocking toast notifications for save/load/share feedback.
4. Improve tax modeling by adding filing status presets and deductions assumptions, plus clear disclosure text near the toggle.
5. Persist app state in URL query params for easier sharing and deterministic reproduction (instead of localStorage-only dependency).
6. Add CI (GitHub Actions) to run `node --test` and a static-check step on every PR.
7. Add performance budgets and measure first render + interactive times before and after lazy loading.
8. Introduce TypeScript (or JSDoc typing) for `src/core.js` and `src/app.js` to reduce regression risk.
9. Add i18n-ready number/currency/date formatting abstraction instead of fixed locale assumptions.
10. Add a changelog and semantic versioning so release notes are clear as features evolve.
