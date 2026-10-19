import type {
  AppiumRuntimeCapability,
  AppiumRuntimeConfig,
} from "../types/settings";
import type { DeviceStreamSession } from "../types/mobile";
import { invoke } from "@tauri-apps/api/core";
import type {
  AndroidAppContext,
  DeviceInventory,
  EnvironmentStatus,
  AppiumLiveLine,
  InspectorSnapshot,
  InspectorElement,
  LocatorCandidate,
  LocatorTestResult,
  LogEntry,
  MobileElementSnapshot,
  PrepareApplicationResult,
  SessionHealth,
} from "../types/mobile";

import type { MobileRecording } from "../components/inspector/mobile-recorder";
export const mobileApi = {
  appiumRuntimeConfig(): Promise<AppiumRuntimeConfig> {
    return invoke<AppiumRuntimeConfig>(
      "get_appium_runtime_config",
    );
  },

  setAppiumRuntimeConfig(
    host: string,
    port: number,
    basePath: string,
    capabilities: AppiumRuntimeCapability[],
  ): Promise<AppiumRuntimeConfig> {
    return invoke<AppiumRuntimeConfig>(
      "set_appium_runtime_config",
      {
        host,
        port,
        basePath,
        capabilities,
      },
    );
  },

  environment(): Promise<EnvironmentStatus> {
    return invoke<EnvironmentStatus>("get_environment_status");
  },

  devices(): Promise<DeviceInventory> {
    return invoke<DeviceInventory>("get_devices");
  },

  startIosSimulator(id: string): Promise<void> {
    return invoke("start_ios_simulator", { id });
  },

  stopIosSimulator(id: string): Promise<void> {
    return invoke("stop_ios_simulator", { id });
  },

  startAndroidEmulator(avdName: string): Promise<string> {
    return invoke<string>("start_android_emulator", { avdName });
  },

  stopAndroidEmulator(serial: string): Promise<void> {
    return invoke("stop_android_emulator", { serial });
  },

  logs(): Promise<LogEntry[]> {
    return invoke<LogEntry[]>("get_logs");
  },

  appiumLiveLogs(): Promise<AppiumLiveLine[]> {
    return invoke<AppiumLiveLine[]>(
      "get_appium_live_logs",
    );
  },

  clearAppiumLiveLogs(): Promise<void> {
    return invoke("clear_appium_live_logs");
  },

  deleteAppiumSession(
    sessionId: string,
  ): Promise<void> {
    return invoke(
      "delete_appium_session",
      { sessionId },
    );
  },

  androidSpyElements(
    sessionId: string,
  ): Promise<MobileElementSnapshot[]> {
    return invoke<MobileElementSnapshot[]>(
      "get_android_spy_elements",
      { sessionId },
    );
  },

  androidInspectorSnapshot(
    sessionId: string,
    deviceId: string,
  ): Promise<InspectorSnapshot> {
    return invoke<InspectorSnapshot>(
      "get_android_inspector_snapshot",
      {
        sessionId,
        deviceId,
      },
    );
  },

  tapSession(
    sessionId: string,
    x: number,
    y: number,
  ): Promise<void> {
    return invoke("tap_session", {
      sessionId,
      x,
      y,
    });
  },

  clickElement(
    sessionId: string,
    elementId: string,
  ): Promise<void> {
    return invoke("click_element", {
      sessionId,
      elementId,
    });
  },


  sessionHealth(
    sessionId: string,
  ): Promise<SessionHealth> {
    return invoke<SessionHealth>(
      "get_session_health",
      { sessionId },
    );
  },

  androidCurrentPackage(
    sessionId: string,
  ): Promise<string> {
    return invoke<string>(
      "get_android_current_package",
      { sessionId },
    );
  },

  androidAppContext(
    sessionId: string,
  ): Promise<AndroidAppContext> {
    return invoke<AndroidAppContext>(
      "get_android_app_context",
      { sessionId },
    );
  },

  terminateAndroidApp(
    sessionId: string,
    packageName: string,
  ): Promise<void> {
    return invoke(
      "terminate_android_app",
      {
        sessionId,
        packageName,
      },
    );
  },

  activateAndroidApp(
    sessionId: string,
    packageName: string,
  ): Promise<void> {
    return invoke(
      "activate_android_app",
      {
        sessionId,
        package: packageName,
      },
    );
  },

  swipeSession(
    sessionId: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs: number,
  ): Promise<void> {
    return invoke(
      "swipe_session",
      {
        sessionId,
        startX,
        startY,
        endX,
        endY,
        durationMs,
      },
    );
  },

  androidNavigationKey(
    sessionId: string,
    action: "back" | "home" | "recents",
  ): Promise<void> {
    return invoke(
      "android_navigation_key",
      {
        sessionId,
        action,
      },
    );
  },

  typeElementText(
    sessionId: string,
    element: InspectorElement,
    text: string,
  ): Promise<void> {
    return invoke(
      "type_element_text",
      {
        sessionId,
        element,
        text,
      },
    );
  },

  clearElementText(
    sessionId: string,
    element: InspectorElement,
  ): Promise<void> {
    return invoke(
      "clear_element_text",
      {
        sessionId,
        element,
      },
    );
  },

  hideAndroidKeyboard(
    sessionId: string,
  ): Promise<void> {
    return invoke(
      "hide_android_keyboard",
      {
        sessionId,
      },
    );
  },

  testLocator(
    sessionId: string,
    strategy: string,
    selector: string,
  ): Promise<number> {
    return invoke<number>("test_locator", {
      sessionId,
      strategy,
      selector,
    });
  },

  testLocatorDetail(
    sessionId: string,
    strategy: string,
    selector: string,
  ): Promise<LocatorTestResult> {
    return invoke<LocatorTestResult>(
      "test_locator_detail",
      {
        sessionId,
        strategy,
        selector,
      },
    );
  },

  analyzeAndroidElementLocators(
    sessionId: string,
    elementId: string,
    elements: InspectorElement[],
  ): Promise<LocatorCandidate[]> {
    return invoke<LocatorCandidate[]>(
      "analyze_android_element_locators",
      {
        sessionId,
        elementId,
        elements,
      },
    );
  },

  addRuntimeLog(
    level: "info" | "error",
    source: "aut" | "recovery",
    message: string,
  ): Promise<void> {
    return invoke(
      "add_runtime_log",
      {
        level,
        source,
        message,
      },
    );
  },

  startDeviceStream(
    deviceId: string,
    platform: "android" | "ios",
  ): Promise<DeviceStreamSession> {
    return invoke<DeviceStreamSession>(
      "start_device_stream",
      {
        deviceId,
        platform,
      },
    );
  },

  androidStreamFrame(
    deviceId: string,
  ): Promise<string> {
    return invoke<string>(
      "get_android_stream_frame",
      {
        deviceId,
      },
    );
  },

  stopDeviceStream(
    streamId: string,
  ): Promise<void> {
    return invoke(
      "stop_device_stream",
      {
        streamId,
      },
    );
  },


  clearLogs(): Promise<void> {
    return invoke("clear_logs");
  },

  prepareAndroidApplication(
    deviceId: string,
    applicationPath: string,
  ): Promise<PrepareApplicationResult> {
    return invoke<PrepareApplicationResult>(
      "prepare_android_application",
      {
        deviceId,
        applicationPath,
      },
    );
  },

  recoverAndroidSession(
    deviceId: string,
    applicationPath: string,
    packageName: string,
    activity: string,
  ): Promise<PrepareApplicationResult> {
    return invoke<PrepareApplicationResult>(
      "recover_android_session",
      {
        deviceId,
        applicationPath,
        package: packageName,
        activity,
      },
    );
  },

  restartAndroidApplication(
    deviceId: string,
    applicationPath: string,
  ): Promise<PrepareApplicationResult> {
    return invoke<PrepareApplicationResult>(
      "restart_android_application",
      {
        deviceId,
        applicationPath,
      },
    );
  },
  saveMobileRecording(
    recording: MobileRecording,
  ): Promise<MobileRecording> {
    return invoke<MobileRecording>(
      "save_mobile_recording",
      { recording },
    );
  },

  listMobileRecordings(
  ): Promise<MobileRecording[]> {
    return invoke<MobileRecording[]>(
      "list_mobile_recordings",
    );
  },

  deleteMobileRecording(
    recordingId: string,
  ): Promise<void> {
    return invoke(
      "delete_mobile_recording",
      { recordingId },
    );
  },

  exportMobileRecording(
    recording: MobileRecording,
  ): Promise<string> {
    return invoke<string>(
      "export_mobile_recording",
      {
        recording,
      },
    );
  },

  clickSessionLocator(
    sessionId: string,
    strategy: string,
    locator: string,
  ): Promise<{
    strategy: string;
    value: string;
    elementId: string;
  }> {
    return invoke(
      "click_session_locator",
      {
        sessionId,
        strategy,
        locator,
      },
    );
  },

  startPhysicalInputCapture(
    deviceId: string,
  ): Promise<{
    deviceId: string;
    inputDevice: string;
    inputName: string;
    maxX: number;
    maxY: number;
    screenWidth: number;
    screenHeight: number;
  }> {
    return invoke(
      "start_physical_input_capture",
      {
        deviceId,
      },
    );
  },

  stopPhysicalInputCapture(
    deviceId: string,
  ): Promise<void> {
    return invoke(
      "stop_physical_input_capture",
      {
        deviceId,
      },
    );
  },

  drainPhysicalGestures(
    deviceId: string,
  ): Promise<Array<{
    deviceId: string;
    kind: "tap" | "swipe";
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    durationMs: number;
    direction:
      | "up"
      | "down"
      | "left"
      | "right"
      | null;
  }>> {
    return invoke(
      "drain_physical_gestures",
      {
        deviceId,
      },
    );
  },

};
