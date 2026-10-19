import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "./App.css";
import LogConsole from "./components/LogConsole";
import ApplicationManager from "./components/ApplicationManager";
import AutomationPanel from "./components/AutomationPanel";
import { MobFlowCleanLogo } from "./components/MobFlowCleanLogo";
import { PlatformIcon } from "./components/PlatformIcon";
import SettingsPanel from "./components/SettingsPanel";
import { SettingsIcon } from "./components/HeaderIcons";
import {
  applyTheme,
  loadMobFlowSettings,
  saveMobFlowSettings,
} from "./services/settingsService";
import type {
  MobFlowSettings,
} from "./types/settings";
import MobileInspector from "./components/inspector/MobileInspector";
import MobileRecorder from "./components/recorder/MobileRecorder";
import RecordingLibrary from "./components/recorder/RecordingLibrary";
import "./components/recorder/mobile-recorder.css";

import { mobileApi } from "./services/mobileApi";
import type {
  Device,
  DeviceInventory,
  EnvironmentStatus,
  PrepareApplicationResult,
  TestApplication,
  ToolStatus,
} from "./types/mobile";

type Operation = {
  deviceId: string;
  action: "start" | "stop";
} | null;

function StatusDot({
  status,
}: {
  status: "ready" | "optional" | "error";
}) {
  return <span className={`status-dot status-${status}`} />;
}

function ToolCard({ tool }: { tool: ToolStatus }) {
  const { t } = useTranslation();

  const state = tool.installed
    ? "ready"
    : tool.required
      ? "error"
      : "optional";

  const label = tool.installed
    ? t("environment.ready")
    : tool.required
      ? t("environment.missing")
      : t("environment.optional");

  return (
    <article className="tool-card">
      <div className="tool-main">
        <StatusDot status={state} />

        <div className="tool-copy">
          <strong>{tool.name}</strong>
          <span>
            {tool.version ||
              tool.path ||
              (tool.required
                ? t("environment.notDetected")
                : t("environment.notInstalled"))}
          </span>
        </div>
      </div>

      <span className={`status-badge badge-${state}`}>
        {label}
      </span>
    </article>
  );
}

function DeviceCard({
  device,
  operation,
  selected,
  onStart,
  onStop,
  onSelect,
}: {
  device: Device;
  operation: Operation;
  selected: boolean;
  onStart: (device: Device) => void;
  onStop: (device: Device) => void;
  onSelect: (device: Device) => void;
}) {
  const { t } = useTranslation();

  const normalized = device.state.toLowerCase();
  const running =
    normalized === "booted" ||
    normalized === "device" ||
    normalized === "available";

  const busy = operation?.deviceId === device.id;

  const stateKey =
    normalized === "booted"
      ? "booted"
      : normalized === "shutdown"
        ? "shutdown"
        : normalized === "stopped"
          ? "stopped"
          : normalized === "available"
            ? "available"
            : null;

  const stateLabel = stateKey
    ? t(`devices.${stateKey}`)
    : device.state;

  return (
    <article className={`device-card ${selected ? "device-selected" : ""}`}>
      <div className="device-info">
        <div className="device-title">
          <StatusDot status={running ? "ready" : "optional"} />
          <strong>{device.name}</strong>
        </div>

        <div className="device-meta">
          <span>{device.platform.toUpperCase()}</span>
          <span>·</span>
          <span>{t(`devices.${device.kind}`)}</span>

          {device.osVersion && (
            <>
              <span>·</span>
              <span>{device.osVersion}</span>
            </>
          )}
        </div>

        <code>{device.id}</code>
      </div>

      <div className="device-actions">
        <span className={`device-state ${running ? "device-ready" : ""}`}>
          {stateLabel}
        </span>

        {device.kind !== "physical" && !running && (
          <button
            className="device-button device-button-primary"
            disabled={busy}
            onClick={() => onStart(device)}
          >
            {busy && operation?.action === "start"
              ? t("devices.starting")
              : t("devices.start")}
          </button>
        )}

        {running && (
          <button
            className={`device-button ${selected ? "device-button-selected" : ""}`}
            disabled={busy}
            onClick={() => onSelect(device)}
          >
            {selected
              ? t("devices.selected")
              : t("devices.select")}
          </button>
        )}

        {device.kind !== "physical" && running && (
          <button
            className="device-button device-button-danger"
            disabled={busy}
            onClick={() => onStop(device)}
          >
            {busy && operation?.action === "stop"
              ? t("devices.stopping")
              : t("devices.stop")}
          </button>
        )}
      </div>
    </article>
  );
}

