# a11y_datetime

Repository: https://github.com/FriendsOfREDAXO/a11y_datetime

a11y_datetime is a fork of flatpickr focused on accessibility.

It keeps the proven flatpickr core, while adding stronger ARIA semantics, better keyboard behavior, and a token-based style system.

## Origin and Thanks

- This project is based on flatpickr.
- Original project: https://github.com/flatpickr/flatpickr
- License remains MIT.
- Backward-compatible aliases are still available (`flatpickr` global and dist aliases), while the primary API name is `a11y_datetime`.

Special thanks to the flatpickr maintainers and contributors for building and maintaining the original project this fork is based on.

## API Compatibility

This fork is largely API-compatible with flatpickr:

- Existing standard options and typical initializations continue to work.
- The global `flatpickr` alias is still supported.
- The new primary alias `a11y_datetime` is available.

Notes:

- The focus is improved accessibility and modern theming.
- Some UI details (for example header/month controls) were adjusted to improve usability.

## What Is New Compared to flatpickr

- Improved ARIA semantics for calendar dialog and date grid.
- Live region announcements for date/month changes (`announceChanges`, default `true`).
- Keyboard support for month navigation controls with Enter and Space.
- Better state synchronization via `aria-expanded` and `aria-hidden`.
- Motion-aware defaults: animations are disabled when `prefers-reduced-motion: reduce` is active.
- Styling exposed via CSS custom properties.
- Light, dark, and system color modes via CSS variables.
- Build now always generates a demo page at `dist/demo/index.html`.
- Additional optional UI features:
  - `showTitleBar` (default `true`)
  - `showCloseButton` (default `true`)
  - `initialDayFocus` (`"today" | "selected" | "firstAvailable"`, default `"today"`)

## Fork Extras and How to Use Them

### 1) Accessibility Extras

- `announceChanges` (default `true`): announces month/date changes through an aria-live region.
- Core ARIA states are improved and synchronized (`aria-expanded`, `aria-hidden`, `aria-selected`, dialog/grid semantics).

### 2) Optional UI Extras

- `calendarTitle`: sets a custom calendar title.
- `showTitleBar`: shows or hides the title bar.
- `showCloseButton`: shows or hides the close button.
- `initialDayFocus`: controls preferred first focus target in the day grid (`today`, `selected`, `firstAvailable`).

Example:

```js
(window.a11y_datetime || window.flatpickr)("#date", {
  dateFormat: "Y-m-d",
  calendarTitle: "Select a date",
  showTitleBar: true,
  showCloseButton: true,
  initialDayFocus: "today",
  announceChanges: true
});
```

## Quick Start

```bash
npm install
npm run build
```

After build:

- JS bundle: `dist/a11y_datetime.js`
- CSS bundle: `dist/a11y_datetime.css`
- Demo page: `dist/demo/index.html`
- Legacy aliases still available: `dist/flatpickr.js`, `dist/flatpickr.css`

## Usage

```html
<input id="date" />
<script src="dist/a11y_datetime.js"></script>
<script>
	(window.a11y_datetime || window.flatpickr)("#date", {
		enableTime: true,
		dateFormat: "Y-m-d H:i",
		announceChanges: true
	});
</script>
```

## Optional Features

```js
(window.a11y_datetime || window.flatpickr)("#date", {
	dateFormat: "Y-m-d",
	calendarTitle: "Optional feature demo",
	showTitleBar: true,
	showCloseButton: true,
	initialDayFocus: "today",
	announceChanges: true
});
```

Short meaning:

- `showTitleBar`: shows or hides the calendar title bar.
- `showCloseButton`: shows or hides the close button in the title bar.
- `initialDayFocus`: defines which date is preferred when tabbing into the day grid.

## Core CSS Variables

- `--a11y-dt-calendar-bg`
- `--a11y-dt-calendar-border`
- `--a11y-dt-month-bg`
- `--a11y-dt-month-fg`
- `--a11y-dt-day-fg`
- `--a11y-dt-day-disabled-fg`
- `--a11y-dt-day-not-allowed-fg`
- `--a11y-dt-day-hover-bg`
- `--a11y-dt-selected-bg`
- `--a11y-dt-selected-fg`
- `--a11y-dt-today-color`
- `--a11y-dt-transition-fast`

## Style System

The style system is token-based and fully configurable via CSS variables:

- Structure tokens: size, radius, heights (for example `--a11y-dt-radius`, `--a11y-dt-month-nav-height`).
- Color tokens: calendar surface, header, days, disabled/not-allowed states.
- Interaction tokens: focus ring, hover colors, transitions.

Recommended approach:

1. Load the base stylesheet (`dist/a11y_datetime.css`).
2. Define a theme scope (for example `[data-a11y-datetime-theme="dark"]`).
3. Override only the `--a11y-dt-*` tokens you need.

This lets you adapt branding, contrast requirements, and dark mode behavior without patching core code.

## Color Modes

The current setup focuses on three variable-driven color modes:

- `system` (via `prefers-color-scheme`)
- `light` (via `data-a11y-datetime-theme="light"`)
- `dark` (via `data-a11y-datetime-theme="dark"`)

## Create a Custom Theme in 3 Steps

1. Load the base CSS (`dist/a11y_datetime.css`).
2. Define a theme class or attribute scope.
3. Override the `--a11y-dt-*` variables you need.

Example:

```css
/* 1) Define a theme scope */
[data-a11y-datetime-theme="sunset"] {
  /* 2) Set color and contrast tokens */
  --a11y-dt-calendar-bg: #fff8ef;
  --a11y-dt-calendar-border: #f0c9a1;
  --a11y-dt-month-bg: #fff3e4;
  --a11y-dt-month-fg: #5b2d0a;
  --a11y-dt-weekdays-fg: #8b4b18;
  --a11y-dt-day-fg: #4a2d14;
  --a11y-dt-day-hover-bg: #ffe3c5;
  --a11y-dt-selected-bg: #e67817;
  --a11y-dt-selected-fg: #ffffff;
  --a11y-dt-today-color: #cc5e00;
}
```

Activate via JS:

```js
document.documentElement.setAttribute("data-a11y-datetime-theme", "sunset");
```

Accessibility tip: Always verify text and interactive contrast, especially for `--a11y-dt-day-fg`, `--a11y-dt-selected-bg`, and `--a11y-dt-selected-fg`.

### Accent Color: Simple Example

```css
:root {
	--a11y-dt-selected-bg: #e67817;
	--a11y-dt-today-color: #cc5e00;
}
```

Theme override example:

```css
:root {
	--a11y-dt-selected-bg: #0f6cff;
	--a11y-dt-calendar-bg: #ffffff;
}

[data-a11y-datetime-theme="dark"] {
	--a11y-dt-calendar-bg: #1f232a;
	--a11y-dt-day-fg: #e7ebf2;
}
```

## Development

- `npm run build`: production build + demo generation
- `npm run start`: dev mode with watch/livereload
- `npm run test`: type checks and unit tests
- Demo includes single/range/multiple/time-only examples, plus additional accessibility and styling examples.

## Changelog

See `CHANGELOG.md` for release notes and migration highlights.
