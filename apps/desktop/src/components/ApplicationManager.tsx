import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { mobileApi } from "../services/mobileApi";

import type {
  Device,
  PrepareApplicationResult,
  SessionHealth,
  TestApplication,
} from "../types/mobile";

interface Props {
  device: Device;
  application: TestApplication;
  currentSession: PrepareApplicationResult | null;
  sessionHealth: SessionHealth | null;
  onChange: (application: TestApplication) => void;
  onSessionReady: (
    session: PrepareApplicationResult,
  ) => void;
}

function allowedExtensions(device: Device): string[] {
  if (device.platform === "android") {
    return ["apk"];
  }

  if (device.kind === "simulator") {
    return ["app"];
  }

  return ["ipa"];
}

export default function ApplicationManager({
  device,
  application,
  currentSession,
  sessionHealth,
  onChange,
  onSessionReady,
}: Props) {
  const { t } = useTranslation();

  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [prepareError, setPrepareError] =
    useState<string | null>(null);

  const updateApplication = (
    nextApplication: TestApplication,
  ) => {
    setResult(null);
    setPrepareError(null);
    onChange(nextApplication);
  };

  const prepare = async () => {
    setResult(null);
    setPrepareError(null);

    if (device.platform !== "android") {
      setPrepareError(
        "iOS preparation will be enabled in the next adapter.",
      );
      return;
    }

    if (
      application.source !== "localFile" ||
      !application.path
    ) {
      setPrepareError("Select an APK first.");
      return;
    }

    setPreparing(true);

    try {
      /*
       * Fast path for Recorder/Inspector:
       *
       * Preparing the exact same application on the exact
       * same device must not destroy a healthy session just
       * to recreate UiAutomator2.
       */
      const reusable =
        currentSession
        && currentSession.sessionId
        && sessionHealth?.alive === true
        && currentSession.deviceId === device.id
        && currentSession.applicationPath
          === application.path;

      if (reusable) {
        setResult(
          "Existing automation session ready",
        );

        onSessionReady(
          currentSession,
        );

        return;
      }

      /*
       * A different device/application owns a different
       * automation context. Only then dispose the previous
       * session.
       */
      if (currentSession?.sessionId) {
        await mobileApi.deleteAppiumSession(
          currentSession.sessionId,
        );
      }

      const response =
        await mobileApi.prepareAndroidApplication(
          device.id,
          application.path,
        );

      setResult(response.message);
      onSessionReady(response);
    } catch (reason) {
      setPrepareError(
        reason instanceof Error
          ? reason.message
          : String(reason),
      );
    } finally {
      setPreparing(false);
    }
  };

  const browse = async () => {
    const extensions = allowedExtensions(device);

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: t("workspace.mobileApplication"),
          extensions,
        },
      ],
    });

    if (typeof selected !== "string") {
      return;
    }

    updateApplication({
      ...application,
      source: "localFile",
      path: selected,
    });
  };

  return (
    <section className="application-card">
      <div className="workspace-card-heading">
        <div>
          <span className="eyebrow">
            {t("workspace.application")}
          </span>
          <h3>{t("workspace.applicationTitle")}</h3>
        </div>
      </div>

      <div className="source-switch">
        <button
          type="button"
          className={
            application.source === "localFile"
              ? "source-active"
              : ""
          }
          onClick={() =>
            updateApplication({
              ...application,
              source: "localFile",
            })
          }
        >
          {t("workspace.localFile")}
        </button>

        <button
          type="button"
          className={
            application.source === "installed"
              ? "source-active"
              : ""
          }
          onClick={() =>
            updateApplication({
              ...application,
              source: "installed",
            })
          }
        >
          {t("workspace.installedApp")}
        </button>
      </div>

      {application.source === "localFile" ? (
        <div className="application-field">
          <label>{t("workspace.applicationFile")}</label>

          <div className="file-picker">
            <div
              className={
                application.path
                  ? "file-value"
                  : "file-value file-placeholder"
              }
            >
              {application.path ??
                t("workspace.noFileSelected")}
            </div>

            <button
              type="button"
              onClick={() => void browse()}
            >
              {t("workspace.browse")}
            </button>
          </div>

          <small>
            {device.platform === "android"
              ? "APK"
              : device.kind === "simulator"
                ? "APP"
                : "IPA"}
          </small>
        </div>
      ) : (
        <div className="application-field">
          <label>
            {device.platform === "android"
              ? t("workspace.package")
              : t("workspace.bundleId")}
          </label>

          <input
            value={application.identifier}
            placeholder={
              device.platform === "android"
                ? "com.example.app"
                : "com.example.app"
            }
            onChange={(event) =>
              updateApplication({
                ...application,
                identifier: event.target.value,
              })
            }
          />
        </div>
      )}

      <div className="prepare-row">
        <button
          type="button"
          className="prepare-button"
          onClick={() => void prepare()}
          disabled={
            preparing ||
            (application.source === "localFile"
              ? !application.path
              : !application.identifier.trim())
          }
        >
          {preparing
            ? "Preparando..."
            : t("workspace.prepare")}
        </button>

        {result && (
          <span className="prepare-result prepare-success">
            {result}
          </span>
        )}

        {prepareError && (
          <span className="prepare-result prepare-error">
            {prepareError}
          </span>
        )}
      </div>
    </section>
  );
}
