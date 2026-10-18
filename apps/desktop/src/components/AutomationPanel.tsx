import { useTranslation } from "react-i18next";

import type {
  PrepareApplicationResult,
} from "../types/mobile";

interface Props {
  session: PrepareApplicationResult | null;
  onOpenRecord: () => void;
  onOpenSpy: () => void;
  onOpenRecordings: () => void;
  onRestartSession: () => void;
  onEndSession: () => void;
  sessionTransitioning: boolean;
  recordingCount: number;
}

export default function AutomationPanel({
  session,
  onOpenRecord,
  onOpenSpy,
  onOpenRecordings,
  onRestartSession,
  onEndSession,
  sessionTransitioning,
  recordingCount,
}: Props) {
  const { t } = useTranslation();

  const ready =
    Boolean(session?.sessionId) &&
    !sessionTransitioning;

  return (
    <section className="automation-card">
      <div className="workspace-card-heading">
        <div>
          <span className="eyebrow">
            {t("automation.eyebrow")}
          </span>

          <h3>{t("automation.title")}</h3>
        </div>

        <span
          className={
            ready
              ? "session-status session-ready"
              : sessionTransitioning
                ? "session-status session-transitioning"
                : "session-status"
          }
        >
          {sessionTransitioning
            ? "PROCESANDO"
            : ready
              ? t("automation.ready")
              : t("automation.notReady")}
        </span>
      </div>

      {session ? (
        <>
          <div className="session-summary">
            <div className="session-summary-row">
              <span>{t("automation.engine")}</span>
              <strong>{session.automationName}</strong>
            </div>

            <div className="session-summary-row">
              <span>{t("automation.package")}</span>
              <strong>{session.package}</strong>
            </div>

            <div className="session-summary-row">
              <span>{t("automation.activity")}</span>
              <strong>{session.activity}</strong>
            </div>

            <div className="session-summary-row">
              <span>{t("automation.session")}</span>
              <code>{session.sessionId}</code>
            </div>
          </div>

          <div className="session-live-indicator">
            <span className="session-live-dot" />

            <div>
              <strong>
                {sessionTransitioning
                  ? "Actualizando sesión"
                  : "Sesión activa"}
              </strong>

              <span>
                {sessionTransitioning
                  ? "Espera mientras MobFlow actualiza el contexto de automatización."
                  : "UiAutomator2 está listo para Recorder e Inspector."}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="automation-empty">
          <strong>{t("automation.emptyTitle")}</strong>
          <span>{t("automation.emptyText")}</span>
        </div>
      )}

      {ready ? (
        <>
          <div className="automation-actions">
            <button
              type="button"
              className="automation-tool automation-tool-recorder"
              onClick={onOpenRecord}
            >
              <span
                className="automation-rec-indicator"
                aria-hidden="true"
              >
                <i />
                REC
              </span>

              <span>Recorder</span>
            </button>

            <button
              type="button"
              className="automation-tool automation-tool-inspector"
              onClick={onOpenSpy}
            >
              <span
                className="automation-tool-icon"
                aria-hidden="true"
              >
                ⌕
              </span>

              <span>Inspector</span>
            </button>

            <button
              type="button"
              className="automation-tool automation-tool-recordings"
              onClick={onOpenRecordings}
            >
              <span
                className="automation-tool-icon"
                aria-hidden="true"
              >
                ▣
              </span>

              <span>Recordings</span>

              {recordingCount > 0 && (
                <span className="automation-count-badge">
                  {recordingCount}
                </span>
              )}
            </button>
          </div>

          <div className="automation-session-lifecycle">
            <button
              type="button"
              className="automation-session-restart"
              onClick={onRestartSession}
            >
              <span aria-hidden="true">↻</span>
              Nueva sesión
            </button>

            <button
              type="button"
              className="automation-session-end"
              onClick={onEndSession}
            >
              Finalizar sesión
            </button>
          </div>
        </>
      ) : (
        <div className="automation-tools-locked">
          <div
            className="automation-tools-locked-icon"
            aria-hidden="true"
          >
            ◉
          </div>

          <div className="automation-tools-locked-copy">
            <strong>Herramientas disponibles al preparar la sesión</strong>

            <span>
              Recorder e Inspector se habilitarán cuando
              Appium esté listo.
            </span>
          </div>

          <div className="automation-tools-preview">
            <span>
              <i className="automation-preview-rec" />
              Recorder
            </span>

            <span>
              <b>⌕</b>
              Inspector
            </span>

            <span>
              <b>▣</b>
              Recordings
              {recordingCount > 0 && (
                <em>{recordingCount}</em>
              )}
            </span>
          </div>
        </div>
      )}

      <p className="automation-hint">
        {sessionTransitioning
          ? "No cierres MobFlow mientras se actualiza la sesión."
          : ready
            ? t("automation.readyHint")
            : t("automation.waitingHint")}
      </p>
    </section>
  );
}
