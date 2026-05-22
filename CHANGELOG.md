# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- No changes yet.

## [5.1.1] - 2026-05-22

### Fixed
- Keyboard navigation: forward Tab from the day grid now moves focus to time controls (hour/minute/second or AM/PM) and no longer loops back to month navigation.

## [5.1.0] - 2026-05-22

### Added
- New optional UI options:
  - `showTitleBar` (default `true`)
  - `showCloseButton` (default `true`)
  - `initialDayFocus` with values `today`, `selected`, `firstAvailable` (default `today`)
- Demo now includes an optional-feature playground to toggle these options live.
- Additional demo scenarios: min/max + disabled weekends, alt input format, week numbers with precise time, and inline mode.
- New manual GitHub release workflow: `.github/workflows/release-manual.yml` (workflow_dispatch) that builds and publishes `dist.zip` as a release asset.

### Changed
- Demo redesign expanded with richer, accessibility-oriented sections, live design controls, and setup-code snippets.
- Design presets are now mode-aware (light/dark/system) and re-apply on theme changes.
- README rewritten and standardized in English, including fork transparency, API compatibility, extras usage, style system details, and repository link.
- Build toolchain modernized from Rollup-based scripting to an esbuild-based pipeline for faster and more robust bundling.
- New optional Vite-based local development server (`npm run dev`) for modern preview workflows.

### Fixed
- Keyboard flow improved: Tab from focused input can move focus into calendar day grid.
- Focus visibility improved with stronger `:focus-visible` styles for day cells and month/year/time controls.
- Focus ring behavior now remains reliable after mouse interactions via keyboard-navigation state handling.
- Month navigation styling edge case fixed when `showTitleBar=false` and `showCloseButton=false`.
- Disabled/not-allowed day contrast improved in dark mode and presets.
- Week-number header/column alignment fixed for week-number calendars.
- ARIA wiring improvements:
  - dialog now always has an accessible name (`aria-label`)
  - month toggle and month listbox are linked via `aria-controls` / `aria-labelledby`
  - month listbox `aria-hidden` now stays synchronized with open/close state
- Release workflow compatibility improved for current GitHub Actions runtime changes (Node 24 JavaScript action runtime).
- Build and typecheck compatibility fixed for newer TypeScript tooling (`unknown` catch typing, legacy navigator touch-point typing, and Babel type resolution issues).
- Fixed global export collision in browser bundles so `window.a11y_datetime` and demo picker initialization remain callable functions.

## [5.0.0] - 2026-05-22

### Added
- Rebrand to `a11y_datetime` while keeping explicit attribution to flatpickr.
- New primary UMD bundle name and global alias: `a11y_datetime`.
- Backward-compatible aliases retained:
  - global `flatpickr`
  - `dist/flatpickr.js` and `dist/flatpickr.css`
- Improved accessibility primitives:
  - calendar container now exposes dialog semantics
  - date cells expose gridcell semantics and selection state
  - weekday headers expose columnheader semantics with full weekday labels
  - month navigation controls support Enter/Space keyboard activation
  - screen reader live-region announcements for month/date changes
  - synchronized `aria-expanded` and `aria-hidden` on open/close
- New option: `announceChanges` (default `true`).
- Reduced-motion-aware animation default via `prefers-reduced-motion` detection.
- CSS-variable-driven theming foundation (`--a11y-dt-*`).
- Light/dark/system mode variables and reduced-motion stylesheet behavior.
- Modernized demo template with theme and motion controls.
- Build now always generates `dist/demo/index.html`.
- Demo now includes two custom style presets: `high-contrast` and `ocean`.

### Changed
- Rollup output renamed to `dist/a11y_datetime.js`.
- Main style output renamed to `dist/a11y_datetime.css`.
- Package metadata updated to `a11y_datetime`.
- README rewritten to document differences vs flatpickr and migration path.
- Built-in theme distribution reduced to three themes: `light`, `dark`, `grid`.
- Removed brand-named built-in theme (`airbnb`) and replaced it with `grid`.
- Keyboard accessibility improvements for selecting dates from input and focusing month/year controls.

### Notes
- This release is intentionally transparent about project origin and remains MIT licensed.
- Existing integrations using `flatpickr` continue to work through aliases.
