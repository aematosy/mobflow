export type SettingsSectionId =
  | "general"
  | "appium"
  | "android"
  | "ios"
  | "recorder"
  | "locator"
  | "inspector"
  | "logs"
  | "advanced";

export interface SettingsSectionDefinition {
  id: SettingsSectionId;
  label: string;
  description: string;
}

export const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  {
    id: "general",
    label: "General",
    description: "Apariencia y preferencias de MobFlow",
  },
  {
    id: "appium",
    label: "Appium",
    description: "Servidor, sesiones y capabilities",
  },
  {
    id: "android",
    label: "Android",
    description: "ADB, SDK, UiAutomator2 y emuladores",
  },
  {
    id: "ios",
    label: "iOS",
    description: "Xcode, WDA y simuladores",
  },
  {
    id: "recorder",
    label: "Recorder",
    description: "Gestos, snapshots y captura",
  },
  {
    id: "locator",
    label: "Locator Engine",
    description: "Estrategias, scoring y validación",
  },
  {
    id: "inspector",
    label: "Inspector",
    description: "Jerarquía, screenshot y refresh",
  },
  {
    id: "logs",
    label: "Logs",
    description: "Runtime, Appium y diagnósticos",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Opciones experimentales",
  },
];
