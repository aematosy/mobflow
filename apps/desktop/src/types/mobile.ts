export interface ToolStatus {
  name: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  required: boolean;
}

export interface EnvironmentStatus {
  operatingSystem: string;
  architecture: string;
  appium: ToolStatus;
  adb: ToolStatus;
  androidSdk: ToolStatus;
  xcode: ToolStatus;
  maestro: ToolStatus;
}

export type Platform = "android" | "ios";
export type DeviceKind = "physical" | "emulator" | "simulator";

export interface Device {
  id: string;
  logicalId: string;
  name: string;
  platform: Platform;
  kind: DeviceKind;
  osVersion: string | null;
  state: string;
  available: boolean;
  model: string | null;
}

export interface DeviceInventory {
  android: Device[];
  ios: Device[];
}

export interface LogEntry {
  timestampMs: number;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
  command: string | null;
  success: boolean | null;
  durationMs: number | null;
  stdout: string | null;
  stderr: string | null;
}

export type ApplicationSource =
  | "localFile"
  | "installed";

export interface TestApplication {
  source: ApplicationSource;
  path: string | null;
  identifier: string;
}

export interface PrepareApplicationResult {
  ok: boolean;
  platform: string;
  deviceId: string;
  applicationPath: string;
  package: string;
  activity: string;
  sessionId: string;
  appiumUrl: string;
  automationName: string;
  message: string;
}

export interface AppiumLiveLine {
  timestampMs: number;
  stream: "stdout" | "stderr";
  text: string;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AndroidAppContext {
  package: string;
  activity: string;
}

export interface LocatorCandidate {
  strategy: string;
  value: string;
  score: number;
  recommended: boolean;
  reason: string;
  matchCount: number | null;
  unique: boolean;
  stable: boolean;
  category: string;

  template: string | null;
  parameterName: string | null;
  parameterExample: string | null;
}

export interface MobileElementSnapshot {
  index: number;
  className: string;
  text: string | null;
  resourceId: string | null;
  contentDescription: string | null;
  package: string | null;
  clickable: boolean;
  enabled: boolean;
  displayed: boolean;
  bounds: ElementBounds | null;
  locators: LocatorCandidate[];
}

export interface InspectorElement {
  id: string;
  index: number;

  parentId: string | null;
  childrenIds: string[];

  platform: Platform;
  elementType: string;

  text: string | null;
  name: string | null;
  label: string | null;
  value: string | null;

  resourceId: string | null;
  accessibilityId: string | null;
  package: string | null;

  clickable: boolean;
  enabled: boolean;
  displayed: boolean;
  selected: boolean;

  bounds: ElementBounds | null;

  locators: LocatorCandidate[];
}

export interface InspectorSnapshot {
  sessionId: string;
  platform: Platform;
  automationName: string;

  screenshotBase64: string;

  screenWidth: number;
  screenHeight: number;

  /*
   * Coordinate extent reported by the automation hierarchy.
   *
   * Element bounds belong to this coordinate space and must
   * not be assumed to match the physical display size.
   */
  hierarchyWidth: number;
  hierarchyHeight: number;

  elements: InspectorElement[];

  capturedAtMs: number;
}

/*
 * Live device streaming.
 *
 * The Inspector owns the presentation while the backend
 * selects the platform-specific transport/provider.
 */
export type DeviceStreamState =
  | "starting"
  | "streaming"
  | "stopped"
  | "error";

export interface DeviceStreamSession {
  id: string;
  deviceId: string;
  platform: Platform;
  provider: string;
  state: DeviceStreamState;
  message: string | null;
}
