import {
  DEFAULT_MOBFLOW_SETTINGS,
  type MobFlowSettings,
  type MobFlowTheme,
} from "../types/settings";

const STORAGE_KEY = "mobflow-settings-v1";

export function loadMobFlowSettings(): MobFlowSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return DEFAULT_MOBFLOW_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<MobFlowSettings>;

    return {
      ...DEFAULT_MOBFLOW_SETTINGS,
      ...parsed,
      capabilities: Array.isArray(parsed.capabilities)
        ? parsed.capabilities
        : [],
    };
  } catch {
    return DEFAULT_MOBFLOW_SETTINGS;
  }
}

export function saveMobFlowSettings(
  settings: MobFlowSettings,
): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(settings),
  );
}

export function resolveTheme(
  theme: MobFlowTheme,
): "dark" | "light" {
  if (theme !== "system") {
    return theme;
  }

  return window.matchMedia(
    "(prefers-color-scheme: light)",
  ).matches
    ? "light"
    : "dark";
}

export function applyTheme(
  theme: MobFlowTheme,
): void {
  document.documentElement.dataset.theme =
    resolveTheme(theme);
}
