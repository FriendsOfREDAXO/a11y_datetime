import { Instance, FlatpickrFn, DayElement } from "./types/instance";
import {
  Options,
  ParsedOptions,
  DateLimit,
  DateRangeLimit,
  DateOption,
  defaults as defaultOptions,
  Hook,
  HookKey,
  HOOKS,
  TimeRule,
} from "./types/options";

import { Locale, CustomLocale, key as LocaleKey } from "./types/locale";
import English from "./l10n/default";

import { arrayify, debounce, int, pad, IncrementEvent } from "./utils";
import {
  clearNode,
  createElement,
  createNumberInput,
  findParent,
  toggleClass,
  getEventTarget,
} from "./utils/dom";
import {
  compareDates,
  createDateParser,
  createDateFormatter,
  duration,
  isBetween,
  getDefaultHours,
  calculateSecondsSinceMidnight,
  parseSeconds,
} from "./utils/dates";

import { tokenRegex, monthToStr } from "./utils/formatting";

import "./utils/polyfills";

const DEBOUNCED_CHANGE_MS = 300;

function FlatpickrInstance(
  element: HTMLElement,
  instanceConfig?: Options
): Instance {
  const self = {
    config: {
      ...defaultOptions,
      ...flatpickr.defaultConfig,
    } as ParsedOptions,
    l10n: English,
  } as Instance;
  self.parseDate = createDateParser({ config: self.config, l10n: self.l10n });

  self._handlers = [];
  self.pluginElements = [];
  self.loadedPlugins = [];
  self._bind = bind;
  self._setHoursFromDate = setHoursFromDate;
  self._positionCalendar = positionCalendar;

  self.changeMonth = changeMonth;
  self.changeYear = changeYear;
  self.clear = clear;
  self.close = close;
  self.onMouseOver = onMouseOver;

  self._createElement = createElement;
  self.createDay = createDay;
  self.destroy = destroy;
  self.isEnabled = isEnabled;
  self.jumpToDate = jumpToDate;
  self.updateValue = updateValue;
  self.open = open;
  self.redraw = redraw;
  self.set = set;
  self.setDate = setDate;
  self.toggle = toggle;

  let liveRegion: HTMLDivElement | undefined;
  let timeWheelPopover: HTMLDivElement | undefined;
  let timeWheelTrigger: HTMLButtonElement | undefined;
  let timeWheelHourOptions: HTMLButtonElement[] = [];
  let timeWheelMinuteOptions: HTMLButtonElement[] = [];
  let timeWheelAmPmOptions: HTMLButtonElement[] = [];
  let monthYearWheelPopover: HTMLDivElement | undefined;
  let monthYearWheelTrigger: HTMLButtonElement | undefined;
  let monthWheelOptions: HTMLButtonElement[] = [];
  let yearWheelOptions: HTMLButtonElement[] = [];
  let monthYearWheelManualInput: HTMLInputElement | undefined;
  let monthScrollAnimationTimer: number | undefined;
  let keyboardHelpButton: HTMLButtonElement | undefined;
  let keyboardHelpPanel: HTMLDivElement | undefined;
  const calendarInstanceId = `a11y-dt-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  function announce(message: string) {
    if (!self.config.announceChanges || !liveRegion || !message || !self.isOpen)
      return;

    liveRegion.textContent = "";
    window.setTimeout(() => {
      if (liveRegion) {
        liveRegion.textContent = message;
      }
    }, 10);
  }

  function setupHelperFunctions() {
    self.utils = {
      getDaysInMonth(month = self.currentMonth, yr = self.currentYear) {
        if (month === 1 && ((yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0))
          return 29;

        return self.l10n.daysInMonth[month];
      },
    };
  }

  function init() {
    self.element = self.input = element as HTMLInputElement;
    self.isOpen = false;

    parseConfig();
    setupLocale();
    setupInputs();
    setupDates();
    setupHelperFunctions();

    if (!self.isMobile) build();

    bindEvents();

    if (self.selectedDates.length || self.config.noCalendar) {
      if (self.config.enableTime) {
        setHoursFromDate(
          self.config.noCalendar ? self.latestSelectedDateObj : undefined
        );
      }
      updateValue(false);
    }

    setCalendarWidth();

    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    /* TODO: investigate this further

      Currently, there is weird positioning behavior in safari causing pages
      to scroll up. https://github.com/chmln/flatpickr/issues/563

      However, most browsers are not Safari and positioning is expensive when used
      in scale. https://github.com/chmln/flatpickr/issues/1096
    */
    if (!self.isMobile && isSafari) {
      positionCalendar();
    }

    triggerEvent("onReady");
  }

  function getClosestActiveElement() {
    return (
      ((self.calendarContainer?.getRootNode() as unknown) as DocumentOrShadowRoot)
        .activeElement || document.activeElement
    );
  }

  function bindToInstance<F extends Function>(fn: F): F {
    return fn.bind(self);
  }

  function setCalendarWidth() {
    const config = self.config;

    if (config.weekNumbers === false && config.showMonths === 1) {
      return;
    } else if (config.noCalendar !== true) {
      window.requestAnimationFrame(function () {
        if (self.calendarContainer !== undefined) {
          self.calendarContainer.style.visibility = "hidden";
          self.calendarContainer.style.display = "block";
        }
        if (self.daysContainer !== undefined) {
          const daysWidth = (self.days.offsetWidth + 1) * config.showMonths;

          self.daysContainer.style.width = daysWidth + "px";

          self.calendarContainer.style.width =
            daysWidth +
            (self.weekWrapper !== undefined
              ? self.weekWrapper.offsetWidth
              : 0) +
            "px";

          self.calendarContainer.style.removeProperty("visibility");
          self.calendarContainer.style.removeProperty("display");
        }
      });
    }
  }

  /**
   * The handler for all events targeting the time inputs
   */
  function updateTime(
    e?: MouseEvent | IncrementEvent | KeyboardEvent | FocusEvent
  ) {
    if (self.selectedDates.length === 0) {
      const defaultDate =
        self.config.minDate === undefined ||
        compareDates(new Date(), self.config.minDate) >= 0
          ? new Date()
          : new Date(self.config.minDate.getTime());

      const defaults = getDefaultHours(self.config);
      defaultDate.setHours(
        defaults.hours,
        defaults.minutes,
        defaults.seconds,
        defaultDate.getMilliseconds()
      );

      self.selectedDates = [defaultDate];
      self.latestSelectedDateObj = defaultDate;
    }
    if (e !== undefined && e.type !== "blur") {
      timeWrapper(e);
    }

    const prevValue = self._input.value;

    setHoursFromInputs();
    updateValue();

    if (self._input.value !== prevValue) {
      self._debouncedChange();
    }
  }

  function ampm2military(hour: number, amPM: string) {
    return (hour % 12) + 12 * int(amPM === self.l10n.amPM[1]);
  }

  function military2ampm(hour: number) {
    switch (hour % 24) {
      case 0:
      case 12:
        return 12;

      default:
        return hour % 12;
    }
  }

  function getTimeInSeconds(date: Date) {
    return calculateSecondsSinceMidnight(
      date.getHours(),
      date.getMinutes(),
      date.getSeconds()
    );
  }

  function getMonthBoundsForYear(year: number) {
    let minMonth = 0;
    let maxMonth = 11;

    if (
      self.config.minDate !== undefined &&
      year === self.config.minDate.getFullYear()
    ) {
      minMonth = self.config.minDate.getMonth();
    }

    if (
      self.config.maxDate !== undefined &&
      year === self.config.maxDate.getFullYear()
    ) {
      maxMonth = self.config.maxDate.getMonth();
    }

    return { minMonth, maxMonth };
  }

  function getYearWheelRange() {
    const past = Math.max(0, Number(self.config.yearRange.past || 0));
    const future = Math.max(0, Number(self.config.yearRange.future || 0));
    let minYear = self.currentYear - past;
    let maxYear = self.currentYear + future;

    if (self.config.minDate) {
      minYear = Math.max(minYear, self.config.minDate.getFullYear());
    }

    if (self.config.maxDate) {
      maxYear = Math.min(maxYear, self.config.maxDate.getFullYear());
    }

    if (minYear > maxYear) {
      minYear = maxYear;
    }

    return { minYear, maxYear };
  }

  function parseTimeRuleValue(value: DateOption | undefined): Date | undefined {
    if (value === undefined) return undefined;
    if (value instanceof Date) return value;
    return (
      self.parseDate(value, "H:i:S") ||
      self.parseDate(value, "H:i") ||
      undefined
    );
  }

  function pickLaterTime(a?: Date, b?: Date): Date | undefined {
    if (!a) return b;
    if (!b) return a;
    return getTimeInSeconds(a) >= getTimeInSeconds(b) ? a : b;
  }

  function pickEarlierTime(a?: Date, b?: Date): Date | undefined {
    if (!a) return b;
    if (!b) return a;
    return getTimeInSeconds(a) <= getTimeInSeconds(b) ? a : b;
  }

  function getWeekdayTimeRuleBounds(selectedDate?: Date) {
    const rules = self.config.timeRules || [];
    const date =
      selectedDate ||
      self.latestSelectedDateObj ||
      self.selectedDates[self.selectedDates.length - 1] ||
      self.now;

    if (!(date instanceof Date) || rules.length === 0) {
      return {
        minTime: undefined as Date | undefined,
        maxTime: undefined as Date | undefined,
        hasRules: false,
        hasMatch: false,
      };
    }

    let minTime: Date | undefined;
    let maxTime: Date | undefined;
    let hasMatch = false;
    const weekday = date.getDay();

    rules.forEach((rule: TimeRule) => {
      if (!rule || !Array.isArray(rule.days) || rule.days.indexOf(weekday) === -1) {
        return;
      }

      hasMatch = true;

      const from = parseTimeRuleValue(rule.from);
      const to = parseTimeRuleValue(rule.to);

      if (!from || !to) {
        return;
      }

      minTime = pickLaterTime(minTime, from);
      maxTime = pickEarlierTime(maxTime, to);
    });

    return { minTime, maxTime, hasRules: true, hasMatch };
  }

  function getEffectiveTimeBounds(selectedDate?: Date) {
    const date =
      selectedDate ||
      self.latestSelectedDateObj ||
      self.selectedDates[self.selectedDates.length - 1];

    const dateMinTime =
      self.config.minDate &&
      self.minDateHasTime &&
      date &&
      compareDates(date, self.config.minDate, true) === 0
        ? (self.config.minDate as Date)
        : undefined;

    const dateMaxTime =
      self.config.maxDate &&
      self.maxDateHasTime &&
      date &&
      compareDates(date, self.config.maxDate, true) === 0
        ? (self.config.maxDate as Date)
        : undefined;

    const weekdayRuleBounds = getWeekdayTimeRuleBounds(date);

    const minTime = pickLaterTime(
      pickLaterTime(self.config.minTime, dateMinTime),
      weekdayRuleBounds.minTime
    );

    const maxTime = pickEarlierTime(
      pickEarlierTime(self.config.maxTime, dateMaxTime),
      weekdayRuleBounds.maxTime
    );

    return { minTime, maxTime };
  }

  function isTimeWithinBounds(hour: number, minute: number, second: number) {
    const bounds = getEffectiveTimeBounds();
    const weekdayRuleBounds = getWeekdayTimeRuleBounds();

    if (weekdayRuleBounds.hasRules && !weekdayRuleBounds.hasMatch) {
      return false;
    }

    const current = calculateSecondsSinceMidnight(hour, minute, second);

    if (bounds.minTime) {
      const minSeconds = getTimeInSeconds(bounds.minTime);
      if (current < minSeconds) return false;
    }

    if (bounds.maxTime) {
      const maxSeconds = getTimeInSeconds(bounds.maxTime);
      if (current > maxSeconds) return false;
    }

    return true;
  }

  function updateTimeWheelDisabledOptions() {
    if (!self.hourElement || !self.minuteElement) return;

    const currentMinute = parseInt(self.minuteElement.value, 10) || 0;
    const currentSecond = self.secondElement
      ? parseInt(self.secondElement.value, 10) || 0
      : 0;

    const activeMeridiem = self.amPM ? String(self.amPM.textContent || "") : "";

    const hourFromOption = (option: HTMLButtonElement) => {
      const value = parseInt(option.dataset.value || "0", 10) || 0;
      if (self.config.time_24hr || self.amPM === undefined) {
        return value;
      }
      return ampm2military(value, activeMeridiem || self.l10n.amPM[0]);
    };

    timeWheelHourOptions.forEach((option) => {
      const enabled = isTimeWithinBounds(
        hourFromOption(option),
        currentMinute,
        currentSecond
      );
      option.disabled = !enabled;
      option.classList.toggle("is-disabled", !enabled);
      option.setAttribute("aria-disabled", enabled ? "false" : "true");
    });

    const activeHour = parseInt(self.hourElement.value, 10) || 0;
    const currentHour =
      self.config.time_24hr || self.amPM === undefined
        ? activeHour
        : ampm2military(activeHour, activeMeridiem || self.l10n.amPM[0]);

    timeWheelMinuteOptions.forEach((option) => {
      const minute = parseInt(option.dataset.value || "0", 10) || 0;
      const enabled = isTimeWithinBounds(currentHour, minute, currentSecond);
      option.disabled = !enabled;
      option.classList.toggle("is-disabled", !enabled);
      option.setAttribute("aria-disabled", enabled ? "false" : "true");
    });

    timeWheelAmPmOptions.forEach((option) => {
      const meridiem = String(option.dataset.value || "");
      const hour = ampm2military(activeHour, meridiem || self.l10n.amPM[0]);
      const enabled = isTimeWithinBounds(hour, currentMinute, currentSecond);
      option.disabled = !enabled;
      option.classList.toggle("is-disabled", !enabled);
      option.setAttribute("aria-disabled", enabled ? "false" : "true");
    });
  }

  /**
   * Syncs the selected date object time with user's time input
   */
  function setHoursFromInputs() {
    if (self.hourElement === undefined || self.minuteElement === undefined)
      return;

    let hours = (parseInt(self.hourElement.value.slice(-2), 10) || 0) % 24,
      minutes = (parseInt(self.minuteElement.value, 10) || 0) % 60,
      seconds =
        self.secondElement !== undefined
          ? (parseInt(self.secondElement.value, 10) || 0) % 60
          : 0;

    if (self.amPM !== undefined) {
      hours = ampm2military(hours, self.amPM.textContent as string);
    }

    const effectiveBounds = getEffectiveTimeBounds();
    const effectiveMinTime = effectiveBounds.minTime;
    const effectiveMaxTime = effectiveBounds.maxTime;

    const limitMinHours = effectiveMinTime !== undefined;

    const limitMaxHours = effectiveMaxTime !== undefined;

    if (
      effectiveMaxTime !== undefined &&
      effectiveMinTime !== undefined &&
      getTimeInSeconds(effectiveMinTime) > getTimeInSeconds(effectiveMaxTime)
    ) {
      const minBound = calculateSecondsSinceMidnight(
        effectiveMinTime.getHours(),
        effectiveMinTime.getMinutes(),
        effectiveMinTime.getSeconds()
      );
      const maxBound = calculateSecondsSinceMidnight(
        effectiveMaxTime.getHours(),
        effectiveMaxTime.getMinutes(),
        effectiveMaxTime.getSeconds()
      );
      const currentTime = calculateSecondsSinceMidnight(
        hours,
        minutes,
        seconds
      );

      if (currentTime > maxBound && currentTime < minBound) {
        const result = parseSeconds(minBound);
        hours = result[0];
        minutes = result[1];
        seconds = result[2];
      }
    } else {
      if (limitMaxHours) {
        const maxTime = effectiveMaxTime as Date;
        hours = Math.min(hours, maxTime.getHours());
        if (hours === maxTime.getHours())
          minutes = Math.min(minutes, maxTime.getMinutes());

        if (minutes === maxTime.getMinutes())
          seconds = Math.min(seconds, maxTime.getSeconds());
      }

      if (limitMinHours) {
        const minTime = effectiveMinTime as Date;

        hours = Math.max(hours, minTime.getHours());
        if (hours === minTime.getHours() && minutes < minTime.getMinutes())
          minutes = minTime.getMinutes();

        if (minutes === minTime.getMinutes())
          seconds = Math.max(seconds, minTime.getSeconds());
      }
    }

    setHours(hours, minutes, seconds);
  }

  /**
   * Syncs time input values with a date
   */
  function setHoursFromDate(dateObj?: Date) {
    const date = dateObj || self.latestSelectedDateObj;

    if (date && date instanceof Date) {
      setHours(date.getHours(), date.getMinutes(), date.getSeconds());
    }
  }

  function markWheelSelection(
    options: HTMLButtonElement[],
    selectedValue: string
  ) {
    let hasSelected = false;

    options.forEach((option) => {
      const isSelected = option.dataset.value === selectedValue;
      hasSelected = hasSelected || isSelected;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-selected", isSelected ? "true" : "false");
      option.tabIndex = isSelected ? 0 : -1;
    });

    if (!hasSelected && options[0]) {
      options[0].tabIndex = 0;
    }
  }

  function centerWheelSelection(options: HTMLButtonElement[]) {
    const selected =
      options.find((option) => option.tabIndex === 0) ||
      options.find((option) => option.classList.contains("is-selected"));

    if (!selected) return;

    const column = selected.parentElement as HTMLElement | null;
    if (!column) return;

    const targetScrollTop =
      selected.offsetTop - (column.clientHeight - selected.offsetHeight) / 2;
    column.scrollTop = Math.max(0, targetScrollTop);
  }

  function syncTimeWheelPopover() {
    if (!timeWheelPopover || !self.hourElement || !self.minuteElement) return;

    const hourValue = String(parseInt(self.hourElement.value, 10));
    const minuteValue = String(parseInt(self.minuteElement.value, 10));

    markWheelSelection(timeWheelHourOptions, hourValue);
    markWheelSelection(timeWheelMinuteOptions, minuteValue);

    if (self.amPM !== undefined) {
      markWheelSelection(
        timeWheelAmPmOptions,
        String(self.amPM.textContent || "")
      );
    }

    updateTimeWheelDisabledOptions();

    if (timeWheelTrigger) {
      let label = `${pad(self.hourElement.value)}:${pad(self.minuteElement.value)}`;
      if (self.amPM !== undefined && self.amPM.textContent) {
        label += ` ${self.amPM.textContent}`;
      }
      timeWheelTrigger.textContent = label;
      timeWheelTrigger.setAttribute(
        "aria-label",
        `${self.l10n.selectedTimeAriaLabel}: ${label}`
      );
    }

    if (timeWheelPopover.classList.contains("is-open")) {
      centerWheelSelection(timeWheelHourOptions);
      centerWheelSelection(timeWheelMinuteOptions);
      centerWheelSelection(timeWheelAmPmOptions);
    }
  }

  function setTimeWheelPopoverOpen(open: boolean) {
    if (!timeWheelPopover) return;

    if (open) {
      timeWheelPopover.removeAttribute("hidden");
      timeWheelPopover.classList.add("is-open");
      if (timeWheelTrigger) {
        timeWheelTrigger.setAttribute("aria-expanded", "true");
      }
      window.requestAnimationFrame(() => {
        centerWheelSelection(timeWheelHourOptions);
        centerWheelSelection(timeWheelMinuteOptions);
        centerWheelSelection(timeWheelAmPmOptions);
      });
      const initialFocus =
        timeWheelHourOptions.find((option) => option.tabIndex === 0) ||
        timeWheelHourOptions[0];
      initialFocus?.focus();
      return;
    }

    timeWheelPopover.setAttribute("hidden", "hidden");
    timeWheelPopover.classList.remove("is-open");
    if (timeWheelTrigger) {
      timeWheelTrigger.setAttribute("aria-expanded", "false");
    }
  }

  function getTimeWheelFocusTarget() {
    return (
      timeWheelHourOptions.find((option) => option.tabIndex === 0) ||
      timeWheelHourOptions[0] ||
      timeWheelMinuteOptions.find((option) => option.tabIndex === 0) ||
      timeWheelMinuteOptions[0] ||
      timeWheelAmPmOptions.find((option) => option.tabIndex === 0) ||
      timeWheelAmPmOptions[0] ||
      self.hourElement
    );
  }

  function getPopoverFocusableElements(popover: HTMLElement) {
    return Array.from(
      popover.querySelectorAll(
        "button, input, select, textarea, a[href], [tabindex]"
      )
    ).filter((element) => {
      const el = element as HTMLElement;
      if (el.tabIndex < 0) return false;
      if ((el as HTMLButtonElement).disabled === true) return false;
      return el.closest("[hidden]") === null;
    }) as HTMLElement[];
  }

  function cyclePopoverFocus(
    popover: HTMLElement,
    current: HTMLElement,
    shift: boolean
  ) {
    const focusables = getPopoverFocusableElements(popover);
    if (!focusables.length) return;

    const index = focusables.indexOf(current);
    if (index === -1) {
      focusables[0].focus();
      return;
    }

    const next = shift
      ? focusables[index - 1] || focusables[focusables.length - 1]
      : focusables[index + 1] || focusables[0];

    next.focus();
  }

  function buildTimeWheelPopover() {
    const popover = createElement<HTMLDivElement>(
      "div",
      "flatpickr-time-wheel-popover"
    );
    popover.id = `${calendarInstanceId}-time-wheel-popover`;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-modal", "false");
    popover.setAttribute("aria-label", self.l10n.timePickerAriaLabel);
    popover.setAttribute("hidden", "hidden");

    const wheelContent = createElement<HTMLDivElement>(
      "div",
      "flatpickr-time-wheel-content"
    );

    const buildColumn = (
      className: string,
      label: string,
      values: string[],
      onSelect: (value: string) => void
    ) => {
      const column = createElement<HTMLDivElement>("div", className);
      column.setAttribute("role", "listbox");
      column.setAttribute("aria-label", label);

      values.forEach((value) => {
        const button = createElement<HTMLButtonElement>(
          "button",
          "flatpickr-time-wheel-option",
          pad(value)
        );
        button.type = "button";
        button.dataset.value = String(parseInt(value, 10));
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", "false");
        button.setAttribute("aria-label", `${label}: ${pad(value)}`);
        button.tabIndex = -1;
        bind(button, "click", () => {
          if (button.disabled) return;
          onSelect(value);
        });
        bind(button, "keydown", (event: KeyboardEvent) => {
          if (button.disabled && event.key !== "Tab") {
            return;
          }
          const options = Array.from(
            column.querySelectorAll(".flatpickr-time-wheel-option")
          ) as HTMLButtonElement[];
          const currentIndex = options.indexOf(button);

          if (event.key === "Tab" || event.keyCode === 9) {
            event.preventDefault();
            cyclePopoverFocus(popover, button, event.shiftKey);
            return;
          }

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const delta = event.key === "ArrowDown" ? 1 : -1;
            const nextIndex = Math.max(
              0,
              Math.min(options.length - 1, currentIndex + delta)
            );
            const nextButton = options[nextIndex];
            if (!nextButton) return;
            nextButton.focus();
            nextButton.click();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setTimeWheelPopoverOpen(false);
            timeWheelTrigger?.focus();
          }
        });
        column.appendChild(button);
      });

      return {
        column,
        options: Array.from(
          column.querySelectorAll(".flatpickr-time-wheel-option")
        ) as HTMLButtonElement[],
      };
    };

    const hourValues: string[] = self.config.time_24hr
      ? Array.from({ length: 24 }, (_, i) => String(i))
      : Array.from({ length: 12 }, (_, i) => String(i + 1));

    const minuteStep = Math.max(1, self.config.minuteIncrement);
    const minuteValues = Array.from(
      { length: Math.ceil(60 / minuteStep) },
      (_, i) => String(Math.min(i * minuteStep, 59))
    );

    const hourColumn = buildColumn(
      "flatpickr-time-wheel-column flatpickr-time-wheel-hours",
      self.l10n.hourAriaLabel,
      hourValues,
      (value) => {
        if (!self.hourElement) return;
        self.hourElement.value = pad(value);
        updateTime();
        syncTimeWheelPopover();
      }
    );
    timeWheelHourOptions = hourColumn.options;
    wheelContent.appendChild(hourColumn.column);

    const minuteColumn = buildColumn(
      "flatpickr-time-wheel-column flatpickr-time-wheel-minutes",
      self.l10n.minuteAriaLabel,
      minuteValues,
      (value) => {
        if (!self.minuteElement) return;
        self.minuteElement.value = pad(value);
        updateTime();
        syncTimeWheelPopover();
      }
    );
    timeWheelMinuteOptions = minuteColumn.options;
    wheelContent.appendChild(minuteColumn.column);

    if (!self.config.time_24hr && self.amPM !== undefined) {
      const amPmValues = [self.l10n.amPM[0], self.l10n.amPM[1]];
      const amPmColumn = createElement<HTMLDivElement>(
        "div",
        "flatpickr-time-wheel-column flatpickr-time-wheel-ampm"
      );
      amPmColumn.setAttribute("role", "listbox");
      amPmColumn.setAttribute("aria-label", "AM/PM");

      amPmValues.forEach((value) => {
        const button = createElement<HTMLButtonElement>(
          "button",
          "flatpickr-time-wheel-option",
          value
        );
        button.type = "button";
        button.dataset.value = value;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", "false");
        button.setAttribute("aria-label", `AM/PM: ${value}`);
        button.tabIndex = -1;
        bind(button, "click", () => {
          if (button.disabled) return;
          if (!self.amPM) return;
          self.amPM.textContent = value;
          updateTime();
          syncTimeWheelPopover();
        });
        amPmColumn.appendChild(button);
      });

      timeWheelAmPmOptions = Array.from(
        amPmColumn.querySelectorAll(".flatpickr-time-wheel-option")
      ) as HTMLButtonElement[];
      wheelContent.appendChild(amPmColumn);
    } else {
      timeWheelAmPmOptions = [];
    }

    popover.appendChild(wheelContent);

    const footer = createElement<HTMLDivElement>(
      "div",
      "flatpickr-time-wheel-footer"
    );
    const doneButton = createElement<HTMLButtonElement>(
      "button",
      "flatpickr-time-wheel-done",
      self.l10n.doneButtonLabel
    );
    doneButton.type = "button";
    doneButton.tabIndex = 0;
    doneButton.setAttribute("aria-label", self.l10n.closeTimePickerAriaLabel);
    bind(popover, "keydown", (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.keyCode === 9) {
        const target = getEventTarget(event) as HTMLElement;
        if (!popover.contains(target)) return;
        event.preventDefault();
        cyclePopoverFocus(popover, target, event.shiftKey);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setTimeWheelPopoverOpen(false);
        timeWheelTrigger?.focus();
      }
    });
    bind(doneButton, "click", () => {
      setTimeWheelPopoverOpen(false);
      if (timeWheelTrigger) {
        timeWheelTrigger.focus();
      }
    });
    bind(doneButton, "keydown", (event: KeyboardEvent) => {
      if (
        event.key === "Enter" ||
        event.keyCode === 13 ||
        event.key === " " ||
        event.keyCode === 32
      ) {
        event.preventDefault();
        setTimeWheelPopoverOpen(false);
        if (timeWheelTrigger) {
          timeWheelTrigger.focus();
        }
      }
    });
    footer.appendChild(doneButton);
    popover.appendChild(footer);

    return popover;
  }

  /**
   * Sets the hours, minutes, and optionally seconds
   * of the latest selected date object and the
   * corresponding time inputs
   * @param {Number} hours the hour. whether its military
   *                 or am-pm gets inferred from config
   * @param {Number} minutes the minutes
   * @param {Number} seconds the seconds (optional)
   */
  function setHours(hours: number, minutes: number, seconds: number) {
    if (self.latestSelectedDateObj !== undefined) {
      self.latestSelectedDateObj.setHours(hours % 24, minutes, seconds || 0, 0);
    }

    if (!self.hourElement || !self.minuteElement || self.isMobile) return;

    self.hourElement.value = pad(
      !self.config.time_24hr
        ? ((12 + hours) % 12) + 12 * int(hours % 12 === 0)
        : hours
    );

    self.minuteElement.value = pad(minutes);

    if (self.amPM !== undefined)
      self.amPM.textContent = self.l10n.amPM[int(hours >= 12)];

    if (self.secondElement !== undefined)
      self.secondElement.value = pad(seconds);

    syncTimeWheelPopover();
  }

  /**
   * Handles the year input and incrementing events
   * @param {Event} event the keyup or increment event
   */
  function onYearInput(event: KeyboardEvent & IncrementEvent) {
    const eventTarget = getEventTarget(event) as HTMLInputElement;
    const year = parseInt(eventTarget.value) + (event.delta || 0);

    if (
      year / 1000 > 1 ||
      (event.key === "Enter" && !/[^\d]/.test(year.toString()))
    ) {
      changeYear(year);
    }
  }

  /**
   * Essentially addEventListener + tracking
   * @param {Element} element the element to addEventListener to
   * @param {String} event the event name
   * @param {Function} handler the event handler
   */
  function bind<E extends Element | Window | Document>(
    element: E | E[],
    event: string | string[],
    handler: (e?: any) => void,
    options?: { capture?: boolean; once?: boolean; passive?: boolean }
  ): void {
    if (event instanceof Array)
      return event.forEach((ev) => bind(element, ev, handler, options));

    if (element instanceof Array)
      return element.forEach((el) => bind(el, event, handler, options));

    element.addEventListener(event, handler, options);
    self._handlers.push({
      remove: () => element.removeEventListener(event, handler, options),
    });
  }

  function triggerChange() {
    triggerEvent("onChange");
  }

  /**
   * Adds all the necessary event listeners
   */
  function bindEvents(): void {
    if (self.config.wrap) {
      ["open", "close", "toggle", "clear"].forEach((evt) => {
        Array.prototype.forEach.call(
          self.element.querySelectorAll(`[data-${evt}]`),
          (el: HTMLElement) =>
            bind(
              el,
              "click",
              self[evt as "open" | "close" | "toggle" | "clear"]
            )
        );
      });
    }

    if (self.isMobile) {
      setupMobile();
      return;
    }

    const debouncedResize = debounce(onResize, 50);
    self._debouncedChange = debounce(triggerChange, DEBOUNCED_CHANGE_MS);

    if (self.daysContainer && !/iPhone|iPad|iPod/i.test(navigator.userAgent))
      bind(self.daysContainer, "mouseover", (e: MouseEvent) => {
        if (self.config.mode === "range")
          onMouseOver(getEventTarget(e) as DayElement);
      });

    bind(self._input, "keydown", onKeyDown);
    if (self.calendarContainer !== undefined) {
      bind(self.calendarContainer, "keydown", onKeyDown);
      bind(self.calendarContainer, ["mousedown", "touchstart"], () => {
        self.calendarContainer.classList.remove("is-keyboard-nav");
      });
    }

    if (!self.config.inline && !self.config.static)
      bind(window, "resize", debouncedResize);

    if (window.ontouchstart !== undefined)
      bind(window.document, "touchstart", documentClick);
    else bind(window.document, "mousedown", documentClick);
    bind(window.document, "focus", documentClick, { capture: true });

    if (self.config.clickOpens === true) {
      if (self.config.focusOpens === true) {
        bind(self._input, "focus", self.open);
      }
      bind(self._input, "click", self.open);
    }

    if (self.daysContainer !== undefined) {
      bind(self.monthNav, "click", onMonthNavClick);

      bind(self.monthNav, ["keyup", "increment"], onYearInput);
      bind(self.daysContainer, "click", selectDate);

    }

    if (self.closeButton !== undefined) {
      bind(self.closeButton, "click", focusAndClose);
    }

    if (
      self.timeContainer !== undefined &&
      self.minuteElement !== undefined &&
      self.hourElement !== undefined
    ) {
      const selText = (e: FocusEvent) =>
        (getEventTarget(e) as HTMLInputElement).select();
      bind(self.timeContainer, ["increment"], updateTime);
      bind(self.timeContainer, "blur", updateTime, { capture: true });
      bind(self.timeContainer, "click", timeIncrement);

      bind([self.hourElement, self.minuteElement], ["focus", "click"], selText);

      if (self.secondElement !== undefined)
        bind(
          self.secondElement,
          "focus",
          () => self.secondElement && self.secondElement.select()
        );

      if (self.amPM !== undefined) {
        bind(self.amPM, "click", (e) => {
          updateTime(e);
        });
      }
    }

    if (self.config.allowInput) {
      bind(self._input, "blur", onBlur);
    }
  }

  /**
   * Set the calendar view to a particular date.
   * @param {Date} jumpDate the date to set the view to
   * @param {boolean} triggerChange if change events should be triggered
   */
  function jumpToDate(jumpDate?: DateOption, triggerChange?: boolean) {
    const jumpTo =
      jumpDate !== undefined
        ? self.parseDate(jumpDate)
        : self.latestSelectedDateObj ||
          (self.config.minDate && self.config.minDate > self.now
            ? self.config.minDate
            : self.config.maxDate && self.config.maxDate < self.now
            ? self.config.maxDate
            : self.now);

    const oldYear = self.currentYear;
    const oldMonth = self.currentMonth;

    try {
      if (jumpTo !== undefined) {
        self.currentYear = jumpTo.getFullYear();
        self.currentMonth = jumpTo.getMonth();
      }
    } catch (e: unknown) {
      /* istanbul ignore next */
      const error =
        e instanceof Error ? e : new Error(typeof e === "string" ? e : String(e));
      error.message = "Invalid date supplied: " + jumpTo;
      self.config.errorHandler(error);
    }

    if (triggerChange && self.currentYear !== oldYear) {
      triggerEvent("onYearChange");
      buildMonthSwitch();
    }

    if (
      triggerChange &&
      (self.currentYear !== oldYear || self.currentMonth !== oldMonth)
    ) {
      triggerEvent("onMonthChange");
    }

    self.redraw();
  }

  /**
   * The up/down arrow handler for time inputs
   * @param {Event} e the click event
   */
  function timeIncrement(e: KeyboardEvent | MouseEvent) {
    const eventTarget = getEventTarget(e) as Element;
    if (~eventTarget.className.indexOf("arrow"))
      incrementNumInput(e, eventTarget.classList.contains("arrowUp") ? 1 : -1);
  }

  /**
   * Increments/decrements the value of input associ-
   * ated with the up/down arrow by dispatching an
   * "increment" event on the input.
   *
   * @param {Event} e the click event
   * @param {Number} delta the diff (usually 1 or -1)
   * @param {Element} inputElem the input element
   */
  function incrementNumInput(
    e: KeyboardEvent | MouseEvent | undefined,
    delta: number,
    inputElem?: HTMLInputElement
  ) {
    const target = e && (getEventTarget(e) as Element);
    const input =
      inputElem ||
      (target && target.parentNode && target.parentNode.firstChild);
    const event = createEvent("increment") as IncrementEvent;
    event.delta = delta;
    input && input.dispatchEvent(event);
  }

  function build() {
    const fragment = window.document.createDocumentFragment();
    self.calendarContainer = createElement<HTMLDivElement>(
      "div",
      "flatpickr-calendar"
    );
    self.calendarContainer.id = `${calendarInstanceId}-calendar`;
    self.calendarContainer.tabIndex = -1;
    self.calendarContainer.setAttribute("role", "dialog");
    self.calendarContainer.setAttribute("aria-modal", "false");
    self.calendarContainer.setAttribute("aria-hidden", "true");
    self.calendarContainer.setAttribute(
      "aria-label",
      self.config.calendarTitle || "Calendar"
    );

    self._input.setAttribute("aria-haspopup", "dialog");
    self._input.setAttribute("aria-controls", self.calendarContainer.id);
    self._input.setAttribute("aria-expanded", "false");

    if (!self.config.noCalendar) {
      const keyboardHelpAriaLabel =
        self.l10n.keyboardHelpAriaLabel || "Keyboard help";
      const keyboardShortcutsTitle =
        self.l10n.keyboardShortcutsTitle || "Keyboard shortcuts";
      const keyboardShortcutFocus =
        self.l10n.keyboardShortcutFocus || "Tab / Shift+Tab: Move focus";
      const keyboardShortcutArrows =
        self.l10n.keyboardShortcutArrows ||
        "Arrow keys: Navigate days or wheel values";
      const keyboardShortcutPage =
        self.l10n.keyboardShortcutPage ||
        "PageUp / PageDown: Month/Year step in wheel";
      const keyboardShortcutHomeEnd =
        self.l10n.keyboardShortcutHomeEnd ||
        "Home / End: Jump to first/last month or year";
      const keyboardShortcutSelect =
        self.l10n.keyboardShortcutSelect ||
        "Enter / Space: Select or confirm";
      const keyboardShortcutEscape =
        self.l10n.keyboardShortcutEscape ||
        "Esc: Close popover/calendar";

      keyboardHelpButton = createElement<HTMLButtonElement>(
        "button",
        "flatpickr-keyboard-help-button",
        "?"
      );
      keyboardHelpButton.type = "button";
      keyboardHelpButton.setAttribute("aria-haspopup", "dialog");
      keyboardHelpButton.setAttribute("aria-expanded", "false");
      keyboardHelpButton.setAttribute("aria-label", keyboardHelpAriaLabel);
      keyboardHelpButton.tabIndex = 0;

      keyboardHelpPanel = createElement<HTMLDivElement>(
        "div",
        "flatpickr-keyboard-help-panel"
      );
      keyboardHelpPanel.id = `${calendarInstanceId}-keyboard-help`;
      keyboardHelpPanel.setAttribute("role", "note");
      keyboardHelpPanel.setAttribute("hidden", "hidden");
      keyboardHelpPanel.innerHTML =
        `<strong>${keyboardShortcutsTitle}</strong>` +
        "<ul>" +
        `<li>${keyboardShortcutFocus}</li>` +
        `<li>${keyboardShortcutArrows}</li>` +
        `<li>${keyboardShortcutPage}</li>` +
        `<li>${keyboardShortcutHomeEnd}</li>` +
        `<li>${keyboardShortcutSelect}</li>` +
        `<li>${keyboardShortcutEscape}</li>` +
        "</ul>";

      keyboardHelpButton.setAttribute("aria-controls", keyboardHelpPanel.id);
      bind(keyboardHelpButton, "click", () => {
        const isOpen =
          keyboardHelpButton?.getAttribute("aria-expanded") === "true";
        setKeyboardHelpOpen(!isOpen);
      });

      if (self.config.showCloseButton) {
        self.closeButton = createElement<HTMLButtonElement>(
          "button",
          "flatpickr-close-button"
        );
        self.closeButton.type = "button";
        self.closeButton.setAttribute("aria-label", "Close calendar");
        self.closeButton.tabIndex = 0;
        self.closeButton.innerHTML =
          "<svg class='flatpickr-close-icon' viewBox='0 0 16 16' aria-hidden='true' focusable='false'><path d='M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 1 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06Z' /></svg>";
      } else {
        self.closeButton = undefined;
      }

      if (self.config.showTitleBar || self.config.showCloseButton) {
        const titleBar = createElement<HTMLDivElement>("div", "flatpickr-titlebar");

        if (self.config.showTitleBar) {
          const titleText = createElement<HTMLSpanElement>(
            "span",
            "flatpickr-title",
            self.config.calendarTitle
          );
          titleBar.appendChild(titleText);
        }

        const titleBarActions = createElement<HTMLDivElement>(
          "div",
          "flatpickr-titlebar-actions"
        );
        titleBarActions.appendChild(keyboardHelpButton);

        if (self.closeButton) {
          titleBarActions.appendChild(self.closeButton);
        }

        titleBar.appendChild(titleBarActions);

        fragment.appendChild(titleBar);
        fragment.appendChild(keyboardHelpPanel);
      }

      fragment.appendChild(buildMonthNav());
      self.innerContainer = createElement<HTMLDivElement>(
        "div",
        "flatpickr-innerContainer"
      );

      if (self.config.weekNumbers) {
        const { weekWrapper, weekNumbers } = buildWeeks();
        self.innerContainer.appendChild(weekWrapper);
        self.weekNumbers = weekNumbers;
        self.weekWrapper = weekWrapper;
      }

      self.rContainer = createElement<HTMLDivElement>(
        "div",
        "flatpickr-rContainer"
      );
      self.rContainer.appendChild(buildWeekdays());

      if (!self.daysContainer) {
        self.daysContainer = createElement<HTMLDivElement>(
          "div",
          "flatpickr-days"
        );
        self.daysContainer.tabIndex = -1;
        self.daysContainer.setAttribute("role", "grid");
        self.daysContainer.setAttribute("aria-label", "Calendar dates");
      }

      buildDays();

      self.rContainer.appendChild(self.daysContainer);
      self.innerContainer.appendChild(self.rContainer);
      fragment.appendChild(self.innerContainer);
    }

    if (self.config.enableTime) {
      fragment.appendChild(buildTime());
    }

    toggleClass(
      self.calendarContainer,
      "rangeMode",
      self.config.mode === "range"
    );

    toggleClass(
      self.calendarContainer,
      "animate",
      self.config.animate === true
    );

    toggleClass(
      self.calendarContainer,
      "multiMonth",
      self.config.showMonths > 1
    );

    self.calendarContainer.appendChild(fragment);

    liveRegion = createElement<HTMLDivElement>(
      "div",
      "flatpickr-visually-hidden flatpickr-a11y-live"
    );
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    self.calendarContainer.appendChild(liveRegion);

    const customAppend =
      self.config.appendTo !== undefined &&
      self.config.appendTo.nodeType !== undefined;

    if (self.config.inline || self.config.static) {
      self.calendarContainer.classList.add(
        self.config.inline ? "inline" : "static"
      );

      if (self.config.inline) {
        if (!customAppend && self.element.parentNode)
          self.element.parentNode.insertBefore(
            self.calendarContainer,
            self._input.nextSibling
          );
        else if (self.config.appendTo !== undefined)
          self.config.appendTo.appendChild(self.calendarContainer);
      }

      if (self.config.static) {
        const wrapper = createElement("div", "flatpickr-wrapper");
        if (self.element.parentNode)
          self.element.parentNode.insertBefore(wrapper, self.element);
        wrapper.appendChild(self.element);

        if (self.altInput) wrapper.appendChild(self.altInput);

        wrapper.appendChild(self.calendarContainer);
      }
    }

    if (!self.config.static && !self.config.inline)
      (self.config.appendTo !== undefined
        ? self.config.appendTo
        : window.document.body
      ).appendChild(self.calendarContainer);
  }

  function createDay(
    className: string,
    date: Date,
    _dayNumber: number,
    i: number
  ) {
    const dateIsEnabled = isEnabled(date, true),
      dayElement = createElement<DayElement>(
        "span",
        className,
        date.getDate().toString()
      );

    dayElement.dateObj = date;
    dayElement.$i = i;
    dayElement.setAttribute("role", "gridcell");
    dayElement.setAttribute(
      "aria-label",
      self.formatDate(date, self.config.ariaDateFormat)
    );

    if (
      className.indexOf("hidden") === -1 &&
      compareDates(date, self.now) === 0
    ) {
      self.todayDateElem = dayElement;
      dayElement.classList.add("today");
      dayElement.setAttribute("aria-current", "date");
    }

    if (dateIsEnabled) {
      dayElement.tabIndex = -1;
      dayElement.setAttribute("aria-selected", "false");
      if (isDateSelected(date)) {
        dayElement.classList.add("selected");
        dayElement.setAttribute("aria-selected", "true");
        self.selectedDateElem = dayElement;

        if (self.config.mode === "range") {
          toggleClass(
            dayElement,
            "startRange",
            self.selectedDates[0] &&
              compareDates(date, self.selectedDates[0], true) === 0
          );

          toggleClass(
            dayElement,
            "endRange",
            self.selectedDates[1] &&
              compareDates(date, self.selectedDates[1], true) === 0
          );

          if (className === "nextMonthDay") dayElement.classList.add("inRange");
        }
      }
    } else {
      dayElement.classList.add("flatpickr-disabled");
      dayElement.setAttribute("aria-disabled", "true");
    }

    if (self.config.mode === "range") {
      if (isDateInRange(date) && !isDateSelected(date))
        dayElement.classList.add("inRange");
    }

    if (
      self.weekNumbers &&
      self.config.showMonths === 1 &&
      className !== "prevMonthDay" &&
      i % 7 === 6
    ) {
      self.weekNumbers.insertAdjacentHTML(
        "beforeend",
        "<span class='flatpickr-day'>" + self.config.getWeek(date) + "</span>"
      );
    }

    triggerEvent("onDayCreate", dayElement);

    return dayElement;
  }

  function focusOnDayElem(targetNode: DayElement) {
    if (self.selectedDateElem) {
      self.selectedDateElem.setAttribute("aria-selected", "false");
    }

    targetNode.setAttribute("aria-selected", "true");
    targetNode.focus();
    if (self.config.mode === "range") onMouseOver(targetNode);
  }

  function getFirstAvailableDay(delta: number) {
    const startMonth = delta > 0 ? 0 : self.config.showMonths - 1;
    const endMonth = delta > 0 ? self.config.showMonths : -1;

    for (let m = startMonth; m != endMonth; m += delta) {
      const month = (self.daysContainer as HTMLDivElement).children[m];
      const startIndex = delta > 0 ? 0 : month.children.length - 1;
      const endIndex = delta > 0 ? month.children.length : -1;

      for (let i = startIndex; i != endIndex; i += delta) {
        const c = month.children[i] as DayElement;
        if (c.className.indexOf("hidden") === -1 && isEnabled(c.dateObj))
          return c;
      }
    }
    return undefined;
  }

  function getPreferredTabDay() {
    const preferredByConfig =
      self.config.initialDayFocus === "selected"
        ? [self.selectedDateElem, self.todayDateElem]
        : self.config.initialDayFocus === "firstAvailable"
        ? []
        : [self.todayDateElem, self.selectedDateElem];

    for (const dayElem of preferredByConfig) {
      if (
        dayElem !== undefined &&
        isInView(dayElem) &&
        isEnabled(dayElem.dateObj)
      ) {
        return dayElem;
      }
    }

    return getFirstAvailableDay(1);
  }

  function getNextAvailableDay(current: DayElement, delta: number) {
    const givenMonth =
      current.className.indexOf("Month") === -1
        ? current.dateObj.getMonth()
        : self.currentMonth;
    const endMonth = delta > 0 ? self.config.showMonths : -1;
    const loopDelta = delta > 0 ? 1 : -1;

    for (
      let m = givenMonth - self.currentMonth;
      m != endMonth;
      m += loopDelta
    ) {
      const month = (self.daysContainer as HTMLDivElement).children[m];
      const startIndex =
        givenMonth - self.currentMonth === m
          ? current.$i + delta
          : delta < 0
          ? month.children.length - 1
          : 0;
      const numMonthDays = month.children.length;

      for (
        let i = startIndex;
        i >= 0 && i < numMonthDays && i != (delta > 0 ? numMonthDays : -1);
        i += loopDelta
      ) {
        const c = month.children[i] as DayElement;
        if (
          c.className.indexOf("hidden") === -1 &&
          isEnabled(c.dateObj) &&
          Math.abs(current.$i - i) >= Math.abs(delta)
        )
          return focusOnDayElem(c);
      }
    }

    self.changeMonth(loopDelta, true, true);
    focusOnDay(getFirstAvailableDay(loopDelta), 0);
    return undefined;
  }

  function focusOnDay(current: DayElement | undefined, offset: number) {
    const activeElement = getClosestActiveElement();

    const dayFocused = isInView(activeElement || document.body);
    const startElem =
      current !== undefined
        ? current
        : dayFocused
        ? (activeElement as DayElement)
        : self.selectedDateElem !== undefined && isInView(self.selectedDateElem)
        ? self.selectedDateElem
        : self.todayDateElem !== undefined && isInView(self.todayDateElem)
        ? self.todayDateElem
        : getFirstAvailableDay(offset > 0 ? 1 : -1);

    if (startElem === undefined) {
      self._input.focus();
    } else if (!dayFocused) {
      focusOnDayElem(startElem);
    } else {
      getNextAvailableDay(startElem, offset);
    }
  }

  function buildMonthDays(year: number, month: number) {
    const firstOfMonth =
      (new Date(year, month, 1).getDay() - self.l10n.firstDayOfWeek + 7) % 7;

    const prevMonthDays = self.utils.getDaysInMonth(
      (month - 1 + 12) % 12,
      year
    );

    const daysInMonth = self.utils.getDaysInMonth(month, year),
      days = window.document.createDocumentFragment(),
      isMultiMonth = self.config.showMonths > 1,
      prevMonthDayClass = isMultiMonth ? "prevMonthDay hidden" : "prevMonthDay",
      nextMonthDayClass = isMultiMonth ? "nextMonthDay hidden" : "nextMonthDay";

    let dayNumber = prevMonthDays + 1 - firstOfMonth,
      dayIndex = 0;

    // prepend days from the ending of previous month
    for (; dayNumber <= prevMonthDays; dayNumber++, dayIndex++) {
      days.appendChild(
        createDay(
          `flatpickr-day ${prevMonthDayClass}`,
          new Date(year, month - 1, dayNumber),
          dayNumber,
          dayIndex
        )
      );
    }

    // Start at 1 since there is no 0th day
    for (dayNumber = 1; dayNumber <= daysInMonth; dayNumber++, dayIndex++) {
      days.appendChild(
        createDay(
          "flatpickr-day",
          new Date(year, month, dayNumber),
          dayNumber,
          dayIndex
        )
      );
    }

    // append days from the next month
    for (
      let dayNum = daysInMonth + 1;
      dayNum <= 42 - firstOfMonth &&
      (self.config.showMonths === 1 || dayIndex % 7 !== 0);
      dayNum++, dayIndex++
    ) {
      days.appendChild(
        createDay(
          `flatpickr-day ${nextMonthDayClass}`,
          new Date(year, month + 1, dayNum % daysInMonth),
          dayNum,
          dayIndex
        )
      );
    }

    //updateNavigationCurrentMonth();

    const dayContainer = createElement<HTMLDivElement>("div", "dayContainer");
    dayContainer.appendChild(days);

    return dayContainer;
  }

  function buildDays() {
    if (self.daysContainer === undefined) {
      return;
    }

    clearNode(self.daysContainer);

    // TODO: week numbers for each month
    if (self.weekNumbers) clearNode(self.weekNumbers);

    const frag = document.createDocumentFragment();

    for (let i = 0; i < self.config.showMonths; i++) {
      const d = new Date(self.currentYear, self.currentMonth, 1);
      d.setMonth(self.currentMonth + i);

      frag.appendChild(buildMonthDays(d.getFullYear(), d.getMonth()));
    }

    self.daysContainer.appendChild(frag);

    self.days = self.daysContainer.firstChild as HTMLDivElement;
    if (self.config.mode === "range" && self.selectedDates.length === 1) {
      onMouseOver();
    }
  }

  function syncMonthYearWheelPopover() {
    if (!monthYearWheelPopover || !monthYearWheelTrigger) return;

    const { minMonth, maxMonth } = getMonthBoundsForYear(self.currentYear);

    monthWheelOptions.forEach((option) => {
      const monthIndex = parseInt(option.dataset.value || "0", 10);
      const enabled = monthIndex >= minMonth && monthIndex <= maxMonth;
      const isSelected = monthIndex === self.currentMonth;
      option.disabled = !enabled;
      option.classList.toggle("is-selected", isSelected);
      option.classList.toggle("is-disabled", !enabled);
      option.setAttribute("aria-selected", isSelected ? "true" : "false");
      option.setAttribute("aria-disabled", enabled ? "false" : "true");
      option.tabIndex = isSelected ? 0 : -1;
    });

    yearWheelOptions.forEach((option) => {
      const year = parseInt(option.dataset.value || "0", 10);
      const isSelected = year === self.currentYear;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-selected", isSelected ? "true" : "false");
      option.tabIndex = isSelected ? 0 : -1;
    });

    if (monthYearWheelManualInput) {
      monthYearWheelManualInput.value = String(self.currentYear);
    }

    const label = `${monthToStr(
      self.currentMonth,
      self.config.shorthandCurrentMonth,
      self.l10n
    )} ${self.currentYear}`;
    monthYearWheelTrigger.textContent = label;
    monthYearWheelTrigger.setAttribute("aria-label", label);

    if (monthYearWheelPopover.classList.contains("is-open")) {
      centerWheelSelection(monthWheelOptions);
      centerWheelSelection(yearWheelOptions);
    }
  }

  function setMonthYearWheelPopoverOpen(open: boolean) {
    if (!monthYearWheelPopover) return;

    if (open) {
      monthYearWheelPopover.removeAttribute("hidden");
      monthYearWheelPopover.classList.add("is-open");
      monthYearWheelTrigger?.setAttribute("aria-expanded", "true");
      window.requestAnimationFrame(() => {
        centerWheelSelection(monthWheelOptions);
        centerWheelSelection(yearWheelOptions);
      });
      const initialFocus =
        monthWheelOptions.find((option) => option.tabIndex === 0) ||
        monthWheelOptions[0] ||
        yearWheelOptions.find((option) => option.tabIndex === 0) ||
        yearWheelOptions[0] ||
        monthYearWheelManualInput;
      initialFocus?.focus();
      return;
    }

    monthYearWheelPopover.setAttribute("hidden", "hidden");
    monthYearWheelPopover.classList.remove("is-open");
    monthYearWheelTrigger?.setAttribute("aria-expanded", "false");
  }

  function setKeyboardHelpOpen(open: boolean) {
    if (!keyboardHelpPanel || !keyboardHelpButton) return;

    if (open) {
      keyboardHelpPanel.removeAttribute("hidden");
      keyboardHelpButton.setAttribute("aria-expanded", "true");
      return;
    }

    keyboardHelpPanel.setAttribute("hidden", "hidden");
    keyboardHelpButton.setAttribute("aria-expanded", "false");
  }

  function applyMonthYearWheelDelta(kind: "month" | "year", delta: number) {
    if (delta === 0) return;

    if (kind === "year") {
      const { minYear, maxYear } = getYearWheelRange();
      const targetYear = Math.min(
        maxYear,
        Math.max(minYear, self.currentYear + delta)
      );
      if (targetYear !== self.currentYear) {
        self.changeYear(targetYear);
      }
      syncMonthYearWheelPopover();
      return;
    }

    const candidate = new Date(self.currentYear, self.currentMonth + delta, 1);

    if (self.config.minDate) {
      const minBound = new Date(
        self.config.minDate.getFullYear(),
        self.config.minDate.getMonth(),
        1
      );
      if (candidate < minBound) {
        candidate.setFullYear(minBound.getFullYear(), minBound.getMonth(), 1);
      }
    }

    if (self.config.maxDate) {
      const maxBound = new Date(
        self.config.maxDate.getFullYear(),
        self.config.maxDate.getMonth(),
        1
      );
      if (candidate > maxBound) {
        candidate.setFullYear(maxBound.getFullYear(), maxBound.getMonth(), 1);
      }
    }

    const targetYear = candidate.getFullYear();
    const targetMonth = candidate.getMonth();

    if (targetYear !== self.currentYear) {
      self.changeYear(targetYear);
    }
    if (targetMonth !== self.currentMonth) {
      self.changeMonth(targetMonth, false, true);
    }

    syncMonthYearWheelPopover();
  }

  function buildMonthYearWheelPopover() {
    const popover = createElement<HTMLDivElement>(
      "div",
      "flatpickr-time-wheel-popover flatpickr-month-year-wheel-popover"
    );
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-modal", "false");
    popover.setAttribute("aria-label", `${self.l10n.monthAriaLabel} / ${self.l10n.yearAriaLabel}`);
    popover.setAttribute("hidden", "hidden");

    const content = createElement<HTMLDivElement>(
      "div",
      "flatpickr-time-wheel-content flatpickr-month-year-wheel-content"
    );

    const monthColumn = createElement<HTMLDivElement>(
      "div",
      "flatpickr-time-wheel-column flatpickr-month-year-wheel-column flatpickr-month-wheel"
    );
    monthColumn.setAttribute("role", "listbox");
    monthColumn.setAttribute("aria-label", self.l10n.monthAriaLabel);

    monthWheelOptions = [];
    for (let monthIndex = 0; monthIndex <= 11; monthIndex++) {
      const option = createElement<HTMLButtonElement>(
        "button",
        "flatpickr-time-wheel-option flatpickr-month-year-wheel-option",
        monthToStr(monthIndex, false, self.l10n)
      );
      option.type = "button";
      option.dataset.value = String(monthIndex);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.tabIndex = -1;
      bind(option, "click", () => {
        if (option.disabled) return;
        self.changeMonth(monthIndex, false, true);
        syncMonthYearWheelPopover();
      });
      monthWheelOptions.push(option);
      monthColumn.appendChild(option);
    }

    const yearColumn = createElement<HTMLDivElement>(
      "div",
      "flatpickr-time-wheel-column flatpickr-month-year-wheel-column flatpickr-year-wheel"
    );
    yearColumn.setAttribute("role", "listbox");
    yearColumn.setAttribute("aria-label", self.l10n.yearAriaLabel);

    yearWheelOptions = [];
    const { minYear, maxYear } = getYearWheelRange();
    for (let year = minYear; year <= maxYear; year++) {
      const option = createElement<HTMLButtonElement>(
        "button",
        "flatpickr-time-wheel-option flatpickr-month-year-wheel-option",
        String(year)
      );
      option.type = "button";
      option.dataset.value = String(year);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.tabIndex = -1;
      bind(option, "click", () => {
        self.changeYear(year);
        syncMonthYearWheelPopover();
      });
      yearWheelOptions.push(option);
      yearColumn.appendChild(option);
    }

    content.appendChild(monthColumn);
    content.appendChild(yearColumn);
    popover.appendChild(content);

    const getWheelKindFromTarget = (
      target: HTMLElement | null
    ): "month" | "year" => {
      if (!target) return "month";
      if (target.closest(".flatpickr-year-wheel")) return "year";
      if (target.closest(".flatpickr-month-wheel")) return "month";
      if (target === monthYearWheelManualInput) return "year";
      return "month";
    };

    const focusSelectedInKind = (kind: "month" | "year") => {
      const selected =
        kind === "year"
          ? yearWheelOptions.find((option) => option.tabIndex === 0)
          : monthWheelOptions.find((option) => option.tabIndex === 0);
      selected?.focus();
    };

    const bindOptionKeyHandling = (
      kind: "month" | "year",
      options: HTMLButtonElement[]
    ) => {
      options.forEach((option) => {
        bind(option, "keydown", (event: KeyboardEvent) => {
          if (event.keyCode === 38 || event.keyCode === 40) {
            event.preventDefault();
            event.stopPropagation();
            applyMonthYearWheelDelta(kind, event.keyCode === 40 ? 1 : -1);
            focusSelectedInKind(kind);
            return;
          }

          if (event.keyCode === 37 || event.keyCode === 39) {
            event.preventDefault();
            event.stopPropagation();
            focusSelectedInKind(kind === "month" ? "year" : "month");
            return;
          }

          if (event.keyCode === 33 || event.keyCode === 34) {
            event.preventDefault();
            event.stopPropagation();
            applyMonthYearWheelDelta(kind, event.keyCode === 34 ? 1 : -1);
            focusSelectedInKind(kind);
          }
        });
      });
    };

    bindOptionKeyHandling("month", monthWheelOptions);
    bindOptionKeyHandling("year", yearWheelOptions);

    const footer = createElement<HTMLDivElement>(
      "div",
      "flatpickr-time-wheel-footer flatpickr-month-year-wheel-footer"
    );

    if (self.config.yearWheelManualInput) {
      monthYearWheelManualInput = createElement<HTMLInputElement>(
        "input",
        "flatpickr-month-year-wheel-input"
      );
      monthYearWheelManualInput.type = "number";
      monthYearWheelManualInput.setAttribute("aria-label", self.l10n.yearAriaLabel);
      monthYearWheelManualInput.step = "1";
      monthYearWheelManualInput.min = String(minYear);
      monthYearWheelManualInput.max = String(maxYear);
      bind(monthYearWheelManualInput, "change", () => {
        const year = parseInt(monthYearWheelManualInput!.value, 10);
        if (!isNaN(year)) {
          self.changeYear(year);
          syncMonthYearWheelPopover();
        }
      });
      bind(monthYearWheelManualInput, "keydown", (event: KeyboardEvent) => {
        if (event.key === "Tab" || event.keyCode === 9) {
          event.preventDefault();
          cyclePopoverFocus(popover, monthYearWheelManualInput!, event.shiftKey);
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          const year = parseInt(monthYearWheelManualInput!.value, 10);
          if (!isNaN(year)) {
            self.changeYear(year);
            syncMonthYearWheelPopover();
          }
        }
      });
      footer.appendChild(monthYearWheelManualInput);
    } else {
      monthYearWheelManualInput = undefined;
    }

    const doneButton = createElement<HTMLButtonElement>(
      "button",
      "flatpickr-time-wheel-done flatpickr-month-year-wheel-done",
      self.l10n.doneButtonLabel
    );
    doneButton.type = "button";
    doneButton.tabIndex = 0;
    bind(popover, "keydown", (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.keyCode === 9) {
        const target = getEventTarget(event) as HTMLElement;
        if (!popover.contains(target)) return;
        event.preventDefault();
        cyclePopoverFocus(popover, target, event.shiftKey);
      } else if (event.keyCode === 38 || event.keyCode === 40) {
        event.preventDefault();
        const target = getEventTarget(event) as HTMLElement | null;
        const kind = getWheelKindFromTarget(target);
        const direction = event.keyCode === 40 ? 1 : -1;
        applyMonthYearWheelDelta(kind, direction);
        focusSelectedInKind(kind);
      } else if (event.keyCode === 37 || event.keyCode === 39) {
        const target = getEventTarget(event) as HTMLElement | null;
        if (!target) return;

        const isMonthOption = target.closest(".flatpickr-month-wheel") !== null;
        const isYearOption = target.closest(".flatpickr-year-wheel") !== null;

        if (!isMonthOption && !isYearOption) return;

        event.preventDefault();
        focusSelectedInKind(isMonthOption ? "year" : "month");
      } else if (event.keyCode === 33 || event.keyCode === 34) {
        event.preventDefault();
        const target = getEventTarget(event) as HTMLElement | null;
        const kind = getWheelKindFromTarget(target);
        const direction = event.keyCode === 34 ? 1 : -1;
        applyMonthYearWheelDelta(kind, direction);
        focusSelectedInKind(kind);
      } else if (event.keyCode === 36 || event.keyCode === 35) {
        event.preventDefault();
        const target = getEventTarget(event) as HTMLElement | null;
        const kind = getWheelKindFromTarget(target);
        if (kind === "year") {
          const { minYear, maxYear } = getYearWheelRange();
          self.changeYear(event.keyCode === 36 ? minYear : maxYear);
        } else if (event.keyCode === 36) {
          const { minMonth } = getMonthBoundsForYear(self.currentYear);
          self.changeMonth(minMonth, false);
        } else {
          const { maxMonth } = getMonthBoundsForYear(self.currentYear);
          self.changeMonth(maxMonth, false);
        }
        syncMonthYearWheelPopover();
        focusSelectedInKind(kind);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setMonthYearWheelPopoverOpen(false);
        monthYearWheelTrigger?.focus();
      }
    });
    bind(doneButton, "click", () => {
      setMonthYearWheelPopoverOpen(false);
      monthYearWheelTrigger?.focus();
    });
    bind(doneButton, "keydown", (event: KeyboardEvent) => {
      if (
        event.key === "Enter" ||
        event.keyCode === 13 ||
        event.key === " " ||
        event.keyCode === 32
      ) {
        event.preventDefault();
        setMonthYearWheelPopoverOpen(false);
        monthYearWheelTrigger?.focus();
      }
    });
    footer.appendChild(doneButton);
    popover.appendChild(footer);

    return popover;
  }

  function buildMonthSwitch() {
    if (!self.monthsDropdownContainer) return;

    if (
      self.config.showMonths > 1 ||
      self.config.monthSelectorType !== "dropdown"
    )
      return;

    const getMonthBounds = (year: number) => {
      let minMonth = 0;
      let maxMonth = 11;

      if (
        self.config.minDate !== undefined &&
        year === self.config.minDate.getFullYear()
      ) {
        minMonth = self.config.minDate.getMonth();
      }

      if (
        self.config.maxDate !== undefined &&
        year === self.config.maxDate.getFullYear()
      ) {
        maxMonth = self.config.maxDate.getMonth();
      }

      return { minMonth, maxMonth };
    };

    const { minMonth, maxMonth } = getMonthBounds(self.currentYear);

    if (self.currentMonth < minMonth) self.currentMonth = minMonth;
    if (self.currentMonth > maxMonth) self.currentMonth = maxMonth;

    clearNode(self.monthsDropdownContainer);

    for (let i = minMonth; i <= maxMonth; i++) {
      const option = createElement<HTMLOptionElement>(
        "option",
        "flatpickr-monthDropdown-month",
        monthToStr(i, self.config.shorthandCurrentMonth, self.l10n)
      );

      option.value = i.toString();
      option.selected = i === self.currentMonth;
      self.monthsDropdownContainer.appendChild(option);
    }

    self.monthsDropdownContainer.value = self.currentMonth.toString();
  }

  function buildMonth(monthOffset = 0) {
    const container = createElement("div", "flatpickr-month");
    const monthNavFragment = window.document.createDocumentFragment();

    if (self.config.monthYearWheel) {
      const currentMonth = createElement<HTMLDivElement>(
        "div",
        "flatpickr-current-month"
      );

      const monthElement = createElement<HTMLSpanElement>("span", "cur-month");
      const yearElement = createElement<HTMLInputElement>("input", "cur-year");

      yearElement.setAttribute("aria-label", self.l10n.yearAriaLabel);
      yearElement.type = "number";
      yearElement.tabIndex = -1;

      if (self.config.minDate) {
        yearElement.setAttribute(
          "min",
          self.config.minDate.getFullYear().toString()
        );
      }

      if (self.config.maxDate) {
        yearElement.setAttribute(
          "max",
          self.config.maxDate.getFullYear().toString()
        );
      }

      if (monthOffset === 0) {
        monthYearWheelTrigger = createElement<HTMLButtonElement>(
          "button",
          "flatpickr-month-year-wheel-trigger"
        );
        monthYearWheelTrigger.type = "button";
        monthYearWheelTrigger.setAttribute("aria-haspopup", "dialog");
        monthYearWheelTrigger.setAttribute("aria-expanded", "false");
        bind(monthYearWheelTrigger, "click", () => {
          if (!monthYearWheelPopover) return;
          setMonthYearWheelPopoverOpen(
            !monthYearWheelPopover.classList.contains("is-open")
          );
        });

        monthYearWheelPopover = buildMonthYearWheelPopover();
        currentMonth.appendChild(monthYearWheelTrigger);
        currentMonth.appendChild(monthYearWheelPopover);
        syncMonthYearWheelPopover();
      } else {
        const staticMonthLabel = createElement<HTMLSpanElement>(
          "span",
          "cur-month flatpickr-month-year-static-label"
        );
        yearElement.type = "hidden";
        yearElement.setAttribute("aria-hidden", "true");
        currentMonth.appendChild(staticMonthLabel);

        monthNavFragment.appendChild(currentMonth);
        container.appendChild(monthNavFragment);

        return {
          container,
          yearElement,
          monthElement: staticMonthLabel,
        };
      }

      monthNavFragment.appendChild(currentMonth);
      container.appendChild(monthNavFragment);

      return {
        container,
        yearElement,
        monthElement,
      };
    }

    let monthElement;

    if (
      self.config.showMonths > 1 ||
      self.config.monthSelectorType === "static"
    ) {
      monthElement = createElement<HTMLSpanElement>("span", "cur-month");
    } else {
      const monthDropdown = createElement<HTMLDivElement>(
        "div",
        "flatpickr-monthDropdown"
      );

      self.monthsDropdownContainer = createElement<HTMLSelectElement>(
        "select",
        "flatpickr-monthDropdown-months"
      );
      self.monthsDropdownContainer.id = `${calendarInstanceId}-month-toggle`;

      self.monthsDropdownContainer.setAttribute(
        "aria-label",
        self.l10n.monthAriaLabel
      );

      bind(self.monthsDropdownContainer, "change", () => {
        const selectedMonth = parseInt(self.monthsDropdownContainer.value, 10);
        if (!isNaN(selectedMonth)) {
          self.changeMonth(selectedMonth, false);
        }
      });

      buildMonthSwitch();

      monthDropdown.appendChild(self.monthsDropdownContainer);
      monthElement = monthDropdown;
    }

    const yearInput = createNumberInput("cur-year", { tabindex: "0" });

    const yearElement = yearInput.getElementsByTagName(
      "input"
    )[0] as HTMLInputElement;
    yearElement.setAttribute("aria-label", self.l10n.yearAriaLabel);

    if (self.config.minDate) {
      yearElement.setAttribute(
        "min",
        self.config.minDate.getFullYear().toString()
      );
    }

    if (self.config.maxDate) {
      yearElement.setAttribute(
        "max",
        self.config.maxDate.getFullYear().toString()
      );

      yearElement.disabled =
        !!self.config.minDate &&
        self.config.minDate.getFullYear() === self.config.maxDate.getFullYear();
    }

    const currentMonth = createElement<HTMLDivElement>(
      "div",
      "flatpickr-current-month"
    );

    currentMonth.appendChild(monthElement);
    currentMonth.appendChild(yearInput);

    monthNavFragment.appendChild(currentMonth);
    container.appendChild(monthNavFragment);

    return {
      container,
      yearElement,
      monthElement,
    };
  }

  function buildMonths() {
    clearNode(self.monthNav);
    if (self.config.showMonthNavArrows) {
      self.monthNav.appendChild(self.prevMonthNav);
    }

    if (self.config.showMonths) {
      self.yearElements = [];
      self.monthElements = [];
    }

    for (let m = 0; m < self.config.showMonths; m++) {
      const month = buildMonth(m);
      self.yearElements.push(month.yearElement);
      self.monthElements.push(month.monthElement);
      self.monthNav.appendChild(month.container);
    }

    if (self.config.monthYearWheel) {
      syncMonthYearWheelPopover();
    }

    if (self.config.showMonthNavArrows) {
      self.monthNav.appendChild(self.nextMonthNav);
    }
  }

  function buildMonthNav() {
    self.monthNav = createElement<HTMLDivElement>("div", "flatpickr-months");
    self.yearElements = [];
    self.monthElements = [];

    self.prevMonthNav = createElement<HTMLButtonElement>(
      "button",
      "flatpickr-prev-month"
    );
    (self.prevMonthNav as HTMLButtonElement).type = "button";
    self.prevMonthNav.setAttribute("aria-label", "Previous month");
    self.prevMonthNav.tabIndex = self.config.showMonthNavArrows ? 0 : -1;
    self.prevMonthNav.innerHTML = self.config.prevArrow;

    self.nextMonthNav = createElement("button", "flatpickr-next-month");
    (self.nextMonthNav as HTMLButtonElement).type = "button";
    self.nextMonthNav.setAttribute("aria-label", "Next month");
    self.nextMonthNav.tabIndex = self.config.showMonthNavArrows ? 0 : -1;
    self.nextMonthNav.innerHTML = self.config.nextArrow;

    buildMonths();

    Object.defineProperty(self, "_hidePrevMonthArrow", {
      get: () => self.__hidePrevMonthArrow,
      set(bool: boolean) {
        if (self.__hidePrevMonthArrow !== bool) {
          toggleClass(self.prevMonthNav, "flatpickr-disabled", bool);
          self.__hidePrevMonthArrow = bool;
        }
      },
    });

    Object.defineProperty(self, "_hideNextMonthArrow", {
      get: () => self.__hideNextMonthArrow,
      set(bool: boolean) {
        if (self.__hideNextMonthArrow !== bool) {
          toggleClass(self.nextMonthNav, "flatpickr-disabled", bool);
          self.__hideNextMonthArrow = bool;
        }
      },
    });

    self.currentYearElement = self.yearElements[0];

    updateNavigationCurrentMonth();

    return self.monthNav;
  }

  function buildTime() {
    self.calendarContainer.classList.add("hasTime");
    if (self.config.noCalendar)
      self.calendarContainer.classList.add("noCalendar");

    const isTimeOnly =
      self.config.enableTime === true && self.config.noCalendar === true;

    const defaults = getDefaultHours(self.config);

    self.timeContainer = createElement<HTMLDivElement>("div", "flatpickr-time");
    self.timeContainer.classList.add("has-wheel-popover");
    self.timeContainer.tabIndex = -1;
    const separator = createElement("span", "flatpickr-time-separator", ":");

    const hourInput = createNumberInput("flatpickr-hour", {
      "aria-label": self.l10n.hourAriaLabel,
    });
    self.hourElement = hourInput.getElementsByTagName(
      "input"
    )[0] as HTMLInputElement;

    const minuteInput = createNumberInput("flatpickr-minute", {
      "aria-label": self.l10n.minuteAriaLabel,
    });

    self.minuteElement = minuteInput.getElementsByTagName(
      "input"
    )[0] as HTMLInputElement;

    self.hourElement.tabIndex = self.minuteElement.tabIndex = -1;

    self.hourElement.value = pad(
      self.latestSelectedDateObj
        ? self.latestSelectedDateObj.getHours()
        : self.config.time_24hr
        ? defaults.hours
        : military2ampm(defaults.hours)
    );

    self.minuteElement.value = pad(
      self.latestSelectedDateObj
        ? self.latestSelectedDateObj.getMinutes()
        : defaults.minutes
    );

    self.hourElement.setAttribute("step", self.config.hourIncrement.toString());
    self.minuteElement.setAttribute(
      "step",
      self.config.minuteIncrement.toString()
    );

    self.hourElement.setAttribute("min", self.config.time_24hr ? "0" : "1");
    self.hourElement.setAttribute("max", self.config.time_24hr ? "23" : "12");
    self.hourElement.setAttribute("maxlength", "2");

    self.minuteElement.setAttribute("min", "0");
    self.minuteElement.setAttribute("max", "59");
    self.minuteElement.setAttribute("maxlength", "2");

    self.timeContainer.appendChild(hourInput);
    self.timeContainer.appendChild(separator);
    self.timeContainer.appendChild(minuteInput);

    if (self.config.time_24hr) self.timeContainer.classList.add("time24hr");

    if (self.config.enableSeconds) {
      self.timeContainer.classList.add("hasSeconds");

      const secondInput = createNumberInput("flatpickr-second");
      self.secondElement = secondInput.getElementsByTagName(
        "input"
      )[0] as HTMLInputElement;

      self.secondElement.value = pad(
        self.latestSelectedDateObj
          ? self.latestSelectedDateObj.getSeconds()
          : defaults.seconds
      );

      self.secondElement.setAttribute(
        "step",
        self.minuteElement.getAttribute("step") as string
      );
      self.secondElement.setAttribute("min", "0");
      self.secondElement.setAttribute("max", "59");
      self.secondElement.setAttribute("maxlength", "2");

      self.timeContainer.appendChild(
        createElement("span", "flatpickr-time-separator", ":")
      );
      self.timeContainer.appendChild(secondInput);
    }

    if (!self.config.time_24hr) {
      // add self.amPM if appropriate
      self.amPM = createElement(
        "span",
        "flatpickr-am-pm",
        self.l10n.amPM[
          int(
            (self.latestSelectedDateObj
              ? self.hourElement.value
              : self.config.defaultHour) > 11
          )
        ]
      );
      self.amPM.title = self.l10n.toggleTitle;
      self.amPM.tabIndex = -1;
      self.timeContainer.appendChild(self.amPM);
    }

    if (!isTimeOnly) {
      const timeBar = createElement<HTMLDivElement>(
        "div",
        "flatpickr-time-wheel-bar"
      );
      const timeLabel = createElement<HTMLSpanElement>(
        "span",
        "flatpickr-time-wheel-label",
        self.l10n.timeLabel
      );
      timeWheelTrigger = createElement<HTMLButtonElement>(
        "button",
        "flatpickr-time-wheel-trigger"
      );
      timeWheelTrigger.type = "button";
      timeWheelTrigger.setAttribute("aria-haspopup", "dialog");
      timeWheelTrigger.setAttribute("aria-expanded", "false");
      timeWheelTrigger.setAttribute(
        "aria-controls",
        `${calendarInstanceId}-time-wheel-popover`
      );
      bind(timeWheelTrigger, "click", () => {
        if (!timeWheelPopover) return;
        setTimeWheelPopoverOpen(!timeWheelPopover.classList.contains("is-open"));
      });

      timeBar.appendChild(timeLabel);
      timeBar.appendChild(timeWheelTrigger);
      self.timeContainer.appendChild(timeBar);
    } else {
      timeWheelTrigger = undefined;
    }

    timeWheelPopover = buildTimeWheelPopover();
    self.timeContainer.appendChild(timeWheelPopover);
    syncTimeWheelPopover();

    if (isTimeOnly) {
      timeWheelPopover.removeAttribute("hidden");
      timeWheelPopover.classList.add("is-open");
    }

    return self.timeContainer;
  }

  function buildWeekdays() {
    if (!self.weekdayContainer)
      self.weekdayContainer = createElement<HTMLDivElement>(
        "div",
        "flatpickr-weekdays"
      );
    else clearNode(self.weekdayContainer);

    for (let i = self.config.showMonths; i--; ) {
      const container = createElement<HTMLDivElement>(
        "div",
        "flatpickr-weekdaycontainer"
      );

      self.weekdayContainer.appendChild(container);
    }

    updateWeekdays();

    return self.weekdayContainer;
  }

  function updateWeekdays() {
    if (!self.weekdayContainer) {
      return;
    }

    const firstDayOfWeek = self.l10n.firstDayOfWeek;
    let weekdays = [...self.l10n.weekdays.shorthand];
    let weekdaysLong = [...self.l10n.weekdays.longhand];

    if (firstDayOfWeek > 0 && firstDayOfWeek < weekdays.length) {
      weekdays = [
        ...weekdays.splice(firstDayOfWeek, weekdays.length),
        ...weekdays.splice(0, firstDayOfWeek),
      ];
      weekdaysLong = [
        ...weekdaysLong.splice(firstDayOfWeek, weekdaysLong.length),
        ...weekdaysLong.splice(0, firstDayOfWeek),
      ];
    }

    for (let i = self.config.showMonths; i--; ) {
      const weekdaysMarkup = weekdays
        .map(
          (weekday, index) =>
            `<span class='flatpickr-weekday' role='columnheader' aria-label='${weekdaysLong[index]}'>${weekday}</span>`
        )
        .join("");

      self.weekdayContainer.children[i].innerHTML = weekdaysMarkup;
    }
  }

  /* istanbul ignore next */
  function buildWeeks() {
    self.calendarContainer.classList.add("hasWeeks");
    const weekWrapper = createElement<HTMLDivElement>(
      "div",
      "flatpickr-weekwrapper"
    );
    weekWrapper.appendChild(
      createElement("span", "flatpickr-weekday", self.l10n.weekAbbreviation)
    );
    const weekNumbers = createElement<HTMLDivElement>("div", "flatpickr-weeks");
    weekWrapper.appendChild(weekNumbers);

    return {
      weekWrapper,
      weekNumbers,
    };
  }

  function changeMonth(value: number, isOffset = true, animateScroll = false) {
    const delta = isOffset ? value : value - self.currentMonth;

    if (
      (delta < 0 && self._hidePrevMonthArrow === true) ||
      (delta > 0 && self._hideNextMonthArrow === true)
    )
      return;

    self.currentMonth += delta;

    if (animateScroll && self.daysContainer && delta !== 0) {
      if (monthScrollAnimationTimer !== undefined) {
        window.clearTimeout(monthScrollAnimationTimer);
      }

      self.daysContainer.classList.remove(
        "is-month-scroll-prev",
        "is-month-scroll-next",
        "is-month-scroll-active"
      );

      self.daysContainer.classList.add(
        delta > 0 ? "is-month-scroll-next" : "is-month-scroll-prev",
        "is-month-scroll-active"
      );

      monthScrollAnimationTimer = window.setTimeout(() => {
        if (!self.daysContainer) return;
        self.daysContainer.classList.remove(
          "is-month-scroll-prev",
          "is-month-scroll-next",
          "is-month-scroll-active"
        );
        monthScrollAnimationTimer = undefined;
      }, 170);
    }

    if (self.currentMonth < 0 || self.currentMonth > 11) {
      self.currentYear += self.currentMonth > 11 ? 1 : -1;
      self.currentMonth = (self.currentMonth + 12) % 12;

      triggerEvent("onYearChange");
      buildMonthSwitch();
    }

    buildDays();

    triggerEvent("onMonthChange");
    updateNavigationCurrentMonth();
  }

  function clear(triggerChangeEvent = true, toInitial = true) {
    self.input.value = "";

    if (self.altInput !== undefined) self.altInput.value = "";

    if (self.mobileInput !== undefined) self.mobileInput.value = "";

    self.selectedDates = [];
    self.latestSelectedDateObj = undefined;
    if (toInitial === true) {
      self.currentYear = self._initialDate.getFullYear();
      self.currentMonth = self._initialDate.getMonth();
    }

    if (self.config.enableTime === true) {
      const { hours, minutes, seconds } = getDefaultHours(self.config);
      setHours(hours, minutes, seconds);
    }

    self.redraw();

    if (triggerChangeEvent)
      // triggerChangeEvent is true (default) or an Event
      triggerEvent("onChange");
  }

  function close() {
    self.isOpen = false;

    setTimeWheelPopoverOpen(false);
    setMonthYearWheelPopoverOpen(false);
    setKeyboardHelpOpen(false);

    if (!self.isMobile) {
      if (self.calendarContainer !== undefined) {
        self.calendarContainer.classList.remove("open");
      }
      if (self._input !== undefined) {
        self._input.classList.remove("active");
        self._input.setAttribute("aria-expanded", "false");
      }

      self.calendarContainer.setAttribute("aria-hidden", "true");
    }

    triggerEvent("onClose");
  }

  function destroy() {
    if (self.config !== undefined) triggerEvent("onDestroy");

    if (monthScrollAnimationTimer !== undefined) {
      window.clearTimeout(monthScrollAnimationTimer);
      monthScrollAnimationTimer = undefined;
    }

    for (let i = self._handlers.length; i--; ) {
      self._handlers[i].remove();
    }

    self._handlers = [];

    if (self.mobileInput) {
      if (self.mobileInput.parentNode)
        self.mobileInput.parentNode.removeChild(self.mobileInput);
      self.mobileInput = undefined;
    } else if (self.calendarContainer && self.calendarContainer.parentNode) {
      if (self.config.static && self.calendarContainer.parentNode) {
        const wrapper = self.calendarContainer.parentNode;
        wrapper.lastChild && wrapper.removeChild(wrapper.lastChild);

        if (wrapper.parentNode) {
          while (wrapper.firstChild)
            wrapper.parentNode.insertBefore(wrapper.firstChild, wrapper);
          wrapper.parentNode.removeChild(wrapper);
        }
      } else
        self.calendarContainer.parentNode.removeChild(self.calendarContainer);
    }

    if (self.altInput) {
      self.input.type = "text";
      if (self.altInput.parentNode)
        self.altInput.parentNode.removeChild(self.altInput);
      delete self.altInput;
    }

    if (self.input) {
      self.input.type = (self.input as any)._type;
      self.input.classList.remove("flatpickr-input");
      self.input.removeAttribute("readonly");
    }

    ([
      "_showTimeInput",
      "latestSelectedDateObj",
      "_hideNextMonthArrow",
      "_hidePrevMonthArrow",
      "__hideNextMonthArrow",
      "__hidePrevMonthArrow",
      "isMobile",
      "isOpen",
      "selectedDateElem",
      "minDateHasTime",
      "maxDateHasTime",
      "days",
      "daysContainer",
      "_input",
      "_positionElement",
      "innerContainer",
      "rContainer",
      "monthNav",
      "todayDateElem",
      "calendarContainer",
      "weekdayContainer",
      "prevMonthNav",
      "nextMonthNav",
      "monthsDropdownContainer",
      "currentMonthElement",
      "currentYearElement",
      "navigationCurrentMonth",
      "selectedDateElem",
      "config",
    ] as (keyof Instance)[]).forEach((k) => {
      try {
        delete self[k as keyof Instance];
      } catch (_) {}
    });
  }

  function isCalendarElem(elem: HTMLElement) {
    return self.calendarContainer.contains(elem);
  }

  function documentClick(e: MouseEvent) {
    if (self.isOpen && !self.config.inline) {
      const eventTarget = getEventTarget(e);
      const isCalendarElement = isCalendarElem(eventTarget as HTMLElement);
      const isInput =
        eventTarget === self.input ||
        eventTarget === self.altInput ||
        self.element.contains(eventTarget as HTMLElement) ||
        // web components
        // e.path is not present in all browsers. circumventing typechecks
        ((e as any).path &&
          (e as any).path.indexOf &&
          (~(e as any).path.indexOf(self.input) ||
            ~(e as any).path.indexOf(self.altInput)));

      const lostFocus =
        !isInput &&
        !isCalendarElement &&
        !isCalendarElem(e.relatedTarget as HTMLElement);

      const isIgnored = !self.config.ignoredFocusElements.some((elem) =>
        elem.contains(eventTarget as Node)
      );

      if (lostFocus && isIgnored) {
        if (self.config.allowInput) {
          self.setDate(
            self._input.value,
            false,
            self.config.altInput
              ? self.config.altFormat
              : self.config.dateFormat
          );
        }

        if (
          self.timeContainer !== undefined &&
          self.minuteElement !== undefined &&
          self.hourElement !== undefined &&
          self.input.value !== "" &&
          self.input.value !== undefined
        ) {
          updateTime();
        }

        self.close();

        if (
          self.config &&
          self.config.mode === "range" &&
          self.selectedDates.length === 1
        )
          self.clear(false);
      }
    }
  }

  function changeYear(newYear: number) {
    if (
      !newYear ||
      (self.config.minDate && newYear < self.config.minDate.getFullYear()) ||
      (self.config.maxDate && newYear > self.config.maxDate.getFullYear())
    )
      return;

    const newYearNum = newYear,
      isNewYear = self.currentYear !== newYearNum;

    self.currentYear = newYearNum || self.currentYear;

    if (
      self.config.maxDate &&
      self.currentYear === self.config.maxDate.getFullYear()
    ) {
      self.currentMonth = Math.min(
        self.config.maxDate.getMonth(),
        self.currentMonth
      );
    } else if (
      self.config.minDate &&
      self.currentYear === self.config.minDate.getFullYear()
    ) {
      self.currentMonth = Math.max(
        self.config.minDate.getMonth(),
        self.currentMonth
      );
    }

    if (isNewYear) {
      self.redraw();
      triggerEvent("onYearChange");
      buildMonthSwitch();
    }
  }

  function isEnabled(date: DateOption, timeless = true): boolean {
    const dateToCheck = self.parseDate(date, undefined, timeless); // timeless

    if (
      (self.config.minDate &&
        dateToCheck &&
        compareDates(
          dateToCheck,
          self.config.minDate,
          timeless !== undefined ? timeless : !self.minDateHasTime
        ) < 0) ||
      (self.config.maxDate &&
        dateToCheck &&
        compareDates(
          dateToCheck,
          self.config.maxDate,
          timeless !== undefined ? timeless : !self.maxDateHasTime
        ) > 0)
    )
      return false;

    if (
      self.config.enableTime &&
      Array.isArray(self.config.timeRules) &&
      self.config.timeRules.length > 0 &&
      dateToCheck
    ) {
      const weekdayRuleBounds = getWeekdayTimeRuleBounds(dateToCheck);
      if (weekdayRuleBounds.hasRules && !weekdayRuleBounds.hasMatch) {
        return false;
      }
    }

    if (!self.config.enable && self.config.disable.length === 0) return true;

    if (dateToCheck === undefined) return false;

    const bool = !!self.config.enable,
      array = self.config.enable ?? self.config.disable;

    for (let i = 0, d; i < array.length; i++) {
      d = array[i];

      if (
        typeof d === "function" &&
        d(dateToCheck) // disabled by function
      )
        return bool;
      else if (
        d instanceof Date &&
        dateToCheck !== undefined &&
        d.getTime() === dateToCheck.getTime()
      )
        // disabled by date
        return bool;
      else if (typeof d === "string") {
        // disabled by date string
        const parsed = self.parseDate(d, undefined, true);
        return parsed && parsed.getTime() === dateToCheck.getTime()
          ? bool
          : !bool;
      } else if (
        // disabled by range
        typeof d === "object" &&
        dateToCheck !== undefined &&
        (d as DateRangeLimit).from &&
        (d as DateRangeLimit).to &&
        dateToCheck.getTime() >= (d as DateRangeLimit<Date>).from.getTime() &&
        dateToCheck.getTime() <= (d as DateRangeLimit<Date>).to.getTime()
      )
        return bool;
    }

    return !bool;
  }

  function isInView(elem: Element) {
    if (self.daysContainer !== undefined)
      return (
        elem.className.indexOf("hidden") === -1 &&
        elem.className.indexOf("flatpickr-disabled") === -1 &&
        self.daysContainer.contains(elem)
      );
    return false;
  }

  function onBlur(e: FocusEvent) {
    const isInput = e.target === self._input;
    const valueChanged = self._input.value.trimEnd() !== getDateStr();

    if (
      isInput &&
      valueChanged &&
      !(e.relatedTarget && isCalendarElem(e.relatedTarget as HTMLElement))
    ) {
      self.setDate(
        self._input.value,
        true,
        e.target === self.altInput
          ? self.config.altFormat
          : self.config.dateFormat
      );
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    // e.key                      e.keyCode
    // "Backspace"                        8
    // "Tab"                              9
    // "Enter"                           13
    // "Escape"     (IE "Esc")           27
    // "ArrowLeft"  (IE "Left")          37
    // "ArrowUp"    (IE "Up")            38
    // "ArrowRight" (IE "Right")         39
    // "ArrowDown"  (IE "Down")          40
    // "Delete"     (IE "Del")           46

    if (self.calendarContainer !== undefined) {
      self.calendarContainer.classList.add("is-keyboard-nav");
    }

    const eventTarget = getEventTarget(e);
    const isInput = self.config.wrap
      ? element.contains(eventTarget as HTMLElement)
      : eventTarget === self._input;
    const isTimeOnlyInput =
      self.config.enableTime === true && self.config.noCalendar === true;
    const allowInput = self.config.allowInput;
    const allowKeydown = self.isOpen && (!allowInput || !isInput);
    const allowInlineKeydown = self.config.inline && isInput && !allowInput;

    if (e.keyCode === 13 && isInput) {
      if (allowInput) {
        e.preventDefault();
        self.setDate(
          self._input.value,
          true,
          eventTarget === self.altInput
            ? self.config.altFormat
            : self.config.dateFormat
        );
        self.close();
        return (eventTarget as HTMLElement).blur();
      } else {
        e.preventDefault();
        self.open();
        if (!self.config.noCalendar) {
          if (self.config.monthYearWheel && monthYearWheelTrigger) {
            monthYearWheelTrigger.focus();
          } else {
            focusOnDay(undefined, 1);
          }
        }
        return;
      }
    } else if (
      isCalendarElem(eventTarget as HTMLElement) ||
      allowKeydown ||
      allowInlineKeydown ||
      (isTimeOnlyInput && isInput)
    ) {
      const isTimeObj =
        !!self.timeContainer &&
        self.timeContainer.contains(eventTarget as HTMLElement);
      const isMonthDropdown =
        eventTarget === self.monthsDropdownContainer;

      const isInsideTimeWheelPopover =
        timeWheelPopover !== undefined &&
        timeWheelPopover.contains(eventTarget as Node);
      const isInsideMonthYearWheelPopover =
        monthYearWheelPopover !== undefined &&
        monthYearWheelPopover.contains(eventTarget as Node);

      if (
        (isInsideTimeWheelPopover || isInsideMonthYearWheelPopover) &&
        [33, 34, 35, 36, 37, 38, 39, 40].indexOf(e.keyCode) !== -1
      ) {
        // Popover handlers own arrow/page/home/end navigation.
        return;
      }

      if (
        isMonthDropdown &&
        [13, 32, 37, 38, 39, 40].indexOf(e.keyCode) !== -1
      ) {
        return;
      }

      switch (e.keyCode) {
        case 13:
          if (eventTarget === keyboardHelpButton) {
            e.preventDefault();
            const isOpen =
              keyboardHelpButton.getAttribute("aria-expanded") === "true";
            setKeyboardHelpOpen(!isOpen);
            break;
          }

          if (eventTarget === self.closeButton) {
            e.preventDefault();
            focusAndClose();
            break;
          }

          if (eventTarget === timeWheelTrigger) {
            e.preventDefault();
            setTimeWheelPopoverOpen(true);
            break;
          }

          if (eventTarget === monthYearWheelTrigger) {
            e.preventDefault();
            setMonthYearWheelPopoverOpen(true);
            break;
          }

          if (
            timeWheelPopover !== undefined &&
            (eventTarget as HTMLElement).classList.contains(
              "flatpickr-time-wheel-done"
            )
          ) {
            e.preventDefault();
            setTimeWheelPopoverOpen(false);
            timeWheelTrigger?.focus();
            break;
          }

          if (
            monthYearWheelPopover !== undefined &&
            (eventTarget as HTMLElement).classList.contains(
              "flatpickr-month-year-wheel-done"
            )
          ) {
            e.preventDefault();
            setMonthYearWheelPopoverOpen(false);
            monthYearWheelTrigger?.focus();
            break;
          }

          if (
            eventTarget === self.prevMonthNav ||
            eventTarget === self.nextMonthNav
          ) {
            e.preventDefault();
            changeMonth(eventTarget === self.prevMonthNav ? -1 : 1);
            break;
          }

          if (isTimeObj) {
            e.preventDefault();
            updateTime();
            focusAndClose();
          } else selectDate(e);

          break;

        case 32:
          if (eventTarget === keyboardHelpButton) {
            e.preventDefault();
            const isOpen =
              keyboardHelpButton.getAttribute("aria-expanded") === "true";
            setKeyboardHelpOpen(!isOpen);
            break;
          }

          if (
            eventTarget === self.prevMonthNav ||
            eventTarget === self.nextMonthNav
          ) {
            e.preventDefault();
            changeMonth(eventTarget === self.prevMonthNav ? -1 : 1);
          } else if (!isInput && !isTimeObj && isInView(eventTarget as Element)) {
            e.preventDefault();
            selectDate(e);
          }
          break;

        case 27: // escape
          if (
            keyboardHelpPanel &&
            keyboardHelpButton &&
            keyboardHelpPanel.getAttribute("hidden") === null
          ) {
            e.preventDefault();
            setKeyboardHelpOpen(false);
            keyboardHelpButton.focus();
            break;
          }

          e.preventDefault();
          focusAndClose();
          break;

        case 8:
        case 46:
          if (isInput && !self.config.allowInput) {
            e.preventDefault();
            self.clear();
          }
          break;

        case 33:
        case 34: {
          if (isInput || isTimeObj || self.config.noCalendar) {
            break;
          }

          const target = eventTarget as HTMLElement;
          const isDayTarget =
            !!self.daysContainer &&
            self.daysContainer.contains(target) &&
            (target as DayElement).$i !== undefined;

          if (!isDayTarget) {
            break;
          }

          e.preventDefault();
          changeMonth(e.keyCode === 34 ? 1 : -1, true, true);
          focusOnDay(getFirstAvailableDay(1), 0);
          break;
        }

        case 37:
        case 39:
          if (!isTimeObj && !isInput) {
            e.preventDefault();

            const activeElement = getClosestActiveElement();
            if (
              self.daysContainer !== undefined &&
              (allowInput === false ||
                (activeElement && isInView(activeElement)))
            ) {
              const delta = e.keyCode === 39 ? 1 : -1;

              if (!e.ctrlKey) focusOnDay(undefined, delta);
              else {
                e.stopPropagation();
                changeMonth(delta);
                focusOnDay(getFirstAvailableDay(1), 0);
              }
            }
          } else if (self.hourElement) self.hourElement.focus();

          break;

        case 38:
        case 40:
          e.preventDefault();
          const delta = e.keyCode === 40 ? 1 : -1;
          if (
            (self.daysContainer &&
              (eventTarget as DayElement).$i !== undefined) ||
            eventTarget === self.input ||
            eventTarget === self.altInput
          ) {
            if (e.ctrlKey) {
              e.stopPropagation();
              changeYear(self.currentYear - delta);
              focusOnDay(getFirstAvailableDay(1), 0);
            } else if (!isTimeObj) focusOnDay(undefined, delta * 7);
          } else if (eventTarget === self.currentYearElement) {
            changeYear(self.currentYear - delta);
          } else if (self.config.enableTime) {
            if (!isTimeObj && self.hourElement) self.hourElement.focus();
            updateTime(e);
            self._debouncedChange();
          }

          break;

        case 9:
          if (e.defaultPrevented) {
            break;
          }

          if (
            (timeWheelPopover !== undefined &&
              timeWheelPopover.contains(eventTarget as Node)) ||
            (monthYearWheelPopover !== undefined &&
              monthYearWheelPopover.contains(eventTarget as Node))
          ) {
            // Popover-specific focus traps handle Tab navigation internally.
            break;
          }

          if (
            self.isOpen ||
            (self.config.enableTime === true && self.config.noCalendar === true)
          ) {
            const firstDay = !self.config.noCalendar
              ? getPreferredTabDay()
              : undefined;

            const isDayInGrid =
              !self.config.noCalendar &&
              !!self.daysContainer &&
              self.daysContainer.contains(eventTarget as Node);

            const prevMonthEnabled =
              !self.config.noCalendar &&
              self.config.showMonthNavArrows &&
              self.prevMonthNav &&
              !self.prevMonthNav.classList.contains("flatpickr-disabled")
                ? self.prevMonthNav
                : undefined;

            const nextMonthEnabled =
              !self.config.noCalendar &&
              self.config.showMonthNavArrows &&
              self.nextMonthNav &&
              !self.nextMonthNav.classList.contains("flatpickr-disabled")
                ? self.nextMonthNav
                : undefined;

            const headerPrimary = !self.config.noCalendar
              ? (self.config.monthYearWheel
                  ? monthYearWheelTrigger
                  : self.monthsDropdownContainer || self.currentYearElement || prevMonthEnabled)
              : undefined;

            const tabOrder = ([
              prevMonthEnabled,
              headerPrimary,
              nextMonthEnabled,
              firstDay,
              timeWheelTrigger || getTimeWheelFocusTarget(),
              timeWheelTrigger ? undefined : self.minuteElement,
              timeWheelTrigger ? undefined : self.secondElement,
              timeWheelTrigger ? undefined : self.amPM,
              timeWheelPopover
                ? ((timeWheelPopover.querySelector(
                    ".flatpickr-time-wheel-done"
                  ) as HTMLElement | null) || undefined)
                : undefined,
              !self.config.noCalendar ? keyboardHelpButton : undefined,
              !self.config.noCalendar ? self.closeButton : undefined,
            ] as (HTMLElement | undefined)[])
              .concat(self.pluginElements as HTMLElement[])
              .filter((el): el is HTMLElement => {
                if (!el) return false;
                const isDisabled =
                  (el as HTMLInputElement).disabled === true ||
                  el.classList.contains("flatpickr-disabled");
                const isHidden = el.closest("[hidden]") !== null;
                const isConnected = el.isConnected;
                const isProgrammaticDayTarget = el.classList.contains("flatpickr-day");
                return (
                  isConnected &&
                  !isDisabled &&
                  !isHidden &&
                  (el.tabIndex >= 0 || isProgrammaticDayTarget)
                );
              })
              .filter((el, index, arr) => arr.indexOf(el) === index);

            if (isInput && tabOrder.length > 0) {
              e.preventDefault();
              if (self.config.enableTime === true && self.config.noCalendar === true) {
                setTimeWheelPopoverOpen(true);
              }
              (headerPrimary || tabOrder[0]).focus();
            } else if (isDayInGrid) {
              e.preventDefault();
              if (e.shiftKey) {
                (nextMonthEnabled || headerPrimary || prevMonthEnabled || self._input).focus();
              } else {
                (
                  timeWheelTrigger ||
                  getTimeWheelFocusTarget() ||
                  self.hourElement ||
                  self.minuteElement ||
                  self.secondElement ||
                  self.amPM ||
                  self.closeButton ||
                  self._input
                ).focus();
              }
            } else {
              const i = tabOrder.indexOf(eventTarget as HTMLElement);
              if (i !== -1) {
                e.preventDefault();
                let next = tabOrder[i + (e.shiftKey ? -1 : 1)];

                if (!next) {
                  next = e.shiftKey
                    ? tabOrder[tabOrder.length - 1]
                    : tabOrder[0];
                }

                (next || self._input).focus();
              }
            }
          }

          break;

        case 77: // m
          if (!isInput && !isTimeObj && !self.config.noCalendar) {
            e.preventDefault();
            (
              monthYearWheelTrigger ||
              self.monthsDropdownContainer ||
              self.currentYearElement ||
              self.prevMonthNav ||
              self._input
            ).focus();
          }

          break;

        default:
          break;
      }
    }

    if (self.amPM !== undefined && eventTarget === self.amPM) {
      switch (e.key) {
        case self.l10n.amPM[0].charAt(0):
        case self.l10n.amPM[0].charAt(0).toLowerCase():
          self.amPM.textContent = self.l10n.amPM[0];
          setHoursFromInputs();
          updateValue();

          break;

        case self.l10n.amPM[1].charAt(0):
        case self.l10n.amPM[1].charAt(0).toLowerCase():
          self.amPM.textContent = self.l10n.amPM[1];
          setHoursFromInputs();
          updateValue();

          break;
      }
    }

    if (isInput || isCalendarElem(eventTarget as HTMLElement)) {
      triggerEvent("onKeyDown", e);
    }
  }

  function onMouseOver(elem?: DayElement, cellClass = "flatpickr-day") {
    if (
      self.selectedDates.length !== 1 ||
      (elem &&
        (!elem.classList.contains(cellClass) ||
          elem.classList.contains("flatpickr-disabled")))
    )
      return;

    const hoverDate = elem
        ? elem.dateObj.getTime()
        : (self.days.firstElementChild as DayElement).dateObj.getTime(),
      initialDate = (self.parseDate(
        self.selectedDates[0],
        undefined,
        true
      ) as Date).getTime(),
      rangeStartDate = Math.min(hoverDate, self.selectedDates[0].getTime()),
      rangeEndDate = Math.max(hoverDate, self.selectedDates[0].getTime());

    let containsDisabled = false;

    let minRange = 0,
      maxRange = 0;

    for (let t = rangeStartDate; t < rangeEndDate; t += duration.DAY) {
      if (!isEnabled(new Date(t), true)) {
        containsDisabled =
          containsDisabled || (t > rangeStartDate && t < rangeEndDate);

        if (t < initialDate && (!minRange || t > minRange)) minRange = t;
        else if (t > initialDate && (!maxRange || t < maxRange)) maxRange = t;
      }
    }

    const hoverableCells = Array.from(
      self.rContainer!.querySelectorAll(
        `*:nth-child(-n+${self.config.showMonths}) > .${cellClass}`
      )
    ) as DayElement[];

    hoverableCells.forEach((dayElem) => {
      const date = dayElem.dateObj;

      const timestamp = date.getTime();

      const outOfRange =
        (minRange > 0 && timestamp < minRange) ||
        (maxRange > 0 && timestamp > maxRange);

      if (outOfRange) {
        dayElem.classList.add("notAllowed");
        ["inRange", "startRange", "endRange"].forEach((c) => {
          dayElem.classList.remove(c);
        });
        return;
      } else if (containsDisabled && !outOfRange) return;

      ["startRange", "inRange", "endRange", "notAllowed"].forEach((c) => {
        dayElem.classList.remove(c);
      });

      if (elem !== undefined) {
        elem.classList.add(
          hoverDate <= self.selectedDates[0].getTime()
            ? "startRange"
            : "endRange"
        );

        if (initialDate < hoverDate && timestamp === initialDate)
          dayElem.classList.add("startRange");
        else if (initialDate > hoverDate && timestamp === initialDate)
          dayElem.classList.add("endRange");
        if (
          timestamp >= minRange &&
          (maxRange === 0 || timestamp <= maxRange) &&
          isBetween(timestamp, initialDate, hoverDate)
        )
          dayElem.classList.add("inRange");
      }
    });
  }

  function onResize() {
    if (self.isOpen && !self.config.static && !self.config.inline)
      positionCalendar();
  }

  function open(
    e?: FocusEvent | MouseEvent,
    positionElement = self._positionElement
  ) {
    if (self.isMobile === true) {
      const isTimeOnlyInput =
        self.config.enableTime === true && self.config.noCalendar === true;

      if (e) {
        e.preventDefault();
        const eventTarget = getEventTarget(e);
        if (eventTarget) {
          (eventTarget as HTMLInputElement).blur();
        }
      }

      if (self.mobileInput !== undefined) {
        if (isTimeOnlyInput) {
          self.mobileInput.focus();
        }
        self.mobileInput.click();
      }

      triggerEvent("onOpen");
      return;
    } else if (self._input.disabled || self.config.inline) {
      return;
    }

    const wasOpen = self.isOpen;

    self.isOpen = true;

    if (!wasOpen) {
      self.calendarContainer.classList.add("open");
      self._input.classList.add("active");
      self._input.setAttribute("aria-expanded", "true");
      self.calendarContainer.setAttribute("aria-hidden", "false");
      triggerEvent("onOpen");
      positionCalendar(positionElement);
      announce(
        `${monthToStr(
          self.currentMonth,
          self.config.shorthandCurrentMonth,
          self.l10n
        )} ${self.currentYear}`
      );
    }

    if (self.config.enableTime === true && self.config.noCalendar === true) {
      setTimeWheelPopoverOpen(true);

      if (
        self.config.allowInput === false &&
        (e === undefined ||
          !(self.timeContainer as HTMLDivElement).contains(
            e.relatedTarget as Node
          ))
      ) {
        setTimeout(() => (self.hourElement as HTMLInputElement).select(), 50);
      }
    }
  }

  function minMaxDateSetter(type: "min" | "max") {
    return (date: DateOption) => {
      const dateObj = (self.config[
        `_${type}Date` as "_minDate" | "_maxDate"
      ] = self.parseDate(date, self.config.dateFormat));

      const inverseDateObj =
        self.config[
          `_${type === "min" ? "max" : "min"}Date` as "_minDate" | "_maxDate"
        ];

      if (dateObj !== undefined) {
        self[type === "min" ? "minDateHasTime" : "maxDateHasTime"] =
          (dateObj as Date).getHours() > 0 ||
          (dateObj as Date).getMinutes() > 0 ||
          (dateObj as Date).getSeconds() > 0;
      }

      if (self.selectedDates) {
        self.selectedDates = self.selectedDates.filter((d) => isEnabled(d));
        if (!self.selectedDates.length && type === "min")
          setHoursFromDate(dateObj);
        updateValue();
      }

      if (self.daysContainer) {
        redraw();

        if (dateObj !== undefined)
          self.currentYearElement[type] = dateObj.getFullYear().toString();
        else self.currentYearElement.removeAttribute(type);

        self.currentYearElement.disabled =
          !!inverseDateObj &&
          dateObj !== undefined &&
          inverseDateObj.getFullYear() === dateObj.getFullYear();
      }
    };
  }

  function parseConfig() {
    const boolOpts: (keyof Options)[] = [
      "wrap",
      "weekNumbers",
      "allowInput",
      "allowInvalidPreload",
      "clickOpens",
      "time_24hr",
      "enableTime",
      "noCalendar",
      "altInput",
      "shorthandCurrentMonth",
      "inline",
      "static",
      "enableSeconds",
      "disableMobile",
      "monthYearWheel",
      "showMonthNavArrows",
      "yearWheelManualInput",
    ];

    const userConfig = {
      ...JSON.parse(JSON.stringify(element.dataset || {})),
      ...instanceConfig,
    } as Options;

    const formats = {} as Record<"dateFormat" | "altFormat", string>;

    self.config.parseDate = userConfig.parseDate;
    self.config.formatDate = userConfig.formatDate;

    Object.defineProperty(self.config, "enable", {
      get: () => self.config._enable,
      set: (dates) => {
        self.config._enable = parseDateRules(dates);
      },
    });

    Object.defineProperty(self.config, "disable", {
      get: () => self.config._disable,
      set: (dates) => {
        self.config._disable = parseDateRules(dates);
      },
    });

    const timeMode = userConfig.mode === "time";

    if (!userConfig.dateFormat && (userConfig.enableTime || timeMode)) {
      const defaultDateFormat =
        flatpickr.defaultConfig.dateFormat || defaultOptions.dateFormat;
      formats.dateFormat =
        userConfig.noCalendar || timeMode
          ? "H:i" + (userConfig.enableSeconds ? ":S" : "")
          : defaultDateFormat + " H:i" + (userConfig.enableSeconds ? ":S" : "");
    }

    if (
      userConfig.altInput &&
      (userConfig.enableTime || timeMode) &&
      !userConfig.altFormat
    ) {
      const defaultAltFormat =
        flatpickr.defaultConfig.altFormat || defaultOptions.altFormat;
      formats.altFormat =
        userConfig.noCalendar || timeMode
          ? "h:i" + (userConfig.enableSeconds ? ":S K" : " K")
          : defaultAltFormat + ` h:i${userConfig.enableSeconds ? ":S" : ""} K`;
    }

    Object.defineProperty(self.config, "minDate", {
      get: () => self.config._minDate,
      set: minMaxDateSetter("min"),
    });

    Object.defineProperty(self.config, "maxDate", {
      get: () => self.config._maxDate,
      set: minMaxDateSetter("max"),
    });

    const minMaxTimeSetter = (type: string) => (val: any) => {
      self.config[type === "min" ? "_minTime" : "_maxTime"] = self.parseDate(
        val,
        "H:i:S"
      );
    };

    Object.defineProperty(self.config, "minTime", {
      get: () => self.config._minTime,
      set: minMaxTimeSetter("min"),
    });

    Object.defineProperty(self.config, "maxTime", {
      get: () => self.config._maxTime,
      set: minMaxTimeSetter("max"),
    });

    if (userConfig.mode === "time") {
      self.config.noCalendar = true;
      self.config.enableTime = true;
    }

    Object.assign(self.config, formats, userConfig);

    for (let i = 0; i < boolOpts.length; i++)
      // https://github.com/microsoft/TypeScript/issues/31663
      (self.config as any)[boolOpts[i]] =
        self.config[boolOpts[i]] === true ||
        self.config[boolOpts[i]] === "true";

    // Month/year wheel is now the default and only header interaction model.
    self.config.monthYearWheel = true;

    if (userConfig.yearRange && typeof userConfig.yearRange === "object") {
      const range = userConfig.yearRange as { past?: number; future?: number };
      self.config.yearRange = {
        past: Math.max(0, Number(range.past || self.config.yearRange.past)),
        future: Math.max(0, Number(range.future || self.config.yearRange.future)),
      };
    }

    // Always use the custom, accessible time popover when time selection is enabled.
    if (self.config.enableTime) {
      self.config.disableMobile = true;
    }


    HOOKS.filter((hook) => self.config[hook] !== undefined).forEach((hook) => {
      self.config[hook] = arrayify(self.config[hook] || []).map(bindToInstance);
    });

    self.isMobile =
      !self.config.disableMobile &&
      !self.config.inline &&
      self.config.mode === "single" &&
      !self.config.disable.length &&
      !self.config.enable &&
      !self.config.weekNumbers &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    for (let i = 0; i < self.config.plugins.length; i++) {
      const pluginConf = self.config.plugins[i](self) || ({} as Options);
      for (const key in pluginConf) {
        if (HOOKS.indexOf(key as HookKey) > -1) {
          (self.config as any)[key] = arrayify(
            pluginConf[key as HookKey] as Hook
          )
            .map(bindToInstance)
            .concat(self.config[key as HookKey]);
        } else if (typeof userConfig[key as keyof Options] === "undefined")
          (self.config as any)[key] = pluginConf[key as keyof Options] as any;
      }
    }

    if (!userConfig.altInputClass) {
      self.config.altInputClass =
        getInputElem().className + " " + self.config.altInputClass;
    }

    triggerEvent("onParseConfig");
  }

  function getInputElem() {
    return self.config.wrap
      ? (element.querySelector("[data-input]") as HTMLInputElement)
      : (element as HTMLInputElement);
  }

  function setupLocale() {
    if (
      typeof self.config.locale !== "object" &&
      typeof flatpickr.l10ns[self.config.locale as LocaleKey] === "undefined"
    )
      self.config.errorHandler(
        new Error(`flatpickr: invalid locale ${self.config.locale}`)
      );

    self.l10n = {
      ...(flatpickr.l10ns.default as Locale),
      ...(typeof self.config.locale === "object"
        ? self.config.locale
        : self.config.locale !== "default"
        ? flatpickr.l10ns[self.config.locale as LocaleKey]
        : undefined),
    };

    tokenRegex.D = `(${self.l10n.weekdays.shorthand.join("|")})`;
    tokenRegex.l = `(${self.l10n.weekdays.longhand.join("|")})`;
    tokenRegex.M = `(${self.l10n.months.shorthand.join("|")})`;
    tokenRegex.F = `(${self.l10n.months.longhand.join("|")})`;
    tokenRegex.K = `(${self.l10n.amPM[0]}|${
      self.l10n.amPM[1]
    }|${self.l10n.amPM[0].toLowerCase()}|${self.l10n.amPM[1].toLowerCase()})`;

    const userConfig = {
      ...instanceConfig,
      ...JSON.parse(JSON.stringify(element.dataset || {})),
    } as Options;

    if (
      userConfig.time_24hr === undefined &&
      flatpickr.defaultConfig.time_24hr === undefined
    ) {
      self.config.time_24hr = self.l10n.time_24hr;
    }

    self.formatDate = createDateFormatter(self);
    self.parseDate = createDateParser({ config: self.config, l10n: self.l10n });
  }

  function positionCalendar(customPositionElement?: HTMLElement) {
    if (typeof self.config.position === "function") {
      return void self.config.position(self, customPositionElement);
    }
    if (self.calendarContainer === undefined) return;

    triggerEvent("onPreCalendarPosition");
    const positionElement = customPositionElement || self._positionElement;

    const calendarHeight = Array.prototype.reduce.call(
        self.calendarContainer.children,
        ((acc: number, child: HTMLElement) => acc + child.offsetHeight) as any,
        0
      ) as number,
      calendarWidth = self.calendarContainer.offsetWidth,
      configPos = self.config.position.split(" "),
      configPosVertical = configPos[0],
      configPosHorizontal = configPos.length > 1 ? configPos[1] : null,
      inputBounds = positionElement.getBoundingClientRect(),
      distanceFromBottom = window.innerHeight - inputBounds.bottom,
      showOnTop =
        configPosVertical === "above" ||
        (configPosVertical !== "below" &&
          distanceFromBottom < calendarHeight &&
          inputBounds.top > calendarHeight);

    const top =
      window.pageYOffset +
      inputBounds.top +
      (!showOnTop ? positionElement.offsetHeight + 2 : -calendarHeight - 2);

    toggleClass(self.calendarContainer, "arrowTop", !showOnTop);
    toggleClass(self.calendarContainer, "arrowBottom", showOnTop);

    if (self.config.inline) return;

    let left = window.pageXOffset + inputBounds.left;
    let isCenter = false;
    let isRight = false;

    if (configPosHorizontal === "center") {
      left -= (calendarWidth - inputBounds.width) / 2;
      isCenter = true;
    } else if (configPosHorizontal === "right") {
      left -= calendarWidth - inputBounds.width;
      isRight = true;
    }

    toggleClass(self.calendarContainer, "arrowLeft", !isCenter && !isRight);
    toggleClass(self.calendarContainer, "arrowCenter", isCenter);
    toggleClass(self.calendarContainer, "arrowRight", isRight);

    const right =
      window.document.body.offsetWidth -
      (window.pageXOffset + inputBounds.right);
    const rightMost = left + calendarWidth > window.document.body.offsetWidth;
    const centerMost = right + calendarWidth > window.document.body.offsetWidth;

    toggleClass(self.calendarContainer, "rightMost", rightMost);

    if (self.config.static) return;

    self.calendarContainer.style.top = `${top}px`;

    if (!rightMost) {
      self.calendarContainer.style.left = `${left}px`;
      self.calendarContainer.style.right = "auto";
    } else if (!centerMost) {
      self.calendarContainer.style.left = "auto";
      self.calendarContainer.style.right = `${right}px`;
    } else {
      const doc = getDocumentStyleSheet() as CSSStyleSheet;
      // some testing environments don't have css support
      if (doc === undefined) return;
      const bodyWidth = window.document.body.offsetWidth;
      const centerLeft = Math.max(0, bodyWidth / 2 - calendarWidth / 2);
      const centerBefore = ".flatpickr-calendar.centerMost:before";
      const centerAfter = ".flatpickr-calendar.centerMost:after";
      const centerIndex = doc.cssRules.length;
      const centerStyle = `{left:${inputBounds.left}px;right:auto;}`;
      toggleClass(self.calendarContainer, "rightMost", false);
      toggleClass(self.calendarContainer, "centerMost", true);
      doc.insertRule(
        `${centerBefore},${centerAfter}${centerStyle}`,
        centerIndex
      );
      self.calendarContainer.style.left = `${centerLeft}px`;
      self.calendarContainer.style.right = "auto";
    }
  }

  function getDocumentStyleSheet() {
    let editableSheet = null;
    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i] as CSSStyleSheet;
      if (!sheet.cssRules) continue;
      try {
        sheet.cssRules;
      } catch (err) {
        continue;
      }
      editableSheet = sheet;
      break;
    }
    return editableSheet != null ? editableSheet : createStyleSheet();
  }

  function createStyleSheet() {
    const style = document.createElement("style");
    document.head.appendChild(style);
    return style.sheet as CSSStyleSheet;
  }

  function redraw() {
    if (self.config.noCalendar || self.isMobile) return;

    buildMonthSwitch();
    updateNavigationCurrentMonth();
    buildDays();
  }

  function focusAndClose() {
    self._input.focus();

    const nav = navigator as Navigator & { msMaxTouchPoints?: number };

    if (
      window.navigator.userAgent.indexOf("MSIE") !== -1 ||
      nav.msMaxTouchPoints !== undefined
    ) {
      // hack - bugs in the way IE handles focus keeps the calendar open
      setTimeout(self.close, 0);
    } else {
      self.close();
    }
  }

  function selectDate(e: MouseEvent | KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();

    const isKeyboardSelection = e.type === "keydown";

    const isSelectable = (day: Element) =>
      day.classList &&
      day.classList.contains("flatpickr-day") &&
      !day.classList.contains("flatpickr-disabled") &&
      !day.classList.contains("notAllowed");

    const t = findParent(getEventTarget(e) as Element, isSelectable);

    if (t === undefined) return;

    const target = t as DayElement;

    const selectedDate = (self.latestSelectedDateObj = new Date(
      target.dateObj.getTime()
    ));

    const shouldChangeMonth =
      (selectedDate.getMonth() < self.currentMonth ||
        selectedDate.getMonth() >
          self.currentMonth + self.config.showMonths - 1) &&
      self.config.mode !== "range";

    self.selectedDateElem = target;

    if (self.config.mode === "single") self.selectedDates = [selectedDate];
    else if (self.config.mode === "multiple") {
      const selectedIndex = isDateSelected(selectedDate);

      if (selectedIndex) self.selectedDates.splice(parseInt(selectedIndex), 1);
      else self.selectedDates.push(selectedDate);
    } else if (self.config.mode === "range") {
      if (self.selectedDates.length === 2) {
        self.clear(false, false);
      }
      self.latestSelectedDateObj = selectedDate;
      self.selectedDates.push(selectedDate);

      // unless selecting same date twice, sort ascendingly
      if (compareDates(selectedDate, self.selectedDates[0], true) !== 0)
        self.selectedDates.sort((a, b) => a.getTime() - b.getTime());
    }

    setHoursFromInputs();

    if (shouldChangeMonth) {
      const isNewYear = self.currentYear !== selectedDate.getFullYear();
      self.currentYear = selectedDate.getFullYear();
      self.currentMonth = selectedDate.getMonth();

      if (isNewYear) {
        triggerEvent("onYearChange");
        buildMonthSwitch();
      }

      triggerEvent("onMonthChange");
    }

    updateNavigationCurrentMonth();
    buildDays();

    updateValue();

    const focusedDayAfterBuild = self.selectedDateElem;

    // maintain focus
    if (
      !shouldChangeMonth &&
      self.config.mode !== "range" &&
      self.config.showMonths === 1 &&
      focusedDayAfterBuild !== undefined
    )
      focusOnDayElem(focusedDayAfterBuild);
    else if (
      focusedDayAfterBuild !== undefined &&
      self.hourElement === undefined
    ) {
      focusedDayAfterBuild.focus();
    }

    if (self.hourElement !== undefined && isKeyboardSelection)
      self.hourElement !== undefined && self.hourElement.focus();

    if (self.config.closeOnSelect) {
      const single = self.config.mode === "single" && !self.config.enableTime;
      const range =
        self.config.mode === "range" &&
        self.selectedDates.length === 2 &&
        !self.config.enableTime;

      if (single || range) {
        focusAndClose();
      }
    }
    triggerChange();
  }

  const CALLBACKS: { [k in keyof Options]: Function[] } = {
    locale: [setupLocale, updateWeekdays],
    showMonths: [buildMonths, setCalendarWidth, buildWeekdays],
    minDate: [jumpToDate],
    maxDate: [jumpToDate],
    positionElement: [updatePositionElement],
    clickOpens: [
      () => {
        if (self.config.clickOpens === true) {
          bind(self._input, "focus", self.open);
          bind(self._input, "click", self.open);
        } else {
          self._input.removeEventListener("focus", self.open);
          self._input.removeEventListener("click", self.open);
        }
      },
    ],
  };

  function set<K extends keyof Options>(
    option: K | { [k in K]?: Options[k] },
    value?: any
  ) {
    if (option !== null && typeof option === "object") {
      Object.assign(self.config, option);
      for (const key in option) {
        if (CALLBACKS[key] !== undefined)
          (CALLBACKS[key] as Function[]).forEach((x) => x());
      }
    } else {
      self.config[option] = value;

      if (CALLBACKS[option] !== undefined)
        (CALLBACKS[option] as Function[]).forEach((x) => x());
      else if (HOOKS.indexOf(option as HookKey) > -1)
        (self.config as any)[option] = arrayify(value);
    }

    self.redraw();
    updateValue(true);
  }

  function setSelectedDate(
    inputDate: DateOption | DateOption[],
    format?: string
  ) {
    let dates: (Date | undefined)[] = [];
    if (inputDate instanceof Array)
      dates = inputDate.map((d) => self.parseDate(d, format));
    else if (inputDate instanceof Date || typeof inputDate === "number")
      dates = [self.parseDate(inputDate, format)];
    else if (typeof inputDate === "string") {
      switch (self.config.mode) {
        case "single":
        case "time":
          dates = [self.parseDate(inputDate, format)];
          break;

        case "multiple":
          dates = inputDate
            .split(self.config.conjunction)
            .map((date) => self.parseDate(date, format));
          break;

        case "range":
          dates = inputDate
            .split(self.l10n.rangeSeparator)
            .map((date) => self.parseDate(date, format));

          break;

        default:
          break;
      }
    } else
      self.config.errorHandler(
        new Error(`Invalid date supplied: ${JSON.stringify(inputDate)}`)
      );

    self.selectedDates = (self.config.allowInvalidPreload
      ? dates
      : dates.filter(
          (d) => d instanceof Date && isEnabled(d, false)
        )) as Date[];

    if (self.config.mode === "range")
      self.selectedDates.sort((a, b) => a.getTime() - b.getTime());
  }

  function setDate(
    date: DateOption | DateOption[],
    triggerChange = false,
    format = self.config.dateFormat
  ) {
    if ((date !== 0 && !date) || (date instanceof Array && date.length === 0))
      return self.clear(triggerChange);

    setSelectedDate(date, format);

    self.latestSelectedDateObj =
      self.selectedDates[self.selectedDates.length - 1];

    self.redraw();
    jumpToDate(undefined, triggerChange);

    setHoursFromDate();
    if (self.selectedDates.length === 0) {
      self.clear(false);
    }
    updateValue(triggerChange);

    if (triggerChange) triggerEvent("onChange");
  }

  function parseDateRules(arr: DateLimit[]): DateLimit<Date>[] {
    return arr
      .slice()
      .map((rule) => {
        if (
          typeof rule === "string" ||
          typeof rule === "number" ||
          rule instanceof Date
        ) {
          return self.parseDate(
            rule as Date | string | number,
            undefined,
            true
          ) as Date;
        } else if (
          rule &&
          typeof rule === "object" &&
          (rule as DateRangeLimit).from &&
          (rule as DateRangeLimit).to
        )
          return {
            from: self.parseDate(
              (rule as DateRangeLimit).from,
              undefined
            ) as Date,
            to: self.parseDate((rule as DateRangeLimit).to, undefined) as Date,
          };

        return rule;
      })
      .filter((x) => x) as DateLimit<Date>[]; // remove falsy values
  }

  function setupDates() {
    self.selectedDates = [];
    self.now = self.parseDate(self.config.now) || new Date();

    // Workaround IE11 setting placeholder as the input's value
    const preloadedDate =
      self.config.defaultDate ||
      ((self.input.nodeName === "INPUT" ||
        self.input.nodeName === "TEXTAREA") &&
      self.input.placeholder &&
      self.input.value === self.input.placeholder
        ? null
        : self.input.value);

    if (preloadedDate) setSelectedDate(preloadedDate, self.config.dateFormat);

    self._initialDate =
      self.selectedDates.length > 0
        ? self.selectedDates[0]
        : self.config.minDate &&
          self.config.minDate.getTime() > self.now.getTime()
        ? self.config.minDate
        : self.config.maxDate &&
          self.config.maxDate.getTime() < self.now.getTime()
        ? self.config.maxDate
        : self.now;

    self.currentYear = self._initialDate.getFullYear();
    self.currentMonth = self._initialDate.getMonth();

    if (self.selectedDates.length > 0)
      self.latestSelectedDateObj = self.selectedDates[0];

    if (self.config.minTime !== undefined)
      self.config.minTime = self.parseDate(self.config.minTime, "H:i");

    if (self.config.maxTime !== undefined)
      self.config.maxTime = self.parseDate(self.config.maxTime, "H:i");

    self.minDateHasTime =
      !!self.config.minDate &&
      (self.config.minDate.getHours() > 0 ||
        self.config.minDate.getMinutes() > 0 ||
        self.config.minDate.getSeconds() > 0);

    self.maxDateHasTime =
      !!self.config.maxDate &&
      (self.config.maxDate.getHours() > 0 ||
        self.config.maxDate.getMinutes() > 0 ||
        self.config.maxDate.getSeconds() > 0);
  }

  function setupInputs() {
    self.input = getInputElem();

    /* istanbul ignore next */
    if (!self.input) {
      self.config.errorHandler(new Error("Invalid input element specified"));
      return;
    }

    // hack: store previous type to restore it after destroy()
    (self.input as any)._type = (self.input as any).type;
    (self.input as any).type = "text";

    self.input.classList.add("flatpickr-input");
    self._input = self.input;

    if (self.config.altInput) {
      // replicate self.element
      self.altInput = createElement<HTMLInputElement>(
        self.input.nodeName as "input",
        self.config.altInputClass
      );
      self._input = self.altInput;
      self.altInput.placeholder = self.input.placeholder;
      self.altInput.disabled = self.input.disabled;
      self.altInput.required = self.input.required;
      self.altInput.tabIndex = self.input.tabIndex;
      self.altInput.type = "text";
      self.input.setAttribute("type", "hidden");

      if (!self.config.static && self.input.parentNode)
        self.input.parentNode.insertBefore(
          self.altInput,
          self.input.nextSibling
        );
    }

    if (!self.config.allowInput)
      self._input.setAttribute("readonly", "readonly");

    updatePositionElement();
  }

  function updatePositionElement() {
    self._positionElement = self.config.positionElement || self._input;
  }

  function setupMobile() {
    const inputType = self.config.enableTime
      ? self.config.noCalendar
        ? "time"
        : "datetime-local"
      : "date";

    self.mobileInput = createElement<HTMLInputElement>(
      "input",
      self.input.className + " flatpickr-mobile"
    );
    self.mobileInput.tabIndex = 1;
    self.mobileInput.type = inputType;
    self.mobileInput.disabled = self.input.disabled;
    self.mobileInput.required = self.input.required;
    self.mobileInput.placeholder = self.input.placeholder;

    self.mobileFormatStr =
      inputType === "datetime-local"
        ? "Y-m-d\\TH:i:S"
        : inputType === "date"
        ? "Y-m-d"
        : "H:i:S";

    if (self.selectedDates.length > 0) {
      self.mobileInput.defaultValue = self.mobileInput.value = self.formatDate(
        self.selectedDates[0],
        self.mobileFormatStr
      );
    }

    if (self.config.minDate)
      self.mobileInput.min = self.formatDate(self.config.minDate, "Y-m-d");

    if (self.config.maxDate)
      self.mobileInput.max = self.formatDate(self.config.maxDate, "Y-m-d");

    if (self.input.getAttribute("step"))
      self.mobileInput.step = String(self.input.getAttribute("step"));

    self.input.type = "hidden";
    if (self.altInput !== undefined) self.altInput.type = "hidden";

    try {
      if (self.input.parentNode)
        self.input.parentNode.insertBefore(
          self.mobileInput,
          self.input.nextSibling
        );
    } catch {}

    bind(self.mobileInput, "change", (e: KeyboardEvent) => {
      self.setDate(
        (getEventTarget(e) as HTMLInputElement).value,
        false,
        self.mobileFormatStr
      );
      triggerEvent("onChange");
      triggerEvent("onClose");
    });
  }

  function toggle(e?: FocusEvent | MouseEvent) {
    if (self.isOpen === true) return self.close();
    self.open(e);
  }

  function triggerEvent(event: HookKey, data?: any) {
    // If the instance has been destroyed already, all hooks have been removed
    if (self.config === undefined) return;

    const hooks = self.config[event];

    if (hooks !== undefined && hooks.length > 0) {
      for (let i = 0; hooks[i] && i < hooks.length; i++)
        hooks[i](self.selectedDates, self.input.value, self, data);
    }

    if (event === "onChange") {
      self.input.dispatchEvent(createEvent("change"));

      // many front-end frameworks bind to the input event
      self.input.dispatchEvent(createEvent("input"));

      const selectedDateText = getDateStr();
      if (selectedDateText) {
        announce(`Selected date: ${selectedDateText}`);
      }
    }
  }

  function createEvent(name: string): Event {
    const e = document.createEvent("Event");
    e.initEvent(name, true, true);
    return e;
  }

  function isDateSelected(date: Date) {
    for (let i = 0; i < self.selectedDates.length; i++) {
      const selectedDate = self.selectedDates[i];
      if (
        selectedDate instanceof Date &&
        compareDates(selectedDate, date) === 0
      )
        return "" + i;
    }

    return false;
  }

  function isDateInRange(date: Date) {
    if (self.config.mode !== "range" || self.selectedDates.length < 2)
      return false;
    return (
      compareDates(date, self.selectedDates[0]) >= 0 &&
      compareDates(date, self.selectedDates[1]) <= 0
    );
  }

  function updateNavigationCurrentMonth() {
    if (self.config.noCalendar || self.isMobile || !self.monthNav) return;

    self.yearElements.forEach((yearElement, i) => {
      const d = new Date(self.currentYear, self.currentMonth, 1);
      d.setMonth(self.currentMonth + i);

      if (
        self.config.showMonths > 1 ||
        self.config.monthSelectorType === "static" ||
        self.config.monthYearWheel
      ) {
        const monthText = monthToStr(
          d.getMonth(),
          self.config.shorthandCurrentMonth,
          self.l10n
        );

        if (self.config.monthYearWheel && i > 0) {
          self.monthElements[i].textContent = `${monthText} ${d.getFullYear()}`;
        } else {
          self.monthElements[i].textContent = monthText + " ";
        }
      } else if (self.monthsDropdownContainer) {
        self.monthsDropdownContainer.value = d.getMonth().toString();
      }

      yearElement.value = d.getFullYear().toString();
    });

    if (self.config.monthYearWheel) {
      syncMonthYearWheelPopover();
    }

    self._hidePrevMonthArrow =
      self.config.minDate !== undefined &&
      (self.currentYear === self.config.minDate.getFullYear()
        ? self.currentMonth <= self.config.minDate.getMonth()
        : self.currentYear < self.config.minDate.getFullYear());

    self._hideNextMonthArrow =
      self.config.maxDate !== undefined &&
      (self.currentYear === self.config.maxDate.getFullYear()
        ? self.currentMonth + 1 > self.config.maxDate.getMonth()
        : self.currentYear > self.config.maxDate.getFullYear());

    announce(
      `${monthToStr(
        self.currentMonth,
        self.config.shorthandCurrentMonth,
        self.l10n
      )} ${self.currentYear}`
    );
  }

  function getDateStr(specificFormat?: string) {
    const format =
      specificFormat ||
      (self.config.altInput ? self.config.altFormat : self.config.dateFormat);

    return self.selectedDates
      .map((dObj) => self.formatDate(dObj, format))
      .filter(
        (d, i, arr) =>
          self.config.mode !== "range" ||
          self.config.enableTime ||
          arr.indexOf(d) === i
      )
      .join(
        self.config.mode !== "range"
          ? self.config.conjunction
          : self.l10n.rangeSeparator
      );
  }

  /**
   * Updates the values of inputs associated with the calendar
   */
  function updateValue(triggerChange = true) {
    if (self.mobileInput !== undefined && self.mobileFormatStr) {
      self.mobileInput.value =
        self.latestSelectedDateObj !== undefined
          ? self.formatDate(self.latestSelectedDateObj, self.mobileFormatStr)
          : "";
    }

    self.input.value = getDateStr(self.config.dateFormat);

    if (self.altInput !== undefined) {
      self.altInput.value = getDateStr(self.config.altFormat);
    }

    if (triggerChange !== false) triggerEvent("onValueUpdate");
  }

  function onMonthNavClick(e: MouseEvent) {
    const eventTarget = getEventTarget(e);

    const isPrevMonth = self.prevMonthNav.contains(eventTarget as Node);
    const isNextMonth = self.nextMonthNav.contains(eventTarget as Node);

    if (isPrevMonth || isNextMonth) {
      changeMonth(isPrevMonth ? -1 : 1);
    } else if (
      self.yearElements.indexOf(eventTarget as HTMLInputElement) >= 0
    ) {
      (eventTarget as HTMLInputElement).select();
    } else if ((eventTarget as Element).classList.contains("arrowUp")) {
      self.changeYear(self.currentYear + 1);
    } else if ((eventTarget as Element).classList.contains("arrowDown")) {
      self.changeYear(self.currentYear - 1);
    }
  }

  function timeWrapper(
    e: MouseEvent | KeyboardEvent | FocusEvent | IncrementEvent
  ): void {
    e.preventDefault();

    const isKeyDown = e.type === "keydown",
      eventTarget = getEventTarget(e),
      input = eventTarget as HTMLInputElement;

    if (self.amPM !== undefined && eventTarget === self.amPM) {
      self.amPM.textContent =
        self.l10n.amPM[int(self.amPM.textContent === self.l10n.amPM[0])];
    }

    const min = parseFloat(input.getAttribute("min") as string),
      max = parseFloat(input.getAttribute("max") as string),
      step = parseFloat(input.getAttribute("step") as string),
      curValue = parseInt(input.value, 10),
      delta =
        (e as IncrementEvent).delta ||
        (isKeyDown ? ((e as KeyboardEvent).which === 38 ? 1 : -1) : 0);

    let newValue = curValue + step * delta;

    if (typeof input.value !== "undefined" && input.value.length === 2) {
      const isHourElem = input === self.hourElement,
        isMinuteElem = input === self.minuteElement;

      if (newValue < min) {
        newValue =
          max +
          newValue +
          int(!isHourElem) +
          (int(isHourElem) && int(!self.amPM));

        if (isMinuteElem) incrementNumInput(undefined, -1, self.hourElement);
      } else if (newValue > max) {
        newValue =
          input === self.hourElement ? newValue - max - int(!self.amPM) : min;

        if (isMinuteElem) incrementNumInput(undefined, 1, self.hourElement);
      }

      if (
        self.amPM &&
        isHourElem &&
        (step === 1
          ? newValue + curValue === 23
          : Math.abs(newValue - curValue) > step)
      ) {
        self.amPM.textContent =
          self.l10n.amPM[int(self.amPM.textContent === self.l10n.amPM[0])];
      }

      input.value = pad(newValue);
    }
  }

  init();
  return self;
}

/* istanbul ignore next */
function _flatpickr(
  nodeList: ArrayLike<Node>,
  config?: Options
): Instance | Instance[] {
  // static list
  const nodes = Array.prototype.slice
    .call(nodeList)
    .filter((x) => x instanceof HTMLElement) as HTMLElement[];

  const instances: Instance[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    try {
      if (node.getAttribute("data-fp-omit") !== null) continue;

      if (node._flatpickr !== undefined) {
        node._flatpickr.destroy();
        node._flatpickr = undefined;
      }

      node._flatpickr = FlatpickrInstance(node, config || {});
      instances.push(node._flatpickr);
    } catch (e) {
      console.error(e);
    }
  }

  return instances.length === 1 ? instances[0] : instances;
}

/* istanbul ignore next */
if (
  typeof HTMLElement !== "undefined" &&
  typeof HTMLCollection !== "undefined" &&
  typeof NodeList !== "undefined"
) {
  // browser env
  HTMLCollection.prototype.flatpickr = NodeList.prototype.flatpickr = function (
    config?: Options
  ) {
    return _flatpickr(this, config);
  };

  HTMLCollection.prototype.a11y_datetime =
    NodeList.prototype.a11y_datetime = function (config?: Options) {
      return _flatpickr(this, config);
    };

  HTMLElement.prototype.flatpickr = function (config?: Options) {
    return _flatpickr([this], config) as Instance;
  };

  HTMLElement.prototype.a11y_datetime = function (config?: Options) {
    return _flatpickr([this], config) as Instance;
  };
}

/* istanbul ignore next */
var flatpickr = function (
  selector: ArrayLike<Node> | Node | string,
  config?: Options
) {
  if (typeof selector === "string") {
    return _flatpickr(window.document.querySelectorAll(selector), config);
  } else if (selector instanceof Node) {
    return _flatpickr([selector], config);
  } else {
    return _flatpickr(selector, config);
  }
} as FlatpickrFn;

/* istanbul ignore next */
flatpickr.defaultConfig = {};

flatpickr.l10ns = {
  en: { ...English },
  default: { ...English },
};

flatpickr.localize = (l10n: CustomLocale) => {
  flatpickr.l10ns.default = {
    ...flatpickr.l10ns.default,
    ...l10n,
  };
};
flatpickr.setDefaults = (config: Options) => {
  flatpickr.defaultConfig = {
    ...flatpickr.defaultConfig,
    ...(config as ParsedOptions),
  };
};

flatpickr.parseDate = createDateParser({});
flatpickr.formatDate = createDateFormatter({});
flatpickr.compareDates = compareDates;

const a11y_datetime = flatpickr;

/* istanbul ignore next */
const jq = typeof window !== "undefined" ? (window as any).jQuery : undefined;
if (jq && typeof jq.fn !== "undefined") {
  (jq.fn as any).flatpickr = function (config: Options) {
    return _flatpickr(this, config);
  };

  (jq.fn as any).a11y_datetime = function (config: Options) {
    return _flatpickr(this, config);
  };
}

Date.prototype.fp_incr = function (days: number | string) {
  return new Date(
    this.getFullYear(),
    this.getMonth(),
    this.getDate() + (typeof days === "string" ? parseInt(days, 10) : days)
  );
};

if (typeof window !== "undefined") {
  window.flatpickr = flatpickr;
  window.a11y_datetime = a11y_datetime;
}

export default a11y_datetime;
