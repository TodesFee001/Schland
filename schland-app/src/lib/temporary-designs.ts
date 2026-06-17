export type TemporaryDesignTheme = {
  accentColor: string;
  accentSoftColor: string;
  accentStrongColor: string;
  backgroundClass: string;
  backgroundColor: string;
  bannerEnabled: boolean;
  bannerLabel: string;
  buttonColor: string;
  decoration: string;
  headerStyle: string;
};

export type TemporaryDesignTemplate = {
  dynamicDate: string;
  enabled: boolean;
  endDate: string;
  endOffsetDays: number;
  eventName: string;
  key: string;
  manualOnly: boolean;
  name: string;
  priority: number;
  recurring: boolean;
  startDate: string;
  startOffsetDays: number;
  theme: TemporaryDesignTheme;
};

export type TemporaryDesignSettings = {
  automaticEnabled: boolean;
  enabled: boolean;
  manualEnabled: boolean;
  manualEndDate: string;
  manualPriority: number;
  manualStartDate: string;
  manualTemplateKey: string;
};

export type ActiveTemporaryDesign = {
  key: string;
  name: string;
  source: "automatic" | "default" | "manual";
  theme: TemporaryDesignTheme;
};

export type TemporaryDesignState = {
  activeDesign: ActiveTemporaryDesign;
  storageMessage: string;
  storageReady: boolean;
  settings: TemporaryDesignSettings;
  templates: TemporaryDesignTemplate[];
};

export const defaultTemporaryDesignSettings: TemporaryDesignSettings = {
  automaticEnabled: true,
  enabled: true,
  manualEnabled: false,
  manualEndDate: "",
  manualPriority: 100,
  manualStartDate: "",
  manualTemplateKey: "",
};

const defaultTheme: TemporaryDesignTheme = {
  accentColor: "#263f72",
  accentSoftColor: "#d7dfed",
  accentStrongColor: "#14284d",
  backgroundClass: "theme-default",
  backgroundColor: "#c7cbc8",
  bannerEnabled: false,
  bannerLabel: "",
  buttonColor: "#111111",
  decoration: "",
  headerStyle: "default",
};

