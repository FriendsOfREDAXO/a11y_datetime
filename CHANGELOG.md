# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [5.2.3] - 2026-07-20

### Changed
- `minuteIncrement` nutzt jetzt standardmäßig `1` statt `5`.

### Fixed
- Minutenwerte werden jetzt auf den nächstliegenden gültigen Schritt normalisiert; bei Gleichstand wird auf den nächsten Schritt gerundet.
- Das Time-Wheel behält immer einen aktiven Minutenwert und fällt nie in einen leeren Auswahlzustand.
- Wheel-Controls sind jetzt robuster gegen globale Framework-Styles auf `button` und `input`, damit Host-CSS das Popover-Layout nicht vergrößert.

## [5.2.2] - 2026-07-20

### Fixed
- Wheel-Listen zentrieren beim Oeffnen und bei aktiver Synchronisierung jetzt alle Spalten konsistent.
- Monat/Jahr-Wheel: Jahrspalte scrollt nun wie die Monatsspalte auf den aktiven Wert.
- Zeit-Wheel: Minutenspalte scrollt nun wie die Stundenspalte auf den aktiven Wert.

## [5.2.1] - 2026-07-03

### Changed
- Website and demo color tuning aligned closer to the current live appearance.
- Theme preset control moved to the header area for faster access.
- Demo docs asset query versions updated for reliable cache invalidation.

### Fixed
- Calendar month header spacing adjusted to avoid visual overlap with weekday/day rows.

## [5.2.0] - 2026-07-02

### Added
- New `timeRules` option for weekday-based time windows, e.g. Monday-Friday `08:00-17:00` with optional alternative windows per weekday.
- New month/year wheel options: `monthYearWheel`, `yearRange`, and `yearWheelManualInput`.
- New option `showMonthNavArrows` (default `false`) to keep month arrows hidden by default and allow explicit re-enable.
- New keyboard help toggle in the calendar header with a compact shortcut overview.

### Changed
- Month/year wheel popover is now enabled by default to match the time-wheel interaction model.
- Range demo now supports 3 visible months (`showMonths: 3`) for faster check-in/check-out selection.
- In multi-month mode, month/year selection is anchored to the first visible month header; additional month headers are static.
- Month/year wheel columns now use subtle, accent-colored hover/focus scrollbars instead of forced wheel/touch gesture hijacking.

### Fixed
- Time-only keyboard navigation no longer escapes the picker after the Done button; Tab and Shift+Tab now stay in a stable cycle.
- Time and month/year popovers now keep keyboard focus inside the dialog while open (Tab/Shift+Tab cycle). Close with Done, Enter, or Escape.
- Time wheel labels are now locale-driven instead of hardcoded, including German translations for "Zeit" and "Fertig" plus matching ARIA labels.
- Time wheel now marks unavailable times as disabled and visibly non-selectable when limited by `minTime`/`maxTime`/`timeRules`.
- Demo theme contrast improved for header month/year/navigation readability.
- Month/year wheel keyboard control fixed: arrow navigation now works reliably for both month and year values (up/down), with left/right column switch preserved.
- Popover key handling is now isolated from global day-grid navigation, preventing focus jumps from wheel columns back into the calendar grid.

## [5.1.5] - 2026-07-01

### Changed
- Default interaction changed: focusing the input (for example via Tab) no longer opens the calendar automatically.
- Added option `focusOpens` (default `false`) to opt in to the previous focus-to-open behavior when needed.
- Added `.github/dependabot.yml` with a temporary ignore list for problematic transitive advisories (`form-data`, `postcss`, `uuid`, `js-yaml`) to prevent repeated failing update runs until the dependency chain is modernized.
- Time selection now always renders as an accessible wheel-style popover (including desktop) with clear selected states.
- When `enableTime` is active, the custom picker is used on mobile too (native mobile input is bypassed) so the same time popover interaction is available everywhere.

### Fixed
- Mobile date and datetime selection no longer forces input focus before opening the native picker, preventing the on-screen keyboard from appearing unnecessarily.
- Time-only mobile inputs (`enableTime=true` and `noCalendar=true`) keep focus behavior so direct time entry still works.
- In datetime mode, clicking/tapping a calendar day no longer auto-focuses the time field; this avoids repeatedly re-activating time input while selecting another date.

## [5.1.3] - 2026-05-22

### Fixed
- Month header sizing on small screens improved so the month name stays visible and month/year remain aligned.
- Native month select layout keeps the calendar header consistent on narrow viewports.

### Changed
- Continued refinement of the month control toward standard browser-like interaction and responsive behavior.

## [5.1.2] - 2026-05-22

### Changed
- Month picker now uses a native month `<select>` for a familiar, standard interaction model with keyboard, mouse, and browser type-ahead behavior.

### Fixed
- Month dropdown reliability improved: no clipping/stacking overlap in the calendar header area.
- Month control behavior stabilized: month selection no longer closes unexpectedly on toggle interaction.
- Month selection state now stays synchronized with the displayed month when navigating.
- Demo dark-mode contrast improved for cards, inputs, summary labels, and code/theme chips.
- Full demo background controls aligned with website approach by removing the custom "background atmosphere" selector.
- Added and validated week-select examples in both full demo and website demo.

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
