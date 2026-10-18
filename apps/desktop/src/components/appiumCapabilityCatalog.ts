import type { CapabilityType } from "../types/settings";

export type CapabilityCategory =
  | "session"
  | "android"
  | "application"
  | "timeouts"
  | "performance";

export interface AppiumCapabilityDefinition {
  key: string;
  label: string;
  description: string;
  type: CapabilityType;
  defaultValue: string;
  category: CapabilityCategory;
}

export const CAPABILITY_CATEGORY_LABELS: Record<
  CapabilityCategory,
  string
> = {
  session: "Sesión",
  android: "Android / UiAutomator2",
  application: "Aplicación",
  timeouts: "Timeouts",
  performance: "Performance",
};

export const APPIUM_CAPABILITY_CATALOG:
  AppiumCapabilityDefinition[] = [
  {
    key: "appium:noReset",
    label: "No reset",
    description:
      "Conserva los datos y el estado de la aplicación entre sesiones.",
    type: "boolean",
    defaultValue: "true",
    category: "session",
  },
  {
    key: "appium:fullReset",
    label: "Full reset",
    description:
      "Realiza un reset completo de la aplicación durante la sesión.",
    type: "boolean",
    defaultValue: "false",
    category: "session",
  },
  {
    key: "appium:newCommandTimeout",
    label: "New command timeout",
    description:
      "Tiempo máximo sin recibir comandos antes de cerrar la sesión.",
    type: "number",
    defaultValue: "300",
    category: "session",
  },

  {
    key: "appium:autoGrantPermissions",
    label: "Auto grant permissions",
    description:
      "Concede automáticamente permisos solicitados por la aplicación.",
    type: "boolean",
    defaultValue: "true",
    category: "android",
  },
  {
    key: "appium:disableWindowAnimation",
    label: "Disable window animation",
    description:
      "Desactiva animaciones del dispositivo durante la automatización.",
    type: "boolean",
    defaultValue: "true",
    category: "android",
  },
  {
    key: "appium:waitForIdleTimeout",
    label: "Wait for idle timeout",
    description:
      "Controla cuánto espera UiAutomator2 por un estado idle.",
    type: "number",
    defaultValue: "10000",
    category: "android",
  },
  {
    key: "appium:ignoreUnimportantViews",
    label: "Ignore unimportant views",
    description:
      "Permite reducir nodos considerados no importantes en la jerarquía.",
    type: "boolean",
    defaultValue: "false",
    category: "android",
  },

  {
    key: "appium:autoLaunch",
    label: "Auto launch",
    description:
      "Controla si Appium inicia automáticamente la aplicación.",
    type: "boolean",
    defaultValue: "true",
    category: "application",
  },
  {
    key: "appium:dontStopAppOnReset",
    label: "Don't stop app on reset",
    description:
      "Evita detener la aplicación antes de iniciar la sesión.",
    type: "boolean",
    defaultValue: "false",
    category: "application",
  },
  {
    key: "appium:forceAppLaunch",
    label: "Force app launch",
    description:
      "Fuerza el lanzamiento de la aplicación al crear la sesión.",
    type: "boolean",
    defaultValue: "false",
    category: "application",
  },

  {
    key: "appium:adbExecTimeout",
    label: "ADB execution timeout",
    description:
      "Timeout máximo para comandos ejecutados mediante ADB.",
    type: "number",
    defaultValue: "20000",
    category: "timeouts",
  },
  {
    key: "appium:androidInstallTimeout",
    label: "Android install timeout",
    description:
      "Timeout máximo para instalar una aplicación Android.",
    type: "number",
    defaultValue: "90000",
    category: "timeouts",
  },
  {
    key: "appium:uiautomator2ServerLaunchTimeout",
    label: "UiAutomator2 launch timeout",
    description:
      "Tiempo máximo para iniciar el servidor UiAutomator2.",
    type: "number",
    defaultValue: "30000",
    category: "timeouts",
  },
  {
    key: "appium:uiautomator2ServerInstallTimeout",
    label: "UiAutomator2 install timeout",
    description:
      "Tiempo máximo para instalar el servidor UiAutomator2.",
    type: "number",
    defaultValue: "20000",
    category: "timeouts",
  },

  {
    key: "appium:skipDeviceInitialization",
    label: "Skip device initialization",
    description:
      "Omite parte de la inicialización Android cuando el entorno ya está preparado.",
    type: "boolean",
    defaultValue: "false",
    category: "performance",
  },
  {
    key: "appium:skipServerInstallation",
    label: "Skip server installation",
    description:
      "Reutiliza UiAutomator2 instalado previamente en el dispositivo.",
    type: "boolean",
    defaultValue: "false",
    category: "performance",
  },
  {
    key: "appium:remoteAppsCacheLimit",
    label: "Remote apps cache limit",
    description:
      "Define el límite del cache de aplicaciones utilizado por Appium.",
    type: "number",
    defaultValue: "10",
    category: "performance",
  },
];
