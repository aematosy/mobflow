import { useTranslation } from "react-i18next";

import type {
  PrepareApplicationResult,
  SessionHealth,
} from "../types/mobile";

interface Props {
  session: PrepareApplicationResult | null;
  sessionHealth: SessionHealth | null;
  sessionHealthChecking: boolean;
  autForeground: boolean | null;
  onOpenRecord: () => void;
  onOpenSpy: () => void;
  onOpenRecordings: () => void;
  onRelaunchApplication: () => void;
  onRecoverSession: () => void;
  onRestartSession: () => void;
  onEndSession: () => void;
  sessionTransitioning: boolean;
  recordingCount: number;
}

export default function AutomationPanel({
  session,
  sessionHealth,
  sessionHealthChecking,
  autForeground,
  onOpenRecord,
  onOpenSpy,
  onOpenRecordings,
  onRelaunchApplication,
  onRecoverSession,
  onRestartSession,
  onEndSession,
  sessionTransitioning,
  recordingCount,
}: Props) {
  const { t } = useTranslation();

  /*
   * A stored session id is identity, not proof of health.
   *
   * Recorder and Inspector are available only after Appium
   * confirms that the current session still exists.
   */
  const appiumReady =
    Boolean(session?.sessionId)
    && sessionHealth?.alive === true
    && !sessionHealthChecking;

  const autUnavailable =
    appiumReady
    && autForeground === false;

  const ready =
    appiumReady
    && autForeground !== false
    && !sessionTransitioning;

  const sessionLost =
    Boolean(session?.sessionId)
    && !sessionHealthChecking
    && sessionHealth?.alive === false;

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
              : sessionLost
                ? "session-status session-lost"
                : sessionTransitioning
                  ? "session-status session-transitioning"
                  : "session-status"
          }
        >
          {sessionTransitioning
            ? "PROCESANDO"
            : sessionLost
              ? "SESIÓN PERDIDA"
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

          <div
            className={[
              "session-live-indicator",
              sessionLost
                ? "session-live-indicator-lost"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span
              className={[
                "session-live-dot",
                sessionLost
                  ? "session-live-dot-lost"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />

            <div>
              <strong>
                {sessionTransitioning
                  ? "Actualizando sesión"
                  : sessionHealthChecking
                    ? "Verificando sesión"
                    : sessionLost
                      ? "Sesión perdida"
                      : ready
                        ? "Sesión activa"
                        : "Sesión no verificada"}
              </strong>

              <span>
                {sessionTransitioning
                  ? "Espera mientras MobFlow actualiza el contexto de automatización."
                  : sessionHealthChecking
                    ? "MobFlow está verificando la sesión Appium."
                    : sessionLost
                      ? "Appium ya no reconoce esta sesión."
                      : ready
                        ? "UiAutomator2 está listo para Recorder e Inspector."
                        : "La sesión Appium todavía no ha sido verificada."}
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
            <strong>
              {autUnavailable
                ? "AUT no disponible"
                : "Herramientas disponibles al preparar la sesión"}
            </strong>

            <span>
              {autUnavailable
                ? "Appium continúa conectado, pero la aplicación bajo prueba no está activa."
                : "Recorder e Inspector se habilitarán cuando Appium esté listo."}
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

      {session && (
        <div className="automation-session-lifecycle">
          {autUnavailable && (
            <button
              type="button"
              className="automation-aut-relaunch"
              onClick={onRelaunchApplication}
              disabled={sessionTransitioning}
            >
              <span aria-hidden="true">↻</span>
              Relanzar aplicación
            </button>
          )}

          {sessionLost && (
            <button
              type="button"
              className="automation-session-recover"
              onClick={onRecoverSession}
              disabled={sessionTransitioning}
            >
              <span aria-hidden="true">↻</span>
              Recuperar sesión
            </button>
          )}

          <button
            type="button"
            className="automation-session-restart"
            onClick={onRestartSession}
            disabled={sessionTransitioning}
          >
            <span aria-hidden="true">↻</span>
            Nueva sesión
          </button>

          <button
            type="button"
            className="automation-session-end"
            onClick={onEndSession}
            disabled={sessionTransitioning}
          >
            Finalizar sesión
          </button>
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