export const defaultTemporaryDesignTemplates: TemporaryDesignTemplate[] = [
  {
    dynamicDate: "",
    enabled: true,
    endDate: "",
    endOffsetDays: 0,
    eventName: "Standard",
    key: "default",
    manualOnly: false,
    name: "Standard",
    priority: 0,
    recurring: false,
    startDate: "",
    startOffsetDays: 0,
    theme: defaultTheme,
  },
  {
    dynamicDate: "",
    enabled: true,
    endDate: "03-08",
    endOffsetDays: 0,
    eventName: "Frauentag",
    key: "frauentag",
    manualOnly: false,
    name: "Frauentag",
    priority: 20,
    recurring: true,
    startDate: "03-08",
    startOffsetDays: 0,
    theme: {
      accentColor: "#b83280",
      accentSoftColor: "#fde2f3",
      accentStrongColor: "#7a174f",
      backgroundClass: "theme-frauentag",
      backgroundColor: "#f7d7ea",
      bannerEnabled: true,
      bannerLabel: "Frauentag",
      buttonColor: "#8a1f62",
      decoration: "floral",
      headerStyle: "soft",
    },
  },
  {
    dynamicDate: "christi_himmelfahrt",
    enabled: true,
    endDate: "",
    endOffsetDays: 0,
    eventName: "Maennertag / Vatertag",
    key: "maennertag",
    manualOnly: false,
    name: "Maennertag",
    priority: 20,
    recurring: false,
    startDate: "",
    startOffsetDays: 0,
    theme: {
      accentColor: "#1d4ed8",
      accentSoftColor: "#dbeafe",
      accentStrongColor: "#1e3a8a",
      backgroundClass: "theme-maennertag",
      backgroundColor: "#d6e4ff",
      bannerEnabled: true,
      bannerLabel: "Maennertag",
      buttonColor: "#1d4ed8",
      decoration: "badge",
      headerStyle: "clear",
    },
  },
  {
    dynamicDate: "",
    enabled: true,
    endDate: "2026-07-19",
    endOffsetDays: 0,
    eventName: "Fussball-Weltmeisterschaft 2026",
    key: "wm-2026",
    manualOnly: false,
    name: "WM 2026",
    priority: 90,
    recurring: false,
    startDate: "2026-06-11",
    startOffsetDays: 0,
    theme: {
      accentColor: "#117a37",
      accentSoftColor: "#fff1b8",
      accentStrongColor: "#0b2f1a",
      backgroundClass: "theme-wm-2026",
      backgroundColor: "#cdeed5",
      bannerEnabled: true,
      bannerLabel: "FIFA WM 2026",
      buttonColor: "#d90429",
      decoration: "pitch",
      headerStyle: "stadium",
    },
  },
  {
    dynamicDate: "",
    enabled: true,
    endDate: "12-26",
    endOffsetDays: 0,
    eventName: "Weihnachten",
    key: "weihnachten",
    manualOnly: false,
    name: "Weihnachten",
    priority: 20,
    recurring: true,
    startDate: "12-01",
    startOffsetDays: 0,
    theme: {
      accentColor: "#b91c1c",
      accentSoftColor: "#fee2e2",
      accentStrongColor: "#7f1d1d",
      backgroundClass: "theme-weihnachten",
      backgroundColor: "#ead7d7",
      bannerEnabled: true,
      bannerLabel: "Weihnachtsdesign",
      buttonColor: "#991b1b",
      decoration: "stars",
      headerStyle: "festive",
    },
  },
  {
    dynamicDate: "easter_sunday",
    enabled: true,
    endDate: "",
    endOffsetDays: 1,
    eventName: "Ostern",
    key: "ostern",
    manualOnly: false,
    name: "Ostern",
    priority: 20,
    recurring: false,
    startDate: "",
    startOffsetDays: -2,
    theme: {
      accentColor: "#7c3aed",
      accentSoftColor: "#ede9fe",
      accentStrongColor: "#4c1d95",
      backgroundClass: "theme-ostern",
      backgroundColor: "#e9defa",
      bannerEnabled: true,
      bannerLabel: "Ostern",
      buttonColor: "#6d28d9",
      decoration: "eggs",
      headerStyle: "spring",
    },
  },
  {
    dynamicDate: "",
    enabled: true,
    endDate: "01-01",
    endOffsetDays: 0,
    eventName: "Neujahr / Silvester",
    key: "neujahr",
    manualOnly: false,
    name: "Neujahr",
    priority: 25,
    recurring: true,
    startDate: "12-31",
    startOffsetDays: 0,
    theme: {
      accentColor: "#6d28d9",
      accentSoftColor: "#f3e8ff",
      accentStrongColor: "#581c87",
      backgroundClass: "theme-neujahr",
      backgroundColor: "#ded9f3",
      bannerEnabled: true,
      bannerLabel: "Neujahr",
      buttonColor: "#4c1d95",
      decoration: "spark",
      headerStyle: "celebration",
    },
  },
  {
    dynamicDate: "",
    enabled: true,
    endDate: "10-31",
    endOffsetDays: 0,
    eventName: "Halloween",
    key: "halloween",
    manualOnly: false,
    name: "Halloween",
    priority: 20,
    recurring: true,
    startDate: "10-31",
    startOffsetDays: 0,
    theme: {
      accentColor: "#7c2d12",
      accentSoftColor: "#ffedd5",
      accentStrongColor: "#431407",
      backgroundClass: "theme-halloween",
      backgroundColor: "#ead4c0",
      bannerEnabled: true,
      bannerLabel: "Halloween",
      buttonColor: "#9a3412",
      decoration: "moon",
      headerStyle: "seasonal",
    },
  },
  {
    dynamicDate: "",
    enabled: true,
    endDate: "02-14",
    endOffsetDays: 0,
    eventName: "Valentinstag",
    key: "valentinstag",
    manualOnly: false,
    name: "Valentinstag",
    priority: 20,
    recurring: true,
    startDate: "02-14",
    startOffsetDays: 0,
    theme: {
      accentColor: "#be123c",
      accentSoftColor: "#ffe4e6",
      accentStrongColor: "#881337",
      backgroundClass: "theme-valentinstag",
      backgroundColor: "#f3d5dc",
      bannerEnabled: true,
      bannerLabel: "Valentinstag",
      buttonColor: "#be123c",
      decoration: "heart",
      headerStyle: "soft",
    },
  },
  {
    dynamicDate: "black_friday",
    enabled: true,
    endDate: "",
    endOffsetDays: 0,
    eventName: "Black Friday",
    key: "black-friday",
    manualOnly: false,
    name: "Black Friday",
    priority: 20,
    recurring: false,
    startDate: "",
    startOffsetDays: 0,
    theme: {
      accentColor: "#111111",
      accentSoftColor: "#e5e5e5",
      accentStrongColor: "#000000",
      backgroundClass: "theme-black-friday",
      backgroundColor: "#d4d4d4",
      bannerEnabled: true,
      bannerLabel: "Black Friday",
      buttonColor: "#111111",
      decoration: "contrast",
      headerStyle: "contrast",
    },
  },
];

