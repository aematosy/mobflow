import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { mobileApi } from "../../services/mobileApi";

import type {
  ElementBounds,
  InspectorElement,
  InspectorSnapshot,
  LocatorCandidate,
  PrepareApplicationResult,
} from "../../types/mobile";

import DeviceViewport from "./DeviceViewport";
import HierarchyPanel from "./HierarchyPanel";
import "./inspector.css";

import { MobFlowCleanLogo } from "../MobFlowCleanLogo";
import {
  recordBack,
  recordSwipe,
  recordTap,
  type MobileRecording,
} from "./mobile-recorder";

interface Props {
  session: PrepareApplicationResult;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
}

function elementLabel(element: InspectorElement) {
  return (
    element.accessibilityId ||
    element.name ||
    element.label ||
    element.text ||
    element.resourceId?.split("/").pop() ||
    element.elementType.split(".").pop() ||
    "Unnamed element"
  );
}

function shortType(value: string) {
  return value.split(".").pop() || value;
}

export default function MobileInspector({
  session,
  minimized,
  onMinimize,
  onRestore,
  onClose,
}: Props) {
  const [snapshot, setSnapshot] =
    useState<InspectorSnapshot | null>(null);

  const [
    recording,
    setRecording,
  ] = useState<MobileRecording | null>(
    null,
  );



  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [inspectorMode, setInspectorMode] =
    useState<"inspect" | "interact">("inspect");

  const [hoveredId, setHoveredId] =
    useState<string | null>(null);

  const [analyzingId, setAnalyzingId] =
    useState<string | null>(null);

  const [
    locatorAnalysisError,
    setLocatorAnalysisError,
  ] = useState<string | null>(null);



  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);


  /*
   * Spy opens in its expanded workspace mode by default.
   * This is the same state as pressing the Inspector
   * fullscreen button manually.
   */
  const [fullscreen, setFullscreen] =
    useState(true);



  const [locatorStrategy, setLocatorStrategy] =
    useState("xpath");

  const [locatorValue, setLocatorValue] =
    useState("");

  const [locatorTesting, setLocatorTesting] =
    useState(false);

  const [locatorResult, setLocatorResult] =
    useState<number | null>(null);

  const [locatorError, setLocatorError] =
    useState<string | null>(null);

  /*
   * Live visual result of Locator Lab Test.
   *
   * Independent from Inspector selection and hover.
   */
  const [
    locatorHighlightBounds,
    setLocatorHighlightBounds,
  ] = useState<ElementBounds | null>(null);





  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      /*
       * Initial/manual refresh must preserve the last
       * known-good AUT hierarchy when Android is currently
       * showing Launcher, System UI or another application.
       */
      if (
        session.platform === "android"
      ) {
        const beforePackage =
          await mobileApi.androidCurrentPackage(
            session.sessionId,
          );

        if (
          beforePackage !== session.package
        ) {
          /*
           * Inspector is observational.
           *
           * Refresh must never activate, terminate or
           * restart the AUT. Application lifecycle belongs
           * to the parent automation-session owner.
           */
          await mobileApi.addRuntimeLog(
            "error",
            "aut",
            [
              "SNAPSHOT BLOCKED",
              `expected=${session.package}`,
              `actual=${beforePackage}`,
            ].join(" | "),
          );

          throw new Error(
            [
              "AUT is not in foreground.",
              `Expected ${session.package},`,
              `found ${beforePackage}.`,
            ].join(" "),
          );
        }
      }

      const result =
        await mobileApi.androidInspectorSnapshot(
          session.sessionId,
          session.deviceId,
        );

      /*
       * Capturing source/screenshot is not atomic.
       * Validate foreground again before committing it.
       */
      if (
        session.platform === "android"
      ) {
        const afterPackage =
          await mobileApi.androidCurrentPackage(
            session.sessionId,
          );

        if (
          afterPackage !== session.package
        ) {
          await mobileApi.addRuntimeLog(
            "info",
            "aut",
            `SNAPSHOT REJECTED AFTER CAPTURE | expected=${session.package} | actual=${afterPackage}`,
          );

          return;
        }
      }

      setSnapshot(result);

      /*
       * Do not invent an initial Inspector selection.
       *
       * A locator analysis belongs to an explicit user
       * selection. Preserve an existing selection across
       * refreshes only while that element still exists.
       */
      setSelectedId((current) =>
        current &&
        result.elements.some(
          (element) => element.id === current,
        )
          ? current
          : null,
      );
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

  /*
   * Inspector is NOT an AUT lifecycle owner.
   *
   * The active Appium session was prepared by the parent
   * session lifecycle. Opening Spy only observes/captures
   * the current application state.
   */
  useEffect(() => {
    void refresh();
  }, [session.sessionId]);

  const selected = useMemo(
    () =>
      snapshot?.elements.find(
        (element) =>
          element.id === selectedId,
      ) ?? null,
    [snapshot, selectedId],
  );

  const selectElement = async (
    elementId: string,
  ) => {
    /*
     * Selection is immediate.
     * Locator analysis happens independently and only for
     * the selected element.
     */
    setSelectedId(elementId);
    setLocatorAnalysisError(null);

    if (!snapshot) {
      return;
    }

    const target = snapshot.elements.find(
      (element) => element.id === elementId,
    );

    if (!target) {
      return;
    }

    /*
     * Do not repeat a successful analysis during the same
     * snapshot.
     */
    if (target.locators.length > 0) {
      return;
    }

    setAnalyzingId(elementId);

    try {
      const locators =
        await mobileApi.analyzeAndroidElementLocators(
          session.sessionId,
          elementId,
          snapshot.elements,
        );

      /*
       * The user may select another element while this request
       * is running. Update only the element that was analyzed.
       */
      setSnapshot((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          elements: current.elements.map((element) =>
            element.id === elementId
              ? {
                  ...element,
                  locators,
                }
              : element,
          ),
        };
      });
    } catch (reason) {
      setLocatorAnalysisError(
        reason instanceof Error
          ? reason.message
          : String(reason),
      );
    } finally {
      setAnalyzingId((current) =>
        current === elementId
          ? null
          : current,
      );
    }
  };

  const testLocator = async (
    strategy: string,
    value: string,
  ): Promise<number> => {
    const selector = value.trim();

    if (!selector) {
      const message =
        "Enter a locator before testing.";

      setLocatorResult(null);
      setLocatorError(message);
      setLocatorHighlightBounds(null);

      throw new Error(message);
    }

    setLocatorTesting(true);
    setLocatorError(null);
    setLocatorResult(null);
    setLocatorHighlightBounds(null);

    try {
      const result =
        await mobileApi.testLocatorDetail(
          session.sessionId,
          strategy,
          selector,
        );

      setLocatorResult(
        result.matchCount,
      );

      setLocatorHighlightBounds(
        result.matchCount === 1
          ? result.bounds
          : null,
      );

      return result.matchCount;
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : String(reason);

      setLocatorError(message);
      setLocatorHighlightBounds(null);

      throw new Error(message);
    } finally {
      setLocatorTesting(false);
    }
  };

  const [elementCopied, setElementCopied] =
    useState(false);

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  const copyElement = async () => {
    if (!selected) {
      return;
    }

    const recommended =
      selected.locators.find(
        (locator) => locator.recommended,
      ) ?? null;

    await copyText(
      JSON.stringify(
        {
          name: elementLabel(selected),
          platform: selected.platform,
          type: selected.elementType,
          bounds: selected.bounds,
          recommendedLocator: recommended
            ? {
                strategy:
                  recommended.strategy,
                value: recommended.value,
              }
            : null,
        },
        null,
        2,
      ),
    );
    
    setElementCopied(true);

    window.setTimeout(
      () => {
        setElementCopied(false);
      },
      1200,
    );

  };

  return (
    <div
      className={[
        "mi-overlay",
        fullscreen
          ? "mi-fullscreen"
          : "",
        minimized
          ? "mi-minimized"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {minimized && (
        <button
          type="button"
          className="mi-minimized-card"
          onClick={onRestore}
          aria-label="Restore Mobile Inspector"
        >
          <span className="mi-minimized-status">
            <i />
          </span>

          <span className="mi-minimized-copy">
            <strong>Mobile Inspector</strong>

            <small>
              {session.platform.toUpperCase()}
              {" · "}
              {session.automationName}
              {" · session active"}
            </small>
          </span>

          <span className="mi-minimized-action">
            Restore
          </span>
        </button>
      )}

      <section className="mi-shell">
        <header className="mi-header">
          <div className="mi-brand">
            <div className="mi-logo">
              <MobFlowCleanLogo
                className="mi-mobflow-logo"
              />
            </div>

            <div>
              <h2>Mobile Inspector</h2>

              {snapshot && (
                <div className="mi-header-device-meta">
                  <span>
                    {snapshot.screenWidth}
                    {" × "}
                    {snapshot.screenHeight}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mi-header-right">
          <div className="mi-session">
            <span className="mi-connected">
              <i />
              Connected
            </span>

            <strong>
              {session.platform.toUpperCase()}
            </strong>

            <span>
              {session.automationName}
            </span>
          </div>

          <div className="mi-header-actions">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              title="Refresh snapshot"
            >
              ↻
            </button>

            <button
              type="button"
              onClick={() => {
                /*
                 * Minimize only changes visibility.
                 *
                 * Preserve fullscreen so restoring the
                 * Inspector returns to the exact display
                 * state the user had before minimizing.
                 */
                onMinimize();
              }}
              title="Minimize Inspector"
              aria-label="Minimize Inspector"
            >
              —
            </button>

            <button
              type="button"
              onClick={() =>
                setFullscreen(
                  (value) => !value,
                )
              }
              title="Fullscreen"
            >
              {fullscreen ? "↙" : "⛶"}
            </button>

            <button
              type="button"
              className="mi-close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          </div>

        </header>

        {error && (
          <div className="mi-error">
            {error}
          </div>
        )}

        

        <div className="mi-workbench">
          {snapshot && (
            <HierarchyPanel
              snapshot={snapshot}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={(id) => {
                void selectElement(id);
              }}
              onHover={setHoveredId}
              onTestLocator={(
                strategy,
                value,
              ) => {
                setLocatorStrategy(strategy);
                setLocatorValue(value);

                void testLocator(
                  strategy,
                  value,
                );
              }}
            />
          )}

          {snapshot && (
            <DeviceViewport
              showHeader={false}
              snapshot={snapshot}
              streaming={false}
              recording={recording !== null}
              deviceId={session.deviceId}
              platform={
                session.platform === "ios"
                  ? "ios"
                  : "android"
              }
              applicationPackage={session.package}
              selectedId={selectedId}
              hoveredId={hoveredId}
              locatorHighlightBounds={
                locatorHighlightBounds
              }
              onHover={setHoveredId}
              onSelect={(id) => {
                void selectElement(id);
              }}
              onSnapshot={(nextSnapshot) => {
                setSnapshot(nextSnapshot);

                setSelectedId((current) =>
                  nextSnapshot.elements.some(
                    (element) =>
                      element.id === current,
                  )
                    ? current
                    : null,
                );

                setHoveredId(null);
              }}
              onError={setError}
              onModeChange={setInspectorMode}

              onRecordedTap={(
                element,
                point,
              ) => {
                setRecording(
                  (current) =>
                    current
                      ? recordTap(
                          current,
                          {
                            element,
                            point,
                          },
                        )
                      : current,
                );
              }}

              onRecordedSwipe={(
                direction,
                start,
                end,
                durationMs,
              ) => {
                setRecording(
                  (current) =>
                    current
                      ? recordSwipe(
                          current,
                          {
                            direction,
                            start,
                            end,
                            durationMs,
                          },
                        )
                      : current,
                );
              }}

              onRecordedBack={() => {
                setRecording(
                  (current) =>
                    current
                      ? recordBack(
                          current,
                        )
                      : current,
                );
              }}
            />
          )}

          <aside className="mi-inspector-panel">
            <PanelHeader
              title="Inspector"
              meta={
                inspectorMode === "interact"
                  ? "Interaction mode"
                  : selected
                    ? shortType(
                        selected.elementType,
                      )
                    : "No selection"
              }
            />

            <div className="mi-inspector-scroll">
              {inspectorMode === "interact" ? (
                <div className="mi-interaction-mode-state">
                  <div className="mi-interaction-mode-icon">
                    ↗
                  </div>

                  <strong>
                    Interaction mode active
                  </strong>

                  <span>
                    Interact directly with the connected device.
                  </span>

                  <div className="mi-interaction-mode-actions">
                    <span>Tap</span>
                    <span>Swipe</span>
                    <span>Navigate</span>
                  </div>

                  <small>
                    Switch back to Inspect to view element properties and locators.
                  </small>
                </div>
              ) : selected ? (
                <>
                  <div className="mi-element-title">
                    <div>
                      <span>
                        SELECTED ELEMENT
                      </span>

                      <h3>
                        {elementLabel(
                          selected,
                        )}
                      </h3>

                      <code>
                        {
                          selected.elementType
                        }
                      </code>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void copyElement()
                      }
                    >
                      {elementCopied
                        ? "✓ Copied"
                        : "Copy element"}
                    </button>
                  </div>

                  <PropertySection
                    element={selected}
                  />

                  <section className="mi-section mi-locator-lab">
                    <div className="mi-section-title">
                      <div>
                        <strong>Locator Lab</strong>
                        <span>
                          Validate any locator against the live session
                        </span>
                      </div>
                    </div>

                    <div className="mi-locator-test-row">
                      <select
                        aria-label="Locator strategy"
                        value={locatorStrategy}
                        onChange={(event) => {
                          setLocatorStrategy(
                            event.target.value,
                          );
                          setLocatorResult(null);
                          setLocatorError(null);
                          setLocatorHighlightBounds(null);
                        }}
                      >
                        <option value="accessibility-id">
                          Accessibility ID
                        </option>
                        <option value="id">
                          ID
                        </option>
                        <option value="android-uiautomator">
                          UiAutomator2
                        </option>
                        <option value="xpath">
                          XPath
                        </option>
                        <option value="ios-predicate">
                          iOS Predicate
                        </option>
                        <option value="ios-class-chain">
                          iOS Class Chain
                        </option>
                      </select>

                      <input
                        aria-label="Locator value"
                        value={locatorValue}
                        onChange={(event) => {
                          setLocatorValue(
                            event.target.value,
                          );
                          setLocatorResult(null);
                          setLocatorError(null);
                          setLocatorHighlightBounds(null);
                        }}
                        placeholder="Paste or write a locator..."
                      />
                    </div>

                    <div className="mi-locator-test-actions">
                      <button
                        type="button"
                        className="mi-locator-clean"
                        disabled={
                          locatorTesting
                          || (
                            !locatorValue
                            && locatorResult === null
                            && locatorError === null
                            && locatorHighlightBounds === null
                          )
                        }
                        onClick={() => {
                          setLocatorValue("");
                          setLocatorResult(null);
                          setLocatorError(null);
                          setLocatorHighlightBounds(null);
                        }}
                      >
                        Clean
                      </button>

                      <button
                        type="button"
                        className="mi-locator-verify"
                        disabled={locatorTesting}
                        onClick={() =>
                          void testLocator(
                            locatorStrategy,
                            locatorValue,
                          )
                        }
                      >
                        {locatorTesting ? (
                          "Verifying..."
                        ) : (
                          <>
                            <span
                              className="mi-verify-icon"
                              aria-hidden="true"
                            >
                              ⌕
                            </span>
                            <span>Verify</span>
                          </>
                        )}
                      </button>
                    </div>

                    {locatorResult !== null && (
                      <div
                        className={
                          locatorResult === 1
                            ? "mi-test-result mi-test-success"
                            : "mi-test-result mi-test-warning"
                        }
                      >
                        <strong>
                          {locatorResult === 1
                            ? "✓ MATCH 1"
                            : locatorResult === 0
                              ? "NO MATCH"
                              : `⚠ ${locatorResult} MATCHES`}
                        </strong>

                        <span>
                          {locatorResult === 1
                            ? "Unique in the current live hierarchy."
                            : locatorResult === 0
                              ? "The locator does not resolve an element."
                              : "Locator is ambiguous and should not be used."}
                        </span>
                      </div>
                    )}

                    {locatorError && (
                      <div className="mi-test-result mi-test-error">
                        <strong>Test failed</strong>
                        <span>{locatorError}</span>
                      </div>
                    )}
                  </section>

                  <section className="mi-section">
                    <div className="mi-section-title">
                      <div>
                        <strong>
                          Verified locators
                        </strong>

                        <span>
                          MATCH 1 only · up to 4
                        </span>
                      </div>

                      <span className="mi-count">
                        {
                          selected.locators
                            .length
                        }
                      </span>
                    </div>

                    <div className="mi-locator-list">
                      {selected.locators
                        .length ? (
                        selected.locators.map(
                          (locator) => (
                            <LocatorCard
                              key={`${locator.strategy}-${locator.value}`}
                              locator={
                                locator
                              }
                              onCopy={
                                copyText
                              }
                            />
                          ),
                        )
                      ) : (
                        <div className="mi-locator-state">
                          {analyzingId === selected.id ? (
                            <div className="mi-locator-analysis mi-locator-analysis-running">
                              <span
                                className="mi-locator-spinner"
                                aria-hidden="true"
                              />

                              <div className="mi-locator-analysis-content">
                                <strong>
                                  Analyzing locators
                                </strong>

                                <span>
                                  Testing native, semantic and relational candidates against the live session.
                                </span>
                              </div>
                            </div>
                          ) : locatorAnalysisError ? (
                            <div className="mi-locator-analysis mi-locator-analysis-error">
                              <span
                                className="mi-locator-analysis-icon"
                                aria-hidden="true"
                              >
                                !
                              </span>

                              <div className="mi-locator-analysis-content">
                                <strong>
                                  Locator analysis failed
                                </strong>

                                <span>
                                  {locatorAnalysisError}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="mi-no-locator">
                              <strong>
                                No safe locator found
                              </strong>

                              <span>
                                No candidate resolved exactly one element in the current live hierarchy.
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <InspectorEmpty
                  text="Select an element from the hierarchy or device."
                />
              )}
            </div>
          </aside>
        </div>

        <div className="mi-statusbar">
          <div>
            <span className="mi-status-dot" />
            Session active
          </div>

          <div>
            {snapshot
              ? `${snapshot.elements.length} elements · ${snapshot.platform.toUpperCase()} · ${snapshot.automationName}`
              : "Waiting for snapshot"}
          </div>
        </div>
      </section>
    </div>
  );
}

function PanelHeader({
  title,
  meta,
}: {
  title: string;
  meta: string;
}) {
  return (
    <div className="mi-panel-header">
      <strong>{title}</strong>
      <span>{meta}</span>
    </div>
  );
}

function InspectorEmpty({
  text,
}: {
  text: string;
}) {
  return (
    <div className="mi-empty">
      {text}
    </div>
  );
}

function PropertySection({
  element,
}: {
  element: InspectorElement;
}) {
  const properties = [
    ["Accessibility", element.accessibilityId],
    ["Resource ID", element.resourceId],
    ["Text", element.text],
    ["Name", element.name],
    ["Label", element.label],
    ["Value", element.value],
    [
      "Bounds",
      element.bounds
        ? `${element.bounds.x}, ${element.bounds.y} · ${element.bounds.width}×${element.bounds.height}`
        : null,
    ],
  ];

  return (
    <section className="mi-section">
      <div className="mi-section-title">
        <strong>Properties</strong>
      </div>

      <div className="mi-properties">
        {properties.map(
          ([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <code>{value || "—"}</code>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function escapeLocatorString(
  value: string,
): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function appiumLocatorCode(
  locator: LocatorCandidate,
): string {
  const value =
    escapeLocatorString(
      locator.value,
    );

  switch (locator.strategy) {
    case "accessibility-id":
      return `AppiumBy.accessibilityId("${value}")`;

    case "id":
      return `AppiumBy.id("${value}")`;

    case "android-uiautomator":
      return `AppiumBy.androidUIAutomator("${value}")`;

    case "xpath":
      return `AppiumBy.xpath("${value}")`;

    case "ios-predicate":
      return `AppiumBy.iOSNsPredicateString("${value}")`;

    default:
      return `${locator.strategy}: ${locator.value}`;
  }
}

function LocatorCard({
  locator,
  onCopy,
}: {
  locator: LocatorCandidate;
  onCopy: (value: string) => Promise<void>;
}) {
  const [copiedAction, setCopiedAction] =
    useState<"selector" | "appium" | "template" | null>(
      null,
    );

  const copyWithFeedback = async (
    kind: "selector" | "appium" | "template",
    value: string,
  ) => {
    await onCopy(value);

    setCopiedAction(kind);

    window.setTimeout(
      () => {
        setCopiedAction((current) =>
          current === kind
            ? null
            : current,
        );
      },
      1200,
    );
  };

  const parameterized =
    Boolean(
      locator.template &&
        locator.parameterName &&
        locator.parameterExample,
    );

  return (
    <article
      className={[
        "mi-locator-card",
        locator.recommended
          ? "mi-locator-card-recommended"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="mi-locator-card-header">
        <div className="mi-locator-identity">
          <span className="mi-locator-role">
            {locator.recommended
              ? "Suggested locator"
              : "Alternative"}
          </span>

          <div className="mi-locator-strategy-line">
            <strong>
              {locator.strategy}
            </strong>

            <span className="mi-locator-category">
              {locator.category}
            </span>
          </div>
        </div>

        <div className="mi-locator-score">
          <strong>{locator.score}</strong>
          <span>SCORE</span>
        </div>
      </header>

      <section className="mi-locator-code-section">
        <code className="mi-locator-code">
          {locator.value}
        </code>

        <span className="mi-locator-unique">
          Unique
        </span>

        <div className="mi-locator-actions-v3">
          <button
            type="button"
            className="mi-locator-action-primary"
            onClick={() =>
              void copyWithFeedback(
                "selector",
                locator.value,
              )
            }
          >
            {copiedAction === "selector"
              ? "✓ Copied"
              : "Copy selector"}
          </button>

          <button
            type="button"
            className="mi-locator-action-appium"
            onClick={() =>
              void copyWithFeedback(
                "appium",
                appiumLocatorCode(locator),
              )
            }
          >
            {copiedAction === "appium"
              ? "✓ Copied"
              : "Copy Appium"}
          </button>
        </div>
      </section>

      {parameterized && (
        <section className="mi-locator-template-section">
          <div className="mi-locator-template-title">
            <strong>
              Reusable template
            </strong>
          </div>

          <div className="mi-locator-parameter-summary">
            <code>
              {locator.parameterName}
            </code>

            <span>→</span>

            <code>
              {locator.parameterExample}
            </code>
          </div>

          <code className="mi-locator-template-code">
            {locator.template}
          </code>

          <div className="mi-locator-template-actions">
            <button
              type="button"
              className="mi-locator-action-template mi-locator-action-primary"
              onClick={() =>
                void copyWithFeedback(
                  "template",
                  locator.template!,
                )
              }
            >
              {copiedAction === "template"
                ? "✓ Copied"
                : "Copy template"}
            </button>
          </div>
        </section>
      )}
    </article>
  );
}
