import {
  listen } from "@tauri-apps/api/event";
import {
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";


import type {
  InspectorSnapshot,
  PrepareApplicationResult,
} from "../../types/mobile";

import { mobileApi } from "../../services/mobileApi";

import DeviceViewport from "../inspector/DeviceViewport";
import {
  findActionableRecordingTargetAtPoint,
} from "../inspector/inspector.utils";

import {
  createRecording,
  recordBack,
  recordSwipe,
  recordTap,
  stopRecording,
  type MobileRecordedStep,
  type MobileRecording,
} from "../inspector/mobile-recorder";

interface Props {
  session: PrepareApplicationResult;
  onClose: () => void;
}

function targetLabel(
  step: MobileRecordedStep,
): string {
  const target = step.target;

  if (!target) {
    if (
      step.action === "swipe"
      && step.gesture
    ) {
      return `Swipe ${step.gesture.direction}`;
    }

    if (step.action === "back") {
      return "Back";
    }

    return step.action;
  }

  return (
    target.name
    || target.text
    || target.label
    || target.value
    || target.accessibilityId
    || target.resourceId
    || target.elementType
  );
}

function actionLabel(
  action: MobileRecordedStep["action"],
): string {
  switch (action) {
    case "tap":
      return "TAP";

    case "swipe":
      return "SWIPE";

    case "back":
      return "BACK";
  }
}

interface PhysicalGesture {
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
}

export default function MobileRecorder({
  session,
  onClose,
}: Props) {
  const [snapshot, setSnapshot] =
    useState<InspectorSnapshot | null>(
      null,
    );

  /*
   * Operational snapshot.
   *
   * React state renders the UI; asynchronous physical
   * callbacks read this ref to avoid stale closures.
   */
  const snapshotRef =
    useRef<InspectorSnapshot | null>(
      null,
    );

  /*
   * PRE snapshot lifecycle.
   *
   * A hierarchy may resolve at most one physical gesture.
   * After consumption, a new settled hierarchy must be
   * captured for the next gesture.
   */
  const snapshotSeqRef =
    useRef(0);

  const snapshotMetaRef =
    useRef<{
      seq: number;
      capturedAt: number;
    } | null>(
      null,
    );

  const consumedSnapshotSeqRef =
    useRef(0);

  const settledRefreshTimerRef =
    useRef<number | null>(
      null,
    );

  const [recording, setRecording] =
    useState<MobileRecording>(() =>
      createRecording(
        session.platform === "ios"
          ? "ios"
          : "android",
        session.deviceId,
        session.package,
      ),
    );

  const [selectedStepId, setSelectedStepId] =
    useState<string | null>(null);

  const [selectedElementId, setSelectedElementId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [phase, setPhase] =
    useState<"recording" | "review" | "running">(
      "recording",
    );

  const [elapsedMs, setElapsedMs] =
    useState(0);

  useEffect(() => {
    if (phase !== "recording") {
      return;
    }

    const update = () => {
      setElapsedMs(
        Date.now()
          - recording.startedAt,
      );
    };

    update();

    const timer =
      window.setInterval(
        update,
        1000,
      );

    return () =>
      window.clearInterval(timer);
  }, [
    phase,
    recording.startedAt,
  ]);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        if (
          session.platform !== "android"
        ) {
          throw new Error(
            "iOS Recorder adapter is not implemented yet.",
          );
        }

        /*
         * Every new recording starts from a deterministic
         * AUT launch, not from the screen left by the
         * previous recording.
         */
        await mobileApi.terminateAndroidApp(
          session.sessionId,
          session.package,
        );

        await mobileApi.activateAndroidApp(
          session.sessionId,
          session.package,
        );

        await new Promise((resolve) =>
          window.setTimeout(
            resolve,
            700,
          ),
        );

        const next =
          await mobileApi.androidInspectorSnapshot(
            session.sessionId,
            session.deviceId,
          );

        if (disposed) {
          return;
        }

        snapshotRef.current =
          next;

        snapshotMetaRef.current = {
          seq:
            ++snapshotSeqRef.current,
          capturedAt:
            performance.now(),
        };

        snapshotRef.current =
        next;

      snapshotMetaRef.current = {
        seq:
          ++snapshotSeqRef.current,
        capturedAt:
          performance.now(),
      };

      setSnapshot(next);
      } catch (reason) {
        if (disposed) {
          return;
        }

        setError(
          reason instanceof Error
            ? reason.message
            : String(reason),
        );
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, [
    session.platform,
    session.sessionId,
  ]);

  const handlePhysicalGesture =
    async (
      gesture: PhysicalGesture,
    ) => {
      try {
        setError(null);

        await mobileApi.addRuntimeLog(
          "info",
          "aut",
          [
            "PHYSICAL GESTURE HANDLING",
            `kind=${gesture.kind}`,
            `start=${gesture.startX},${gesture.startY}`,
            `end=${gesture.endX},${gesture.endY}`,
          ].join(" | "),
        );

        /*
         * The current snapshot represents PRE-action state
         * as closely as possible.
         *
         * Physical gesture has ALREADY happened.
         * We only identify and record it.
         */
        if (gesture.kind === "tap") {
          const snapshotMeta =
            snapshotMetaRef.current;

          const currentSnapshot =
            snapshotRef.current;

          const snapshotUsable =
            currentSnapshot !== null
            && snapshotMeta !== null
            && snapshotMeta.seq
              > consumedSnapshotSeqRef.current;

          if (
            snapshotUsable
            && snapshotMeta
          ) {
            consumedSnapshotSeqRef.current =
              snapshotMeta.seq;
          }

          await mobileApi.addRuntimeLog(
            "info",
            "aut",
            [
              "PHYSICAL PRE SNAPSHOT",
              `seq=${
                snapshotMeta?.seq
                ?? "none"
              }`,
              `usable=${snapshotUsable}`,
            ].join(" | "),
          );

          const point = {
            x: gesture.endX,
            y: gesture.endY,
          };

          if (
            !currentSnapshot
            || !snapshotUsable
          ) {
            /*
             * Snapshot availability must never decide whether
             * a physical action existed.
             */
            setRecording((current) => {
              const next =
                recordTap(
                  current,
                  {
                    point,
                  },
                );

              const latest =
                next.steps[
                  next.steps.length - 1
                ];

              setSelectedStepId(
                latest?.id ?? null,
              );

              return next;
            });

            await mobileApi.addRuntimeLog(
              "info",
              "aut",
              [
                "PHYSICAL TAP RECORDED WITHOUT SNAPSHOT",
                `point=${point.x},${point.y}`,
              ].join(" | "),
            );

            try {
              await refreshRecorderSnapshot();
            } catch {
              /*
               * Recording is already safe.
               */
            }

            return;
          }

          const element =
            findActionableRecordingTargetAtPoint(
              currentSnapshot.elements,
              point,
            );

          if (element) {
            /*
             * appendTap performs Locator Engine analysis
             * and records primary + alternatives.
             *
             * It does NOT execute another tap.
             */
            appendTap(
              element,
              point,
            );
          } else {
            /*
             * Physical truth wins over semantic resolution.
             *
             * The user really tapped the device. Preserve the
             * action even when the current Appium hierarchy
             * cannot resolve a semantic target.
             */
            setRecording((current) => {
              const next =
                recordTap(
                  current,
                  {
                    point,
                  },
                );

              const latest =
                next.steps[
                  next.steps.length - 1
                ];

              setSelectedStepId(
                latest?.id ?? null,
              );

              return next;
            });

            await mobileApi.addRuntimeLog(
              "info",
              "aut",
              [
                "PHYSICAL TAP RECORDED UNRESOLVED",
                `point=${point.x},${point.y}`,
              ].join(" | "),
            );
          }
        } else if (
          gesture.kind === "swipe"
          && gesture.direction
        ) {
          appendSwipe(
            gesture.direction,
            {
              x: gesture.startX,
              y: gesture.startY,
            },
            {
              x: gesture.endX,
              y: gesture.endY,
            },
            gesture.durationMs,
          );
        }

        /*
         * Allow Android to finish rendering, then make
         * TestFlow follow the physical device automatically.
         */
        await new Promise((resolve) =>
          window.setTimeout(
            resolve,
            350,
          ),
        );

        try {
          schedulePhysicalPreRefresh();
        } catch (reason) {
          /*
           * Auto-sync is best effort.
           * A page-source failure must not invalidate a
           * physical action already captured.
           */
          await mobileApi.addRuntimeLog(
            "error",
            "aut",
            `PHYSICAL AUTO-REFRESH FAILED | ${
              reason instanceof Error
                ? reason.message
                : String(reason)
            }`,
          );
        }
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : String(reason),
        );
      }
    };

  const selectedStep =
    useMemo(
      () =>
        recording.steps.find(
          (step) =>
            step.id === selectedStepId,
        ) ?? null,
      [
        recording.steps,
        selectedStepId,
      ],
    );

  const refreshRecorderSnapshot =
    async (): Promise<InspectorSnapshot> => {
      const next =
        await mobileApi.androidInspectorSnapshot(
          session.sessionId,
          session.deviceId,
        );

      setSnapshot(next);

      return next;
    };

  const schedulePhysicalPreRefresh = (
    delayMs = 350,
  ) => {
    if (
      settledRefreshTimerRef.current
      !== null
    ) {
      window.clearTimeout(
        settledRefreshTimerRef.current,
      );
    }

    settledRefreshTimerRef.current =
      window.setTimeout(
        () => {
          settledRefreshTimerRef.current =
            null;

          void refreshRecorderSnapshot();
        },
        delayMs,
      );
  };


  const manualRefresh = () => {
    void (async () => {
      try {
        setError(null);

        await refreshRecorderSnapshot();

        await mobileApi.addRuntimeLog(
          "info",
          "aut",
          "RECORDER REFRESH | snapshot synchronized",
        );
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : String(reason),
        );
      }
    })();
  };

  const executeRecorderTapIntent =
    async (
      element: Parameters<
        NonNullable<
          Parameters<
            typeof DeviceViewport
          >[0]["onRecordedTap"]
        >
      >[0],
      _point: {
        x: number;
        y: number;
      },
    ): Promise<boolean> => {
      if (!snapshot) {
        return false;
      }

      try {
        /*
         * Always analyze against the PRE-action hierarchy.
         * The target must represent what the user intended
         * to interact with, not the resulting screen.
         */
        const analyzed =
          await mobileApi
            .analyzeAndroidElementLocators(
              session.sessionId,
              element.id,
              snapshot.elements,
            );

        const candidates =
          analyzed
            .filter(
              (locator) =>
                locator.matchCount === 1
                && locator.unique,
            )
            .sort(
              (left, right) => {
                if (
                  left.recommended
                  !== right.recommended
                ) {
                  return left.recommended
                    ? -1
                    : 1;
                }

                return (
                  right.score
                  - left.score
                );
              },
            );

        for (const locator of candidates) {
          try {
            await mobileApi.clickSessionLocator(
              session.sessionId,
              locator.strategy,
              locator.value,
            );

            /*
             * Keep the verified locator analysis in the
             * current snapshot. recordTap() will then
             * persist primary + alternatives from the same
             * target that successfully executed.
             */
            const enriched = {
              ...element,
              locators: analyzed,
            };

            setSnapshot((current) => {
              if (!current) {
                return current;
              }

              return {
                ...current,
                elements:
                  current.elements.map(
                    (candidate) =>
                      candidate.id ===
                      element.id
                        ? enriched
                        : candidate,
                  ),
              };
            });

            return true;
          } catch {
            /*
             * A verified candidate may become stale between
             * hierarchy capture and interaction.
             * Try the next verified alternative.
             */
          }
        }

        return false;
      } catch {
        /*
         * Locator intelligence must never make the device
         * unusable. DeviceViewport will execute its native
         * coordinate fallback.
         */
        return false;
      }
    };

  const appendTap: NonNullable<
    Parameters<
      typeof DeviceViewport
    >[0]["onRecordedTap"]
  > = (
    element,
    point,
  ) => {
    /*
     * CAPTURE FIRST.
     *
     * The interaction already happened. Persist it before
     * Locator Engine/Appium performs any enrichment.
     */
    let recordedStepId:
      string | null = null;

    setRecording((current) => {
      const next =
        recordTap(
          current,
          {
            element,
            point,
          },
        );

      const latest =
        next.steps[
          next.steps.length - 1
        ];

      recordedStepId =
        latest?.id ?? null;

      setSelectedStepId(
        recordedStepId,
      );

      return next;
    });

    /*
     * ENRICH SECOND.
     *
     * Locator intelligence may improve the recorded action,
     * but failure must never delete the captured TAP.
     */
    void (async () => {
      try {
        const currentSnapshot =
          snapshot;

        if (!currentSnapshot) {
          return;
        }

        const locators =
          await mobileApi
            .analyzeAndroidElementLocators(
              session.sessionId,
              element.id,
              currentSnapshot.elements,
            );

        const analyzedElement = {
          ...element,
          locators,
        };

        setSnapshot((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            elements:
              current.elements.map(
                (candidate) =>
                  candidate.id ===
                  element.id
                    ? analyzedElement
                    : candidate,
              ),
          };
        });

        /*
         * Rebuild only the captured TAP using the analyzed
         * element while preserving its original id,
         * sequence and timestamp.
         */
        setRecording((current) => {
          if (!recordedStepId) {
            return current;
          }

          const index =
            current.steps.findIndex(
              (step) =>
                step.id ===
                recordedStepId,
            );

          if (index < 0) {
            return current;
          }

          const original =
            current.steps[index];

          const temporaryRecording = {
            ...current,
            steps:
              current.steps.slice(
                0,
                index,
              ),
          };

          const enrichedRecording =
            recordTap(
              temporaryRecording,
              {
                element:
                  analyzedElement,
                point,
              },
            );

          const enriched =
            enrichedRecording.steps[
              enrichedRecording.steps.length - 1
            ];

          if (!enriched) {
            return current;
          }

          const steps =
            [...current.steps];

          steps[index] = {
            ...enriched,
            id: original.id,
            sequence:
              original.sequence,
            timestamp:
              original.timestamp,
          };

          return {
            ...current,
            steps,
          };
        });
      } catch (reason) {
        /*
         * Deliberately non-fatal:
         * the TAP is already safely recorded.
         */
        await mobileApi.addRuntimeLog(
          "error",
          "aut",
          `TAP LOCATOR ENRICHMENT FAILED | ${
            reason instanceof Error
              ? reason.message
              : String(reason)
          }`,
        );
      }
    })();
  };

  const appendSwipe: NonNullable<
    Parameters<
      typeof DeviceViewport
    >[0]["onRecordedSwipe"]
  > = (
    direction,
    start,
    end,
    durationMs,
  ) => {
    setRecording((current) => {
      const next =
        recordSwipe(
          current,
          {
            direction,
            start,
            end,
            durationMs,
          },
        );

      const latest =
        next.steps[
          next.steps.length - 1
        ];

      setSelectedStepId(
        latest?.id ?? null,
      );

      return next;
    });
  };

  useEffect(() => {
    if (
      phase !== "recording"
      || session.platform !== "android"
    ) {
      return;
    }

    let disposed = false;

    let unlisten:
      (() => void) | null = null;

    const startPhysicalCapture =
      async () => {
        try {
          /*
           * Register exactly one wake-up listener.
           *
           * The durable Rust queue remains the only source
           * of recording truth. Event payload is telemetry
           * only and never records a step directly.
           */
          const release =
            await listen<PhysicalGesture>(
              "testflow://physical-gesture",
              (event) => {
                if (
                  disposed
                  || event.payload.deviceId
                    !== session.deviceId
                ) {
                  return;
                }

                void mobileApi.addRuntimeLog(
                  "info",
                  "aut",
                  [
                    "PHYSICAL GESTURE RECEIVED",
                    `device=${event.payload.deviceId}`,
                    `kind=${event.payload.kind}`,
                    `start=${event.payload.startX},${event.payload.startY}`,
                    `end=${event.payload.endX},${event.payload.endY}`,
                    `duration=${event.payload.durationMs}ms`,
                  ].join(" | "),
                );
              },
            );

          /*
           * React StrictMode may clean the effect while the
           * asynchronous listen() call is still resolving.
           * Never leave that late listener orphaned.
           */
          if (disposed) {
            release();
            return;
          }

          unlisten =
            release;

          const capture =
            await mobileApi
              .startPhysicalInputCapture(
                session.deviceId,
              );

          if (disposed) {
            return;
          }

          await mobileApi.addRuntimeLog(
            "info",
            "aut",
            [
              "PHYSICAL CAPTURE ACTIVE",
              `input=${capture.inputDevice}`,
              `name=${capture.inputName}`,
              `range=${capture.maxX}x${capture.maxY}`,
              `screen=${capture.screenWidth}x${capture.screenHeight}`,
            ].join(" | "),
          );
        } catch (reason) {
          if (disposed) {
            return;
          }

          await mobileApi.addRuntimeLog(
            "error",
            "aut",
            `PHYSICAL CAPTURE UNAVAILABLE | ${
              reason instanceof Error
                ? reason.message
                : String(reason)
            }`,
          );
        }
      };

    void startPhysicalCapture();

    return () => {
      disposed = true;

      /*
       * Safe whether listen() resolved before or after
       * cleanup. Late resolution handles itself above.
       */
      unlisten?.();

      void mobileApi
        .stopPhysicalInputCapture(
          session.deviceId,
        );
    };
  }, [
    phase,
    session.deviceId,
    session.platform,
  ]);

  useEffect(() => {
    if (
      phase !== "recording"
      || session.platform !== "android"
    ) {
      return;
    }

    let disposed = false;
    let draining = false;

    const drain = async () => {
      if (
        disposed
        || draining
      ) {
        return;
      }

      draining = true;

      try {
        const gestures =
          await mobileApi
            .drainPhysicalGestures(
              session.deviceId,
            );

        for (const gesture of gestures) {
          if (disposed) {
            break;
          }

          await mobileApi.addRuntimeLog(
            "info",
            "aut",
            [
              "PHYSICAL QUEUE DRAIN",
              `kind=${gesture.kind}`,
              `start=${gesture.startX},${gesture.startY}`,
              `end=${gesture.endX},${gesture.endY}`,
              `duration=${gesture.durationMs}ms`,
            ].join(" | "),
          );

          await handlePhysicalGesture(
            gesture,
          );
        }
      } catch (reason) {
        await mobileApi.addRuntimeLog(
          "error",
          "aut",
          `PHYSICAL QUEUE DRAIN FAILED | ${
            reason instanceof Error
              ? reason.message
              : String(reason)
          }`,
        );
      } finally {
        draining = false;
      }
    };

    const timer =
      window.setInterval(
        () => {
          void drain();
        },
        100,
      );

    void drain();

    return () => {
      disposed = true;

      window.clearInterval(
        timer,
      );
    };
  }, [
    phase,
    session.deviceId,
    session.platform,
  ]);

  const appendBack = () => {
    setRecording((current) => {
      const next =
        recordBack(current);

      const latest =
        next.steps[
          next.steps.length - 1
        ];

      setSelectedStepId(
        latest?.id ?? null,
      );

      return next;
    });
  };

  const removeStep = (
    stepId: string,
  ) => {
    setRecording((current) => {
      const remaining =
        current.steps
          .filter(
            (step) =>
              step.id !== stepId,
          )
          .map(
            (step, index) => ({
              ...step,
              sequence: index + 1,
            }),
          );

      return {
        ...current,
        steps: remaining,
      };
    });

    setSelectedStepId(
      (current) =>
        current === stepId
          ? null
          : current,
    );
  };

  const exportRecording = () => {
    void (async () => {
      try {
        setError(null);

        const completed =
          recording.stoppedAt
            ? recording
            : stopRecording(recording);

        const destination =
          await mobileApi.exportMobileRecording(
            completed,
          );

        await mobileApi.addRuntimeLog(
          "info",
          "aut",
          `RECORDING EXPORTED | ${destination}`,
        );
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : String(reason),
        );
      }
    })();
  };

  const finish = () => {
    const completed =
      stopRecording(recording);

    setRecording(completed);
    setPhase("review");

    void mobileApi
      .saveMobileRecording(
        completed,
      )
      .catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : String(reason),
        );
      });
  };

  const formatElapsed = (
    milliseconds: number,
  ): string => {
    const totalSeconds =
      Math.floor(
        milliseconds / 1000,
      );

    const hours =
      Math.floor(
        totalSeconds / 3600,
      );

    const minutes =
      Math.floor(
        (totalSeconds % 3600)
        / 60,
      );

    const seconds =
      totalSeconds % 60;

    return [
      hours,
      minutes,
      seconds,
    ]
      .map((value) =>
        String(value).padStart(
          2,
          "0",
        ),
      )
      .join(":");
  };

  return (
    <div className="mobile-recorder-overlay">
      <section className="mobile-recorder-shell">
        <header className="mobile-recorder-header">
          <div className="mobile-recorder-heading">
            <div className="mobile-recorder-title-row">
              <span className="mobile-recorder-live-dot" />

              <span className="mobile-recorder-eyebrow">
                {phase === "recording"
                  ? "RECORDING"
                  : phase === "running"
                    ? "RUNNING"
                    : "REVIEW"}
              </span>

              <code className="mobile-recorder-timer">
                {formatElapsed(
                  phase === "recording"
                    ? elapsedMs
                    : (
                        recording.stoppedAt
                          ? recording.stoppedAt
                            - recording.startedAt
                          : elapsedMs
                      ),
                )}
              </code>

              <span className="mobile-recorder-count">
                {recording.steps.length}
                {" "}
                {recording.steps.length === 1
                  ? "step"
                  : "steps"}
              </span>
            </div>

            <h2>
              Mobile Recorder
            </h2>

            <div className="mobile-recorder-live-meta">
              <strong>LIVE DEVICE</strong>

              {snapshot && (
                <span>
                  {snapshot.screenWidth}
                  {" × "}
                  {snapshot.screenHeight}
                </span>
              )}
            </div>

            <div className="mobile-recorder-left-tools">
              <button
                type="button"
                className="mobile-recorder-refresh"
                onClick={manualRefresh}
                title="Synchronize with device"
              >
                ↻
                <span>Refresh</span>
              </button>
            </div>

            <div className="mobile-recorder-session">
              <span>
                {session.deviceId}
              </span>

              <span>•</span>

              <span>
                {session.package}
              </span>

              <span>•</span>

              <strong>
                {session.automationName}
              </strong>
            </div>
          </div>

          <div className="mobile-recorder-header-actions">

            <button
              type="button"
              className="mobile-recorder-export"
              disabled={
                recording.steps.length === 0
              }
              onClick={exportRecording}
            >
              Export JSON
            </button>

            <button
              type="button"
              className="mobile-recorder-stop"
              onClick={
                phase === "recording"
                  ? finish
                  : onClose
              }
            >
              <span />
              {phase === "recording"
                ? "Stop recording"
                : "Close"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mobile-recorder-error">
            {error}
          </div>
        )}

        <div className="mobile-recorder-layout">
          <aside className="mobile-recorder-steps">
            <div className="mobile-recorder-pane-header">
              <div>
                <span>
                  RECORDED STEPS
                </span>

                <strong>
                  Timeline
                </strong>
              </div>

              <span className="mobile-recorder-step-total">
                {recording.steps.length}
              </span>
            </div>

            <div className="mobile-recorder-step-list">
              {recording.steps.length === 0 ? (
                <div className="mobile-recorder-empty">
                  <div className="mobile-recorder-empty-icon">
                    ●
                  </div>

                  <strong>
                    Recording is active
                  </strong>

                  <span>
                    Tap, swipe or use Back on the device.
                  </span>
                </div>
              ) : (
                recording.steps.map(
                  (step) => (
                    <button
                      type="button"
                      key={step.id}
                      className={[
                        "mobile-recorder-step",
                        selectedStepId
                          === step.id
                          ? "mobile-recorder-step-selected"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() =>
                        setSelectedStepId(
                          step.id,
                        )
                      }
                    >
                      <span className="mobile-recorder-sequence">
                        {String(
                          step.sequence,
                        ).padStart(
                          2,
                          "0",
                        )}
                      </span>

                      <span className="mobile-recorder-step-body">
                        <span className="mobile-recorder-step-action">
                          {
                            actionLabel(
                              step.action,
                            )
                          }
                        </span>

                        <strong>
                          {
                            targetLabel(
                              step,
                            )
                          }
                        </strong>

                        {step.locator && (
                          <span className="mobile-recorder-step-locator">
                            {
                              step.locator
                                .strategy
                            }
                            {" · "}
                            {
                              step.locator
                                .score
                            }
                          </span>
                        )}
                      </span>

                      <span
                        className="mobile-recorder-remove"
                        role="button"
                        tabIndex={0}
                        title="Remove step"
                        onClick={(
                          event,
                        ) => {
                          event.stopPropagation();

                          removeStep(
                            step.id,
                          );
                        }}
                        onKeyDown={(
                          event,
                        ) => {
                          if (
                            event.key
                              === "Enter"
                          ) {
                            event.stopPropagation();

                            removeStep(
                              step.id,
                            );
                          }
                        }}
                      >
                        ×
                      </span>
                    </button>
                  ),
                )
              )}
            </div>
          </aside>

          <main className="mobile-recorder-device">
            {loading && (
              <div className="mobile-recorder-loading">
                <span />
                Loading application…
              </div>
            )}

            {!loading && snapshot && (
              <DeviceViewport
                snapshot={snapshot}
                recorderLayout
                streaming={false}
                recording={
                  phase === "recording"
                }
                deviceId={
                  session.deviceId
                }
                platform={
                  session.platform
                    === "ios"
                    ? "ios"
                    : "android"
                }
                applicationPackage={
                  session.package
                }
                selectedId={
                  selectedElementId
                }
                hoveredId={null}
                onSelect={
                  setSelectedElementId
                }
                onSnapshot={
                  setSnapshot
                }
                onError={
                  setError
                }
                onRecorderTapIntent={
                  executeRecorderTapIntent
                }
                onRecordedTap={
                  appendTap
                }
                onRecordedSwipe={
                  appendSwipe
                }
                onRecordedBack={
                  appendBack
                }
              />
            )}
          </main>

          <aside className="mobile-recorder-details">
            <div className="mobile-recorder-pane-header">
              <div>
                <span>
                  ACTION
                </span>

                <strong>
                  Details
                </strong>
              </div>
            </div>

            {!selectedStep ? (
              <div className="mobile-recorder-empty">
                <strong>
                  No action selected
                </strong>

                <span>
                  Record or select a step to inspect its locator.
                </span>
              </div>
            ) : (
              <div className="mobile-recorder-detail-scroll">
                <section className="mobile-recorder-action-card">
                  <div className="mobile-recorder-action-heading">
                    <span>
                      {
                        actionLabel(
                          selectedStep.action,
                        )
                      }
                    </span>

                    <strong>
                      {
                        targetLabel(
                          selectedStep,
                        )
                      }
                    </strong>
                  </div>

                  {selectedStep.point && (
                    <div className="mobile-recorder-meta-grid">
                      <span>Point</span>

                      <code>
                        {
                          selectedStep
                            .point.x
                        }
                        ,
                        {
                          selectedStep
                            .point.y
                        }
                      </code>
                    </div>
                  )}

                  {selectedStep.gesture && (
                    <>
                      <div className="mobile-recorder-meta-grid">
                        <span>
                          Direction
                        </span>

                        <strong>
                          {
                            selectedStep
                              .gesture
                              .direction
                          }
                        </strong>
                      </div>

                      <div className="mobile-recorder-meta-grid">
                        <span>
                          Duration
                        </span>

                        <code>
                          {
                            selectedStep
                              .gesture
                              .durationMs
                          }
                          ms
                        </code>
                      </div>
                    </>
                  )}
                </section>

                {selectedStep.target && (
                  <section className="mobile-recorder-detail-section">
                    <span className="mobile-recorder-section-label">
                      TARGET
                    </span>

                    <strong>
                      {
                        targetLabel(
                          selectedStep,
                        )
                      }
                    </strong>

                    <code>
                      {
                        selectedStep
                          .target
                          .elementType
                      }
                    </code>
                  </section>
                )}

                {selectedStep.locator ? (
                  <section className="mobile-recorder-detail-section">
                    <div className="mobile-recorder-locator-title">
                      <span className="mobile-recorder-section-label">
                        PRIMARY LOCATOR
                      </span>

                      <span className="mobile-recorder-score">
                        {
                          selectedStep
                            .locator
                            .score
                        }
                      </span>
                    </div>

                    <div className="mobile-recorder-locator-tags">
                      <span>
                        {
                          selectedStep
                            .locator
                            .strategy
                        }
                      </span>

                      {selectedStep
                        .locator
                        .stable && (
                        <span>
                          STABLE
                        </span>
                      )}

                      {selectedStep
                        .locator
                        .unique && (
                        <span>
                          UNIQUE
                        </span>
                      )}

                      {selectedStep
                        .locator
                        .template && (
                        <span>
                          PARAMETERIZED
                        </span>
                      )}
                    </div>

                    <code className="mobile-recorder-locator-value">
                      {
                        selectedStep
                          .locator
                          .value
                      }
                    </code>

                    <p>
                      {
                        selectedStep
                          .locator
                          .reason
                      }
                    </p>

                    {selectedStep
                      .locator
                      .template && (
                      <>
                        <span className="mobile-recorder-section-label">
                          TEMPLATE
                        </span>

                        <code className="mobile-recorder-locator-value">
                          {
                            selectedStep
                              .locator
                              .template
                          }
                        </code>
                      </>
                    )}
                  </section>
                ) : (
                  selectedStep.action
                    === "tap" && (
                    <section className="mobile-recorder-warning">
                      No verified locator was available for this target.
                    </section>
                  )
                )}

                {selectedStep
                  .alternativeLocators
                  .length > 0 && (
                  <section className="mobile-recorder-detail-section">
                    <span className="mobile-recorder-section-label">
                      ALTERNATIVE LOCATORS
                    </span>

                    <div className="mobile-recorder-alternatives">
                      {selectedStep
                        .alternativeLocators
                        .map(
                          (
                            locator,
                            index,
                          ) => (
                            <div
                              key={
                                `${locator.strategy}-${locator.value}`
                              }
                              className="mobile-recorder-alternative"
                            >
                              <div>
                                <strong>
                                  #
                                  {
                                    index
                                    + 1
                                  }
                                  {" "}
                                  {
                                    locator
                                      .strategy
                                  }
                                </strong>

                                <span>
                                  {
                                    locator
                                      .score
                                  }
                                </span>
                              </div>

                              <code>
                                {
                                  locator
                                    .value
                                }
                              </code>
                            </div>
                          ),
                        )}
                    </div>
                  </section>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