export function getActiveTemporaryDesign(input: {
  now?: Date;
  settings: TemporaryDesignSettings;
  templates: TemporaryDesignTemplate[];
}): ActiveTemporaryDesign {
  const now = input.now ?? new Date();
  const settings = input.settings.enabled
    ? input.settings
    : { ...input.settings, automaticEnabled: false, manualEnabled: false };
  const templates = normalizeTemporaryDesignTemplates(input.templates);
  const defaultTemplate =
    templates.find((template) => template.key === "default") ??
    defaultTemporaryDesignTemplates[0];

  if (settings.enabled && settings.manualEnabled && settings.manualTemplateKey) {
    const manualTemplate = templates.find(
      (template) => template.key === settings.manualTemplateKey && template.enabled,
    );

    if (manualTemplate && isManualRangeActive(settings, now)) {
      return {
        key: manualTemplate.key,
        name: manualTemplate.name,
        source: "manual",
        theme: manualTemplate.theme,
      };
    }
  }

  if (settings.enabled && settings.automaticEnabled) {
    const activeTemplate = templates
      .filter((template) => template.enabled && !template.manualOnly)
      .filter((template) => template.key !== "default")
      .filter((template) => isTemplateActive(template, now))
      .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name))
      .at(0);

    if (activeTemplate) {
      return {
        key: activeTemplate.key,
        name: activeTemplate.name,
        source: "automatic",
        theme: activeTemplate.theme,
      };
    }
  }

  return {
    key: defaultTemplate.key,
    name: defaultTemplate.name,
    source: "default",
    theme: defaultTemplate.theme,
  };
}

export function normalizeTemporaryDesignTemplates(
  templates: TemporaryDesignTemplate[],
) {
  const byKey = new Map<string, TemporaryDesignTemplate>();

  for (const template of [...defaultTemporaryDesignTemplates, ...templates]) {
    if (!template.key) {
      continue;
    }

    byKey.set(template.key, {
      ...template,
      theme: normalizeTemporaryDesignTheme(template.theme),
    });
  }

  return Array.from(byKey.values()).sort(
    (left, right) => right.priority - left.priority || left.name.localeCompare(right.name),
  );
}

export function normalizeTemporaryDesignTheme(
  value: Partial<TemporaryDesignTheme> | null | undefined,
) {
  return {
    ...defaultTheme,
    ...(value ?? {}),
  };
}

function isManualRangeActive(settings: TemporaryDesignSettings, now: Date) {
  const today = toDateKey(now);
  const start = settings.manualStartDate;
  const end = settings.manualEndDate;

  if (start && today < start) {
    return false;
  }

  if (end && today > end) {
    return false;
  }

  return true;
}

function isTemplateActive(template: TemporaryDesignTemplate, now: Date) {
  if (template.dynamicDate) {
    const range = getDynamicRange(template, now);

    return range ? isDateInFullRange(toDateKey(now), range.start, range.end) : false;
  }

  if (!template.startDate || !template.endDate) {
    return false;
  }

  if (template.recurring) {
    return isMonthDayInRange(toMonthDay(now), template.startDate, template.endDate);
  }

  return isDateInFullRange(toDateKey(now), template.startDate, template.endDate);
}

function getDynamicRange(template: TemporaryDesignTemplate, now: Date) {
  const year = Number(toDateKey(now).slice(0, 4));
  let baseDate: Date | null = null;

  if (template.dynamicDate === "easter_sunday") {
    baseDate = getEasterSunday(year);
  } else if (template.dynamicDate === "christi_himmelfahrt") {
    baseDate = addDays(getEasterSunday(year), 39);
  } else if (template.dynamicDate === "pfingsten") {
    baseDate = addDays(getEasterSunday(year), 49);
  } else if (template.dynamicDate === "black_friday") {
    baseDate = getBlackFriday(year);
  }

  if (!baseDate) {
    return null;
  }

  return {
    end: toDateKey(addDays(baseDate, template.endOffsetDays)),
    start: toDateKey(addDays(baseDate, template.startOffsetDays)),
  };
}

function isDateInFullRange(today: string, start: string, end: string) {
  if (!start || !end) {
    return false;
  }

  return today >= start && today <= end;
}

function isMonthDayInRange(today: string, start: string, end: string) {
  if (!isMonthDay(start) || !isMonthDay(end)) {
    return false;
  }

  if (start <= end) {
    return today >= start && today <= end;
  }

  return today >= start || today <= end;
}

function isMonthDay(value: string) {
  return /^\d{2}-\d{2}$/.test(value);
}

function toDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Berlin",
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function toMonthDay(date: Date) {
  return toDateKey(date).slice(5);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function getEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function getBlackFriday(year: number) {
  const date = new Date(Date.UTC(year, 10, 1, 12, 0, 0));
  const thursdays: Date[] = [];

  while (date.getUTCMonth() === 10) {
    if (date.getUTCDay() === 4) {
      thursdays.push(new Date(date));
    }

    date.setUTCDate(date.getUTCDate() + 1);
  }

  return addDays(thursdays[3], 1);
}
