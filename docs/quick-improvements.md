# Quick improvement opportunities

1. Add real automated tests (not only the static smoke-test page) for core mortgage math functions such as payment calculation, affordability root-solve, PMI cutoff, and amortization edge cases.
2. Fix the first-year tax savings calculation to use the user-selected loan term and remove unused variables to prevent misleading output.
3. Improve accessibility and semantics by adding explicit `for`/`id` label bindings, live-region updates for KPI changes, and keyboard/focus styles.
4. Reduce initial page weight by loading only required vendor bundles and deferring chart/table libraries until their sections are needed.
5. Refactor `src/app.js` into smaller modules (affordability, amortization, persistence, chart rendering) to improve maintainability and allow unit testing.
