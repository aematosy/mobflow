import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { mobileApi } from "../services/mobileApi";
import type {
  MobileElementSnapshot,
  PrepareApplicationResult,
} from "../types/mobile";

interface Props {
  session: PrepareApplicationResult;
  onClose: () => void;
}

function elementLabel(
  element: MobileElementSnapshot,
) {
  return (
    element.contentDescription ||
    element.text ||
    element.resourceId?.split("/").pop() ||
    element.className.split(".").pop() ||
    `Element ${element.index}`
  );
}

export default function SpyPanel({
  session,
  onClose,
}: Props) {
  const [elements, setElements] =
    useState<MobileElementSnapshot[]>([]);

  const [selectedIndex, setSelectedIndex] =
    useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] =
    useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const result =
        await mobileApi.androidSpyElements(
          session.sessionId,
        );

      setElements(result);

      setSelectedIndex((current) => {
        if (
          current !== null &&
          result.some(
            (element) =>
              element.index === current,
          )
        ) {
          return current;
        }

        const useful = result.find(
          (element) =>
            element.locators.length > 0,
        );

        return useful?.index ??
          result[0]?.index ??
          null;
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : String(reason),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [session.sessionId]);

  const visibleElements = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return elements
      .filter(
        (element) =>
          element.displayed ||
          element.clickable ||
          element.locators.length > 0,
      )
      .filter((element) => {
        if (!query) {
          return true;
        }

        return [
          element.className,
          element.text ?? "",
          element.resourceId ?? "",
          element.contentDescription ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [elements, search]);

  const selected =
    elements.find(
      (element) =>
        element.index === selectedIndex,
    ) ?? null;

  return (
    <div
      className="spy-overlay"
      role="dialog"
      aria-modal="true"
    >
      <section className="spy-shell">
        <header className="spy-header">
          <div>
            <span className="eyebrow">
              TESTFLOW MOBILE
            </span>

            <h2>Object Spy</h2>

            <p>
              Inspecta la jerarquía real de la
              aplicación y evalúa sus locators.
            </p>
          </div>

          <div className="spy-header-actions">
            <span className="spy-session-pill">
              UiAutomator2
            </span>

            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading
                ? "Actualizando..."
                : "Actualizar"}
            </button>

            <button
              type="button"
              className="spy-close"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </header>

        <div className="spy-toolbar">
          <div className="spy-search">
            <span>⌕</span>

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar por texto, id, accessibility..."
            />
          </div>

          <div className="spy-toolbar-meta">
            <span>
              {visibleElements.length} visibles
            </span>

            <span>
              {elements.length} totales
            </span>
          </div>
        </div>

        {error && (
          <div className="spy-error">
            {error}
          </div>
        )}

        <div className="spy-layout">
          <aside className="spy-elements">
            <div className="spy-pane-title">
              <div>
                <span className="eyebrow">
                  HIERARCHY
                </span>
                <strong>Elementos</strong>
              </div>

              <span>
                {visibleElements.length}
              </span>
            </div>

            <div className="spy-element-list">
              {loading && !elements.length ? (
                <div className="spy-empty">
                  Leyendo jerarquía mediante
                  Appium...
                </div>
              ) : visibleElements.length ? (
                visibleElements.map(
                  (element) => {
                    const recommended =
                      element.locators.find(
                        (locator) =>
                          locator.recommended,
                      );

                    return (
                      <button
                        type="button"
                        key={element.index}
                        className={
                          selectedIndex ===
                          element.index
                            ? "spy-element spy-element-selected"
                            : "spy-element"
                        }
                        onClick={() =>
                          setSelectedIndex(
                            element.index,
                          )
                        }
                      >
                        <span
                          className={
                            element.clickable
                              ? "spy-element-dot spy-element-clickable"
                              : "spy-element-dot"
                          }
                        />

                        <span className="spy-element-main">
                          <strong>
                            {elementLabel(element)}
                          </strong>

                          <small>
                            {element.className}
                          </small>
                        </span>

                        {recommended && (
                          <span className="spy-element-score">
                            {recommended.score}
                          </span>
                        )}
                      </button>
                    );
                  },
                )
              ) : (
                <div className="spy-empty">
                  No se encontraron elementos.
                </div>
              )}
            </div>
          </aside>

          <main className="spy-inspector">
            {selected ? (
              <>
                <div className="spy-inspector-heading">
                  <div>
                    <span className="eyebrow">
                      SELECTED ELEMENT
                    </span>

                    <h3>
                      {elementLabel(selected)}
                    </h3>

                    <code>
                      {selected.className}
                    </code>
                  </div>

                  <div className="spy-element-flags">
                    {selected.clickable && (
                      <span>Clickable</span>
                    )}

                    {selected.enabled && (
                      <span>Enabled</span>
                    )}
                  </div>
                </div>

                <section className="spy-section">
                  <div className="spy-section-heading">
                    <strong>Atributos</strong>
                  </div>

                  <div className="spy-attributes">
                    <Attribute
                      label="Text"
                      value={selected.text}
                    />

                    <Attribute
                      label="Resource ID"
                      value={
                        selected.resourceId
                      }
                    />

                    <Attribute
                      label="Accessibility"
                      value={
                        selected
                          .contentDescription
                      }
                    />

                    <Attribute
                      label="Package"
                      value={selected.package}
                    />

                    <Attribute
                      label="Bounds"
                      value={
                        selected.bounds
                          ? `${selected.bounds.x}, ${selected.bounds.y} · ${selected.bounds.width}×${selected.bounds.height}`
                          : null
                      }
                    />
                  </div>
                </section>

                <section className="spy-section">
                  <div className="spy-section-heading">
                    <div>
                      <strong>
                        Locator candidates
                      </strong>

                      <span>
                        Ordenados por estabilidad
                      </span>
                    </div>
                  </div>

                  <div className="locator-list">
                    {selected.locators.length ? (
                      selected.locators.map(
                        (locator, index) => (
                          <article
                            className={
                              locator.recommended
                                ? "locator-card locator-recommended"
                                : "locator-card"
                            }
                            key={`${locator.strategy}-${index}`}
                          >
                            <div className="locator-card-top">
                              <div>
                                {locator.recommended && (
                                  <span className="locator-star">
                                    ★
                                  </span>
                                )}

                                <strong>
                                  {locator.strategy}
                                </strong>
                              </div>

                              <span className="locator-score">
                                {locator.score}
                              </span>
                            </div>

                            <code>
                              {locator.value}
                            </code>

                            <p>
                              {locator.reason}
                            </p>
                          </article>
                        ),
                      )
                    ) : (
                      <div className="spy-empty">
                        Este elemento todavía no
                        tiene un locator candidato
                        confiable.
                      </div>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="spy-inspector-empty">
                <strong>
                  Selecciona un elemento
                </strong>

                <span>
                  Sus atributos y locators
                  aparecerán aquí.
                </span>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

function Attribute({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="spy-attribute">
      <span>{label}</span>
      <code>{value || "—"}</code>
    </div>
  );
}
