export type MobFlowTheme = "system" | "dark" | "light";

export type CapabilityType =
  | "string"
  | "number"
  | "boolean";

export interface CustomCapability {
  id: string;
  key: string;
  value: string;
  type: CapabilityType;
}

export interface MobFlowSettings {
  theme: MobFlowTheme;
  appiumHost: string;
  appiumPort: number;
  appiumBasePath: string;
  capabilities: CustomCapability[];
}

export const DEFAULT_MOBFLOW_SETTINGS: MobFlowSettings = {
  theme: "dark",
  appiumHost: "127.0.0.1",
  appiumPort: 4723,
  appiumBasePath: "/",
  capabilities: [],
};

export interface AppiumRuntimeCapability {
  key: string;
  value: string | number | boolean;
}

export interface AppiumRuntimeConfig {
  host: string;
  port: number;
  basePath: string;
  capabilities: AppiumRuntimeCapability[];
}
