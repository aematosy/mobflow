import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { mobileApi } from "../services/mobileApi";
import type {
  AppiumLiveLine,
  LogEntry,
} from "../types/mobile";

type RuntimeFilter =
  | "events"
  | "commands"
  | "appiumLive"
  | "autRecovery"
  | "errors";

interface Props {
  onClose: () => void;
}

function formatTime(timestampMs: number) {
  const date = new Date(timestampMs);

  const hours = String(
    date.getHours(),
  ).padStart(2, "0");

  const minutes = String(
    date.getMinutes(),
  ).padStart(2, "0");

  const seconds = String(
    date.getSeconds(),
  ).padStart(2, "0");

  const milliseconds = String(
    date.getMilliseconds(),
  ).padStart(3, "0");

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function eventVisible(
  entry: LogEntry,
  filter: RuntimeFilter,
) {
  switch (filter) {
    case "commands":
      return entry.source === "command";

    case "autRecovery":
      return (
        entry.source === "aut" ||
        entry.source === "recovery"
      );

    case "errors":
      return entry.level === "error";

    case "events":
      return (
        entry.source !== "command" &&
        entry.source !== "aut" &&
        entry.source !== "recovery" &&
        entry.level !== "error"
      );

    default:
      return true;
  }
}

export default function LogConsole({
  onClose,
}: Props) {
  const { t } = useTranslation();

  const [filter, setFilter] =
    useState<RuntimeFilter>("events");

  const [logs, setLogs] =
    useState<LogEntry[]>([]);

  const [appiumLines, setAppiumLines] =
    useState<AppiumLiveLine[]>([]);

  const [autoScroll, setAutoScroll] =
    useState(true);

  const [paused, setPaused] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [liveZoom, setLiveZoom] =
    useState<number>(() => {
      const stored =
        localStorage.getItem("testflow-appium-live-zoom");

      const parsed = stored
        ? Number(stored)
        : 100;

      return Number.isFinite(parsed)
        ? Math.min(160, Math.max(75, parsed))
        : 100;
    });

  const changeLiveZoom = (next: number) => {
    const value =
      Math.min(160, Math.max(75, next));

    setLiveZoom(value);

    localStorage.setItem(
      "testflow-appium-live-zoom",
      String(value),
    );
  };

  const liveEndRef =
    useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      if (filter === "appiumLive") {
        const result =
          await mobileApi.appiumLiveLogs();

        setAppiumLines(result);
      } else {
        const result =
          await mobileApi.logs();

        setLogs(result);
      }
    } catch (error) {
      console.error(
        "Unable to refresh runtime logs",
        error,
      );
    }
  }, [filter]);

  useEffect(() => {
    void refresh();

    if (paused) {
      return;
    }

    const timer = window.setInterval(
      () => void refresh(),
      750,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [paused, refresh]);

  useEffect(() => {
    if (
      filter === "appiumLive" &&
      autoScroll &&
      !paused
    ) {
      liveEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [
    appiumLines.length,
    autoScroll,
    filter,
    paused,
  ]);

  const filteredLogs = useMemo(
    () =>
      logs
        .filter((entry) =>
          eventVisible(entry, filter),
        )
        .filter((entry) => {
          if (!search.trim()) {
            return true;
          }

          const value = [
            entry.source,
            entry.level,
            entry.message,
            entry.command ?? "",
            entry.stdout ?? "",
            entry.stderr ?? "",
          ]
            .join(" ")
            .toLowerCase();

          return value.includes(
            search.trim().toLowerCase(),
          );
        })
        .reverse(),
    [filter, logs, search],
  );

  const filteredAppiumLines = useMemo(
    () => {
      const query =
        search.trim().toLowerCase();

      if (!query) {
        return appiumLines;
      }

      return appiumLines.filter((line) =>
        `${line.stream} ${line.text}`
          .toLowerCase()
          .includes(query),
      );
    },
    [appiumLines, search],
  );

  const clear = async () => {
    if (filter === "appiumLive") {
      await mobileApi.clearAppiumLiveLogs();
      setAppiumLines([]);
    } else {
      await mobileApi.clearLogs();
      setLogs([]);
    }
  };

  return (
    <div
      className="log-overlay"
      role="dialog"
      aria-modal="true"
    >
      <aside className="log-console">
        <header className="log-header">
          <div>
            <span className="eyebrow">
              TESTFLOW RUNTIME
            </span>

            <h2>{t("logs.title")}</h2>

            <p>{t("logs.subtitle")}</p>
          </div>

          <div className="log-header-actions">
            <button
              type="button"
              onClick={() => void refresh()}
            >
              {t("logs.refresh")}
            </button>

            <button
              type="button"
              onClick={() => void clear()}
            >
              {t("logs.clear")}
            </button>

            <button
              type="button"
              className="log-close"
              onClick={onClose}
            >
              {t("logs.close")}
            </button>
          </div>
        </header>

        <nav className="log-filters">
          {(
            [
              ["events", "Eventos"],
              ["commands", "Comandos"],
              ["appiumLive", "Appium Live"],
              ["autRecovery", "AUT / Recovery"],
              ["errors", "Errores"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                filter === value
                  ? "log-filter-active"
                  : ""
              }
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="log-toolbar">
          <div className="log-search">
            <span>⌕</span>

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder={
                filter === "appiumLive"
                  ? "Buscar en Appium..."
                  : "Buscar logs..."
              }
            />
          </div>

          {filter === "appiumLive" && (
            <div className="live-controls">
              <span className="live-indicator">
                <span className="live-dot" />
                LIVE
              </span>

              <span className="live-count">
                {filteredAppiumLines.length} líneas
              </span>

              <div className="live-zoom">
                <button
                  type="button"
                  aria-label="Alejar"
                  disabled={liveZoom <= 75}
                  onClick={() =>
                    changeLiveZoom(liveZoom - 10)
                  }
                >
                  −
                </button>

                <button
                  type="button"
                  className="live-zoom-value"
                  title="Restablecer zoom"
                  onClick={() =>
                    changeLiveZoom(100)
                  }
                >
                  {liveZoom}%
                </button>

                <button
                  type="button"
                  aria-label="Acercar"
                  disabled={liveZoom >= 160}
                  onClick={() =>
                    changeLiveZoom(liveZoom + 10)
                  }
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className={
                  paused ? "control-active" : ""
                }
                onClick={() =>
                  setPaused((value) => !value)
                }
              >
                {paused ? "Continuar" : "Pausar"}
              </button>

              <button
                type="button"
                className={
                  autoScroll
                    ? "control-active"
                    : ""
                }
                onClick={() =>
                  setAutoScroll(
                    (value) => !value,
                  )
                }
              >
                Auto-scroll
              </button>
            </div>
          )}
        </div>

        {filter === "appiumLive" ? (
          <div
            className="appium-live-terminal"
            style={{
              "--live-zoom":
                liveZoom / 100,
            } as CSSProperties}
          >
            {filteredAppiumLines.length ? (
              filteredAppiumLines.map(
                (line, index) => (
                  <div
                    className={`appium-live-line ${
                      line.stream === "stderr"
                        ? "appium-live-stderr"
                        : ""
                    }`}
                    key={`${line.timestampMs}-${index}`}
                  >
                    <time>
                      {formatTime(
                        line.timestampMs,
                      )}
                    </time>

                    <span className="appium-stream">
                      {line.stream === "stderr"
                        ? "ERR"
                        : "OUT"}
                    </span>

                    <pre>{line.text}</pre>
                  </div>
                ),
              )
            ) : (
              <div className="appium-live-empty">
                <strong>
                  Esperando actividad de Appium
                </strong>

                <span>
                  La salida del servidor aparecerá
                  aquí en tiempo real.
                </span>
              </div>
            )}

            <div ref={liveEndRef} />
          </div>
        ) : (
          <div className="log-list">
            {filteredLogs.length ? (
              filteredLogs.map(
                (entry, index) => (
                  <article
                    key={`${entry.timestampMs}-${index}`}
                    className={`log-entry log-${entry.level}`}
                  >
                    <div className="log-entry-heading">
                      <time>
                        {formatTime(
                          entry.timestampMs,
                        )}
                      </time>

                      <span>
                        {entry.level.toUpperCase()}
                      </span>

                      <span>
                        {entry.source.toUpperCase()}
                      </span>

                      {entry.durationMs !== null && (
                        <em>
                          {entry.durationMs} ms
                        </em>
                      )}
                    </div>

                    <div className="log-message">
                      {entry.message}
                    </div>

                    {entry.command && (
                      <pre className="log-command">
                        $ {entry.command}
                      </pre>
                    )}

                    {entry.stdout && (
                      <details>
                        <summary>stdout</summary>
                        <pre>
                          {entry.stdout}
                        </pre>
                      </details>
                    )}

                    {entry.stderr && (
                      <details>
                        <summary>stderr</summary>
                        <pre>
                          {entry.stderr}
                        </pre>
                      </details>
                    )}
                  </article>
                ),
              )
            ) : (
              <div className="log-empty">
                {t("logs.empty")}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