function DeviceGroup({
  title,
  devices,
  emptyText,
  operation,
  selectedId,
  onStart,
  onStop,
  onSelect,
}: {
  title: string;
  devices: Device[];
  emptyText: string;
  operation: Operation;
  selectedId: string | null;
  onStart: (device: Device) => void;
  onStop: (device: Device) => void;
  onSelect: (device: Device) => void;
}) {
  return (
    <div className="device-group">
      <div className="device-group-heading">
        <strong>{title}</strong>
        <span>{devices.length}</span>
      </div>

      {devices.length ? (
        <div className="device-list">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              operation={operation}
              selected={selectedId === device.logicalId}
              onStart={onStart}
              onStop={onStop}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div className="group-empty">{emptyText}</div>
      )}
    </div>
  );
}

function runtimeCapabilities(
  settings: MobFlowSettings,
) {
  return settings.capabilities.map((capability) => {
    let value: string | number | boolean;

    if (capability.type === "boolean") {
      value = capability.value === "true";
    } else if (capability.type === "number") {
      value = Number(capability.value);
    } else {
      value = capability.value;
    }

    return {
      key: capability.key.trim(),
      value,
    };
  });
}

function App() {
  const { t, i18n } = useTranslation();

  const [environment, setEnvironment] =
    useState<EnvironmentStatus | null>(null);

  const [devices, setDevices] = useState<DeviceInventory>({
    android: [],
    ios: [],
  });

  /*
   * The application shell must render immediately.
   * Environment/device discovery runs asynchronously and
   * must not block the first usable frame.
   */
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState<Operation>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [application, setApplication] =
    useState<TestApplication>({
      source: "localFile",
      path: null,
      identifier: "",
    });

  const [automationSession, setAutomationSession] =
    useState<PrepareApplicationResult | null>(null);

  const [sessionTransitioning, setSessionTransitioning] =
    useState(false);

  const [error, setError] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobFlowSettings, setMobFlowSettings] =
    useState<MobFlowSettings>(() => loadMobFlowSettings());
  useEffect(() => {
    void mobileApi
      .setAppiumRuntimeConfig(
        mobFlowSettings.appiumHost,
        mobFlowSettings.appiumPort,
        mobFlowSettings.appiumBasePath,
        runtimeCapabilities(mobFlowSettings),
      )
      .then((runtime) => {
        setMobFlowSettings((current) => {
          if (
            current.appiumHost === runtime.host &&
            current.appiumPort === runtime.port &&
            current.appiumBasePath === runtime.basePath
          ) {
            return current;
          }

          const synchronized = {
            ...current,
            appiumHost: runtime.host,
            appiumPort: runtime.port,
            appiumBasePath: runtime.basePath,
          };

          saveMobFlowSettings(synchronized);

          return synchronized;
        });
      })
      .catch((reason) => {
        console.error(
          "Unable to restore Appium runtime configuration",
          reason,
        );
      });
  }, []);

  useEffect(() => {
    applyTheme(mobFlowSettings.theme);

    if (mobFlowSettings.theme !== "system") {
      return;
    }

    const media = window.matchMedia(
      "(prefers-color-scheme: light)",
    );

    const syncSystemTheme = () => {
      applyTheme("system");
    };

    media.addEventListener("change", syncSystemTheme);

    return () => {
      media.removeEventListener(
        "change",
        syncSystemTheme,
      );
    };
  }, [mobFlowSettings.theme]);
  const [
    inspectorVisibility,
    setInspectorVisibility,
  ] = useState<
    "closed" | "open" | "minimized"
  >("closed");

  const [recorderOpen, setRecorderOpen] =
    useState(false);

  const [
    recordingLibraryOpen,
    setRecordingLibraryOpen,
  ] = useState(false);

  const [recordingCount, setRecordingCount] =
    useState(0);

  useEffect(() => {
    let disposed = false;

    const refreshRecordingCount =
      async () => {
        try {
          const recordings =
            await mobileApi.listMobileRecordings();

          if (!disposed) {
            setRecordingCount(
              recordings.length,
            );
          }
        } catch {
          if (!disposed) {
            setRecordingCount(0);
          }
        }
      };

    void refreshRecordingCount();

    return () => {
      disposed = true;
    };
  }, [
    recorderOpen,
    recordingLibraryOpen,
  ]);


  const selectedDevice = useMemo(
    () =>
      [...devices.android, ...devices.ios].find(
        (device) => device.logicalId === selectedId,
      ) ?? null,
    [devices, selectedId],
  );

  const changeLanguage = (language: "es" | "en") => {
    void i18n.changeLanguage(language);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [environmentResult, deviceResult] =
        await Promise.all([
          mobileApi.environment(),
          mobileApi.devices(),
        ]);

      setEnvironment(environmentResult);
      setDevices(deviceResult);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const androidPhysical = useMemo(
    () => devices.android.filter((d) => d.kind === "physical"),
    [devices.android],
  );

  const androidEmulators = useMemo(
    () => devices.android.filter((d) => d.kind === "emulator"),
    [devices.android],
  );

  const iosPhysical = useMemo(
    () => devices.ios.filter((d) => d.kind === "physical"),
    [devices.ios],
  );

  const iosSimulators = useMemo(
    () => devices.ios.filter((d) => d.kind === "simulator"),
    [devices.ios],
  );

  const runOperation = async (
    device: Device,
    action: "start" | "stop",
  ) => {
    setError(null);
    setOperation({ deviceId: device.id, action });

    try {
      if (device.platform === "ios") {
        if (action === "start") {
          await mobileApi.startIosSimulator(device.id);
        } else {
          await mobileApi.stopIosSimulator(device.id);
        }
      } else if (action === "start") {
        await mobileApi.startAndroidEmulator(
          device.logicalId,
        );
      } else {
        await mobileApi.stopAndroidEmulator(device.id);
      }

      setOperation(null);
      await refresh();
    } catch (reason) {
      setError(
        `${t("devices.actionFailed")}: ${
          reason instanceof Error ? reason.message : String(reason)
        }`,
      );
    } finally {
      setOperation(null);
    }
  };

  const closeSessionSurfaces = () => {
    setInspectorVisibility("closed");
    setRecorderOpen(false);
  };

  const endAutomationSession = async () => {
    const sessionId =
      automationSession?.sessionId;

    if (!sessionId || sessionTransitioning) {
      return;
    }

    setSessionTransitioning(true);
    setError(null);

    try {
      closeSessionSurfaces();

      await mobileApi.deleteAppiumSession(
        sessionId,
      );

      setAutomationSession(null);
    } catch (reason) {
      setError(
        `Unable to finish automation session: ${
          reason instanceof Error
            ? reason.message
            : String(reason)
        }`,
      );
    } finally {
      setSessionTransitioning(false);
    }
  };

  const restartAutomationSession = async () => {
    if (
      !automationSession?.sessionId ||
      !selectedDevice ||
      sessionTransitioning
    ) {
      return;
    }

    if (
      selectedDevice.platform !== "android"
    ) {
      setError(
        "New session is currently available for Android only.",
      );
      return;
    }

    if (
      application.source !== "localFile" ||
      !application.path
    ) {
      setError(
        "Select an APK before creating a new session.",
      );
      return;
    }

    setSessionTransitioning(true);
    setError(null);

    try {
      closeSessionSurfaces();

      await mobileApi.deleteAppiumSession(
        automationSession.sessionId,
      );

      /*
       * Clear the old identity before creating the new
       * session. This prevents Recorder/Inspector from
       * accidentally reopening against a stale session.
       */
      setAutomationSession(null);

      const nextSession =
        await mobileApi.restartAndroidApplication(
          selectedDevice.id,
          application.path,
        );

      setAutomationSession(nextSession);
    } catch (reason) {
      /*
       * The previous session may already be gone at this
       * point, therefore fail closed instead of restoring
       * a stale session object.
       */
      setAutomationSession(null);

      setError(
        `Unable to create a new automation session: ${
          reason instanceof Error
            ? reason.message
            : String(reason)
        }`,
      );
    } finally {
      setSessionTransitioning(false);
    }
  };

  const selectDevice = async (device: Device) => {
    if (sessionTransitioning) {
      return;
    }

    if (device.logicalId !== selectedId) {
      if (automationSession?.sessionId) {
        try {
          await mobileApi.deleteAppiumSession(
            automationSession.sessionId,
          );
        } catch (reason) {
          console.warn(
            "Unable to close previous Appium session",
            reason,
          );
        }
      }

      setInspectorVisibility("closed");

      setApplication({
        source: "localFile",
        path: null,
        identifier: "",
      });

      setAutomationSession(null);
    }

    setSelectedId(device.logicalId);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .getElementById("target-workspace")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      });
    });
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand">
          <MobFlowCleanLogo className="brand-logo" />

          <div className="brand-divider" aria-hidden="true" />

          <div className="brand-copy">
            <span className="eyebrow">{t("app.eyebrow")}</span>
            <p>{t("app.subtitle")}</p>
          </div>
        </div>

        <div className="hero-actions">

          <span className="version-pill">{t("common.version")}</span>

          <button
            className="logs-button"
            onClick={() => setLogsOpen(true)}
            type="button"
          >
            {t("logs.open")}
          </button>



          <button
            className="header-icon-button"
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Configuración"
            title="Configuración"
          >
            <SettingsIcon />
          </button>

          <button
            className="refresh-button"
            onClick={() => void refresh()}
            disabled={loading || operation !== null}
          >
            {loading ? t("app.refreshing") : t("app.refresh")}
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <strong>{t("environment.checkFailed")}</strong>
          <span>{error}</span>
        </div>
      )}

      <section className="overview-grid">
        <div className="environment-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("environment.eyebrow")}</span>
              <h2>{t("environment.title")}</h2>
            </div>

            {environment && (
              <div className="host-pill">
                {environment.operatingSystem} · {environment.architecture}
              </div>
            )}
          </div>

          {environment ? (
            <div className="tool-grid">
              <ToolCard tool={environment.appium} />
              <ToolCard tool={environment.androidSdk} />
              <ToolCard tool={environment.adb} />
              <ToolCard tool={environment.xcode} />
              <ToolCard tool={environment.maestro} />
            </div>
          ) : (
            <div className="loading-panel">
              {t("environment.checking")}
            </div>
          )}
        </div>

        <aside className="foundation-panel">
          <span className="eyebrow">{t("engines.eyebrow")}</span>
          <h2>{t("engines.title")}</h2>

          <div className="engine-row">
            <StatusDot status="ready" />
            <div>
              <strong>Appium</strong>
              <span>{t("engines.appiumDescription")}</span>
            </div>
          </div>

          <div className="engine-row">
            <StatusDot status="optional" />
            <div>
              <strong>Maestro</strong>
              <span>{t("engines.maestroDescription")}</span>
            </div>
          </div>

          <div className="foundation-note">
            {t("engines.localNote")}
          </div>
        </aside>
      </section>

      <section className="devices-heading">
        <div>
          <span className="eyebrow">{t("devices.eyebrow")}</span>
          <h2>{t("devices.title")}</h2>
        </div>
        <p>{t("devices.description")}</p>
      </section>

      {selectedDevice && (
        <section
          id="target-workspace"
          className="target-workspace"
        >
          <div className="workspace-heading">
            <div>
              <span className="eyebrow">
                {t("workspace.eyebrow")}
              </span>
              <h2>{t("workspace.title")}</h2>
            </div>

            <span className="workspace-ready">
              {t("workspace.ready")}
            </span>
          </div>

          <div className="selected-target-card">
            <div>
              <strong>{selectedDevice.name}</strong>

              <span>
                {selectedDevice.platform.toUpperCase()}
                {" · "}
                {selectedDevice.kind}
              </span>

              <code>{selectedDevice.id}</code>
            </div>

            <span className="selected-target-status">
              {selectedDevice.state}
            </span>
          </div>

          <div className="workspace-columns">
            <ApplicationManager
              device={selectedDevice}
              application={application}
              currentSession={automationSession}
              onChange={setApplication}
              onSessionReady={setAutomationSession}
            />

            <AutomationPanel
              session={automationSession}
              sessionTransitioning={sessionTransitioning}
              onRestartSession={() =>
                void restartAutomationSession()
              }
              onEndSession={() =>
                void endAutomationSession()
              }
              recordingCount={recordingCount}
              onOpenRecord={() => {
                setRecordingLibraryOpen(false);
                setRecorderOpen(true);
              }}
              onOpenSpy={() =>
                setInspectorVisibility("open")
              }
              onOpenRecordings={() => {
                setRecorderOpen(false);
                setRecordingLibraryOpen(true);
              }}
            />
          </div>
        </section>
      )}

      <div className="devices-grid">
        <section className="device-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("devices.android")}</span>
              <h2 className="platform-heading">
                <PlatformIcon platform="android" />
                <span>{t("devices.androidTitle")}</span>
              </h2>
            </div>
            <span className="count-pill">{devices.android.length}</span>
          </div>

          <DeviceGroup
            title={t("devices.physicalDevices")}
            devices={androidPhysical}
            emptyText={t("devices.noPhysical")}
            operation={operation}
            selectedId={selectedId}
            onStart={(d) => void runOperation(d, "start")}
            onStop={(d) => void runOperation(d, "stop")}
            onSelect={(device) => {
              void selectDevice(device);
            }}
          />

          <DeviceGroup
            title={t("devices.emulators")}
            devices={androidEmulators}
            emptyText={t("devices.noEmulators")}
            operation={operation}
            selectedId={selectedId}
            onStart={(d) => void runOperation(d, "start")}
            onStop={(d) => void runOperation(d, "stop")}
            onSelect={(device) => {
              void selectDevice(device);
            }}
          />
        </section>

        <section className="device-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("devices.ios")}</span>
              <h2 className="platform-heading">
                <PlatformIcon platform="ios" />
                <span>{t("devices.iosTitle")}</span>
              </h2>
            </div>
            <span className="count-pill">{devices.ios.length}</span>
          </div>

          <DeviceGroup
            title={t("devices.physicalDevices")}
            devices={iosPhysical}
            emptyText={t("devices.noPhysical")}
            operation={operation}
            selectedId={selectedId}
            onStart={(d) => void runOperation(d, "start")}
            onStop={(d) => void runOperation(d, "stop")}
            onSelect={(device) => {
              void selectDevice(device);
            }}
          />

          <DeviceGroup
            title={t("devices.simulators")}
            devices={iosSimulators}
            emptyText={t("devices.noSimulators")}
            operation={operation}
            selectedId={selectedId}
            onStart={(d) => void runOperation(d, "start")}
            onStop={(d) => void runOperation(d, "stop")}
            onSelect={(device) => {
              void selectDevice(device);
            }}
          />
        </section>
      </div>
      {recordingLibraryOpen && (
        <RecordingLibrary
          onClose={() =>
            setRecordingLibraryOpen(false)
          }
        />
      )}

      {recorderOpen &&
        automationSession && (
          <MobileRecorder
            session={automationSession}
            onClose={() =>
              setRecorderOpen(false)
            }
          />
        )}

      {inspectorVisibility !== "closed" &&
        automationSession && (
          <MobileInspector
            session={automationSession}
            minimized={
              inspectorVisibility ===
              "minimized"
            }
            onMinimize={() =>
              setInspectorVisibility(
                "minimized",
              )
            }
            onRestore={() =>
              setInspectorVisibility(
                "open",
              )
            }
            onClose={() =>
              setInspectorVisibility(
                "closed",
              )
            }
          />
        )}

      {logsOpen && (
        <LogConsole onClose={() => setLogsOpen(false)} />
      )}

      {settingsOpen && (
        <SettingsPanel
          settings={mobFlowSettings}
          language={
            i18n.language.startsWith("en") ? "en" : "es"
          }
          onLanguageChange={(language) => {
            void changeLanguage(language);
          }}
          onClose={() => setSettingsOpen(false)}
          onSave={async (nextSettings) => {
            try {
              const runtime =
                await mobileApi.setAppiumRuntimeConfig(
                  nextSettings.appiumHost,
                  nextSettings.appiumPort,
                  nextSettings.appiumBasePath,
                  runtimeCapabilities(nextSettings),
                );

              const synchronizedSettings = {
                ...nextSettings,
                appiumHost: runtime.host,
                appiumPort: runtime.port,
                appiumBasePath: runtime.basePath,
              };

              setMobFlowSettings(synchronizedSettings);
              saveMobFlowSettings(synchronizedSettings);
              applyTheme(synchronizedSettings.theme);
              setSettingsOpen(false);
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : String(reason),
              );
            }
          }}
        />
      )}
    </main>
  );
}

export default App;
