# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- New optional UI options:
  - `showTitleBar` (default `true`)
  - `showCloseButton` (default `true`)
  - `initialDayFocus` with values `today`, `selected`, `firstAvailable` (default `today`)
- Demo now includes an optional-feature playground to toggle these options live.

### Changed
- Demo redesign expanded with richer, accessibility-oriented sections, live design controls, and setup-code snippets.

### Fixed
- Keyboard flow improved: Tab from focused input can move focus into calendar day grid.
- Focus visibility improved with stronger `:focus-visible` styles for day cells and month/year/time controls.

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
