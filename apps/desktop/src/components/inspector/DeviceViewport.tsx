import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ElementBounds as ElementBoundsValue,
  InspectorElement,
  InspectorSnapshot,
} from "../../types/mobile";

import { mobileApi } from "../../services/mobileApi";

import LiveDeviceSurface from "./stream/LiveDeviceSurface";

import type {
  SwipeDirection,
} from "./mobile-recorder";

import {
  AndroidDeviceControls,
} from "./AndroidDeviceControls";

import {
  IosDeviceControls,
} from "./IosDeviceControls";

import {
  clampZoom,
  findDeepestElementAtPoint,
  findEditableElementAtPoint,
  findRecordingTargetAtPoint,
  viewportPointToDevice,
  deviceBoundsToViewport,
  type InspectorMode,
} from "./inspector.utils";

interface DeviceViewportProps {
  snapshot: InspectorSnapshot;
  streaming: boolean;
  recording: boolean;
  recorderLayout?: boolean;
  showHeader?: boolean;
  deviceId: string;
  platform: "android" | "ios";
  applicationPackage: string;
  selectedId: string | null;
  hoveredId: string | null;
  locatorHighlightBounds?: ElementBoundsValue | null;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  onSnapshot: (
    snapshot: InspectorSnapshot,
  ) => void;
  onError: (message: string) => void;
  onModeChange?: (mode: InspectorMode) => void;

  /*
   * Plain Interact may expose semantic capabilities without
   * becoming Inspector selection.
   */
  onEditableTarget?: (
    element: InspectorElement,
  ) => void;

  onRecorderTapIntent?: (
    element: InspectorElement,
    point: {
      x: number;
      y: number;
    },
  ) => Promise<boolean>;

  onRecordedTap?: (
    element: InspectorElement,
    point: {
      x: number;
      y: number;
    },
  ) => void;

  onRecordedSwipe?: (
    direction: SwipeDirection,
    start: {
      x: number;
      y: number;
    },
    end: {
      x: number;
      y: number;
    },
    durationMs: number,
  ) => void;

  onRecordedBack?: () => void;
}

export default function DeviceViewport({
  snapshot,
  streaming,
  recording,
  recorderLayout = false,
  showHeader = true,
  deviceId,
  platform,
  applicationPackage,
  selectedId,
  hoveredId,
  locatorHighlightBounds = null,
  onSelect,
  onHover,
  onSnapshot,
  onError,
  onModeChange,
  onEditableTarget,
  onRecorderTapIntent,
  onRecordedTap,
  onRecordedSwipe,
  onRecordedBack,
}: DeviceViewportProps) {
  const workspaceRef =
    useRef<HTMLDivElement | null>(null);

  const stageRef =
    useRef<HTMLDivElement | null>(null);

  const screenRef =
    useRef<HTMLDivElement | null>(null);

  const screenshotImageRef =
    useRef<HTMLImageElement | null>(null);

  const [mode, setMode] =
    useState<InspectorMode>("inspect");

  const changeMode = (
    nextMode: InspectorMode,
  ) => {
    setMode(nextMode);
    onModeChange?.(nextMode);
  };

  useEffect(() => {
    /*
     * Recording means real interaction.
     *
     * Start Recording enters Interact automatically.
     * Stop Recording returns to Inspect.
     */
    const nextMode: InspectorMode =
      recording
        ? "interact"
        : "inspect";

    setMode(nextMode);
    onModeChange?.(nextMode);
  }, [recording, onModeChange]);

  /*
   * MobFlow device surfaces share the same stable initial
   * device geometry.
   *
   * Recorder and Inspector use a stable manual initial zoom.
   * Fit remains an explicit user action and may still be
   * used whenever the available workspace requires it.
   *
   * `recorderLayout` controls composition only. It must
   * not implicitly own zoom semantics.
   */
  const [zoom, setZoom] =
    useState(32);

  const [fitMode, setFitMode] =
    useState(false);

  const [viewportScrolling, setViewportScrolling] =
    useState(false);

  const scrollHideTimerRef =
    useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current !== null) {
        window.clearTimeout(
          scrollHideTimerRef.current,
        );
      }
    };
  }, []);

  const handleViewportScroll = () => {
    setViewportScrolling(true);

    if (scrollHideTimerRef.current !== null) {
      window.clearTimeout(
        scrollHideTimerRef.current,
      );
    }

    scrollHideTimerRef.current =
      window.setTimeout(() => {
        setViewportScrolling(false);
        scrollHideTimerRef.current = null;
      }, 650);
  };

  const [interacting, setInteracting] =
    useState(false);

  const [
    ,
    setOutsideApplication,
  ] = useState<string | null>(null);

  const fit = useCallback(() => {
    const workspace =
      workspaceRef.current;

    if (!workspace) {
      return;
    }

    const rect =
      workspace.getBoundingClientRect();

    /*
     * Fit against the REAL Live Device workspace.
     *
     * The side controls float over the workspace, so only
     * reserve their footprint horizontally. Vertically the
     * phone may use almost the complete available area.
     */
    const controlsReserve = 78;
    const horizontalGap = 28;
    const verticalGap = 20;

    const availableWidth =
      Math.max(
        1,
        rect.width
          - controlsReserve
          - horizontalGap,
      );

    const availableHeight =
      Math.max(
        1,
        rect.height
          - verticalGap,
      );

    const widthZoom =
      (
        availableWidth
        / snapshot.screenWidth
      ) * 100;

    const heightZoom =
      (
        availableHeight
        / snapshot.screenHeight
      ) * 100;

    const nextZoom =
      Math.min(
        widthZoom,
        heightZoom,
      );

    setZoom(
      clampZoom(
        Math.floor(nextZoom),
      ),
    );

    setFitMode(true);

    /*
     * Manual zoom may leave the stage scrolled.
     * Returning to Fit must always start from a clean
     * contained viewport.
     */
    window.requestAnimationFrame(
      () => {
        stageRef.current?.scrollTo({
          top: 0,
          left: 0,
          behavior: "auto",
        });
      },
    );
  }, [
    snapshot.screenWidth,
    snapshot.screenHeight,
  ]);

  /*
   * Do not auto-fit on mount.
   *
   * Inspector intentionally starts at a stable 32% manual
   * zoom. Fit remains an explicit user action. ResizeObserver still
   * keeps Fit responsive after the user explicitly selects
   * Fit.
   */

  useEffect(() => {
    const workspace =
      workspaceRef.current;

    if (!workspace) {
      return;
    }

    const observer = new ResizeObserver(
      () => {
        if (fitMode) {
          fit();
        }
      },
    );

    observer.observe(workspace);

    return () => observer.disconnect();
  }, [fit, fitMode]);

  const changeZoom = (
    delta: number,
  ) => {
    setFitMode(false);

    setZoom((current) =>
      clampZoom(current + delta),
    );
  };


  const setNativeZoom = () => {
    setFitMode(false);
    setZoom(100);
  };

  /*
   * Interaction foreground gate.
   *
   * Interact must NEVER relaunch the AUT automatically.
   *
   * If Android is currently showing another application,
   * system UI, launcher, permission surface or external
   * activity, preserve that real device state.
   *
   * We only fail closed so a pending MobFlow gesture is not
   * accidentally dispatched to the wrong application.
   */
  const ensureApplicationContext =
    async (): Promise<boolean> => {
      const context =
        await mobileApi.androidAppContext(
          snapshot.sessionId,
        );

      if (
        context.package ===
        applicationPackage
      ) {
        setOutsideApplication(null);
        return true;
      }

      setOutsideApplication(
        context.package,
      );

      await mobileApi.addRuntimeLog(
        "info",
        "aut",
        `FOREGROUND CHANGED | expected=${applicationPackage} | actual=${context.package}`,
      );

      /*
       * Important:
       *
       * Do NOT call activateAndroidApp here.
       * Do NOT refresh/restart the AUT here.
       *
       * The device foreground belongs to the user's actual
       * interaction. MobFlow must observe it, not fight it.
       */
      return false;
    };

  const snapshotBelongsToApplication =
    async (): Promise<boolean> => {
      try {
        const context =
          await mobileApi.androidAppContext(
            snapshot.sessionId,
          );

        if (
          context.package ===
          applicationPackage
        ) {
          return true;
        }

        await mobileApi.addRuntimeLog(
          "info",
          "aut",
          `SNAPSHOT REJECTED | expected=${applicationPackage} | actual=${context.package}`,
        );

        return false;
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : String(reason);

        await mobileApi.addRuntimeLog(
          "error",
          "aut",
          `SNAPSHOT CONTEXT CHECK FAILED | ${message}`,
        );

        /*
         * Fail closed:
         * unknown foreground must never replace the last
         * known-good AUT hierarchy.
         */
        return false;
      }
    };

  const refreshSnapshot =
    async () => {
      /*
       * Validate foreground BEFORE capturing hierarchy.
       * Never allow Launcher/System UI to become the
       * Inspector snapshot for the AUT.
       */
      if (
        !(await snapshotBelongsToApplication())
      ) {
        return;
      }

      const next =
        await mobileApi.androidInspectorSnapshot(
          snapshot.sessionId,
          deviceId,
        );

      /*
       * The foreground may change while Appium is reading
       * source/screenshot. Validate again before publish.
       */
      if (
        !(await snapshotBelongsToApplication())
      ) {
        return;
      }

      onSnapshot(next);
    };

  const synchronizeAfterInteraction =
    async () => {
      /*
       * Appium may acknowledge a gesture before Android
       * has finished rendering the resulting hierarchy.
       *
       * Never keep using the pre-interaction snapshot.
       */
      await new Promise((resolve) =>
        window.setTimeout(
          resolve,
          450,
        ),
      );

      let previousSignature = "";

      for (
        let attempt = 0;
        attempt < 4;
        attempt += 1
      ) {
        /*
         * Never capture/publish hierarchy from Launcher,
         * System UI or another application.
         */
        if (
          !(await snapshotBelongsToApplication())
        ) {
          return;
        }

        const next =
          await mobileApi.androidInspectorSnapshot(
            snapshot.sessionId,
            deviceId,
          );

        /*
         * Foreground may change while Appium is reading
         * source/screenshot. Fail closed before publish.
         */
        if (
          !(await snapshotBelongsToApplication())
        ) {
          return;
        }

        const signature = [
          next.elements.length,
          next.screenshotBase64.length,
          next.elements
            .slice(0, 20)
            .map((element) =>
              [
                element.id,
                element.text,
                element.resourceId,
                element.bounds?.x,
                element.bounds?.y,
              ].join(":"),
            )
            .join("|"),
        ].join("#");

        onSnapshot(next);

        if (
          previousSignature &&
          signature === previousSignature
        ) {
          return;
        }

        previousSignature = signature;

        await new Promise((resolve) =>
          window.setTimeout(
            resolve,
            250,
          ),
        );
      }
    };

  const inspectElementAtPointer = (
    event: React.MouseEvent<HTMLDivElement>,
  ): InspectorElement | null => {
    if (mode !== "inspect") {
      return null;
    }

    const image =
      screenshotImageRef.current;

    if (!image) {
      return null;
    }

    const rect =
      image.getBoundingClientRect();

    if (
      rect.width <= 0
      || rect.height <= 0
      || image.naturalWidth <= 0
      || image.naturalHeight <= 0
    ) {
      return null;
    }

    const point =
      viewportPointToDevice(
        event.clientX,
        event.clientY,
        rect,
        image.naturalWidth,
        image.naturalHeight,
      );

    return findDeepestElementAtPoint(
      snapshot.elements,
      point,
    );
  };

  const [interactionHoverBounds, setInteractionHoverBounds] =
    useState<ElementBoundsValue | null>(null);

  const interactionElementAtPointer = (
    event: React.MouseEvent<HTMLDivElement>,
  ): InspectorElement | null => {
    const image =
      screenshotImageRef.current;

    if (
      !image
      || image.naturalWidth <= 0
      || image.naturalHeight <= 0
    ) {
      return null;
    }

    const rect =
      image.getBoundingClientRect();

    if (
      rect.width <= 0
      || rect.height <= 0
    ) {
      return null;
    }

    const point =
      viewportPointToDevice(
        event.clientX,
        event.clientY,
        rect,
        image.naturalWidth,
        image.naturalHeight,
      );

    return findDeepestElementAtPoint(
      snapshot.elements,
      point,
    );
  };

  const handlePointerMove = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (mode === "interact") {
      const element =
        interactionElementAtPointer(event);

      setInteractionHoverBounds(
        element?.bounds ?? null,
      );

      return;
    }

    handleInspectPointerMove(event);
  };

  const handlePointerLeave = () => {
    if (mode === "interact") {
      setInteractionHoverBounds(null);
      return;
    }

    handleInspectPointerLeave();
  };

  const handleInspectPointerMove = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (
      mode !== "inspect"
      || !onHover
    ) {
      return;
    }

    const element =
      inspectElementAtPointer(event);

    onHover(
      element?.id ?? null,
    );
  };

  const handleInspectPointerLeave = () => {
    if (
      mode === "inspect"
      && onHover
    ) {
      onHover(null);
    }
  };

  const handleInspectClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    const element =
      inspectElementAtPointer(event);

    if (!element) {
      return;
    }

    /*
     * Click freezes the current candidate as selection.
     * Locator analysis remains owned by selectElement().
     */
    onSelect(element.id);
  };

  const handleDeviceClick = async (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (
      mode !== "interact" ||
      interacting
    ) {
      return;
    }

    const screen = screenRef.current;

    if (!screen) {
      return;
    }

    const rect =
      screen.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }

    /*
     * screen.getBoundingClientRect() includes the decorative
     * Android frame/border.
     *
     * clientLeft/clientTop and clientWidth/clientHeight
     * describe the real content box where the screenshot is
     * rendered. Coordinate mapping must use that box.
     */
    const point =
      viewportPointToDevice(
        event.clientX,
        event.clientY,
        rect,
        snapshot.screenWidth,
        snapshot.screenHeight,
        screen.clientLeft,
        screen.clientTop,
        screen.clientWidth,
        screen.clientHeight,
      );

    /*
     * Diagnostic only:
     * compare tap coordinates against the element resolved
     * from the same device point. No interaction behavior
     * is changed here.
     */
    const diagnosticTarget =
      findDeepestElementAtPoint(
        snapshot.elements,
        point,
      );

    await mobileApi.addRuntimeLog(
      "info",
      "aut",
      [
        "INTERACT HIT TEST",
        `point=${point.x},${point.y}`,
        `target=${diagnosticTarget?.id ?? "none"}`,
        `type=${diagnosticTarget?.elementType ?? "none"}`,
        `text=${diagnosticTarget?.text ?? "none"}`,
        `bounds=${
          diagnosticTarget?.bounds
            ? [
                diagnosticTarget.bounds.x,
                diagnosticTarget.bounds.y,
                diagnosticTarget.bounds.width,
                diagnosticTarget.bounds.height,
              ].join(",")
            : "none"
        }`,
      ].join(" | "),
    );

    /*
     * TAP foreground ownership gate.
     *
     * Never dispatch a pending MobFlow interaction when the
     * expected AUT no longer owns Android foreground.
     *
     * This is fail-closed only:
     * no activateApp, no restart, no hidden recovery.
     */
    if (
      !(await ensureApplicationContext())
    ) {
      await mobileApi.addRuntimeLog(
        "error",
        "aut",
        [
          "TAP BLOCKED",
          "AUT does not own foreground",
          `expected=${applicationPackage}`,
          `point=${point.x},${point.y}`,
        ].join(" | "),
      );

      return;
    }

    await mobileApi.addRuntimeLog(
      "info",
      "aut",
      [
        "TAP PRE FOREGROUND",
        `package=${applicationPackage}`,
        `point=${point.x},${point.y}`,
      ].join(" | "),
    );

    /*
     * Recorder and Inspector share the viewport, but they do
     * not share the same interaction contract.
     *
     * Recorder needs the semantic element so it can persist a
     * meaningful recorded step.
     *
     * Inspector only needs to interact with the live device.
     */
    const deepestElement =
      findDeepestElementAtPoint(
        snapshot.elements,
        point,
      );

    const recordingTarget =
      findRecordingTargetAtPoint(
        snapshot.elements,
        point,
      );

    const target =
      recordingTarget ??
      deepestElement;

    /*
     * Text-entry capability has its own semantic target.
     *
     * The physical tap continues using the exact same point
     * and target contract as before. This lookup only asks
     * whether an actionable editable element owns that point.
     */
    const editableTarget =
      !recording
        ? findEditableElementAtPoint(
            snapshot.elements,
            point,
          )
        : null;

    if (!recording) {
      await mobileApi.addRuntimeLog(
        "info",
        "aut",
        [
          "INTERACT INPUT TARGET",
          `point=${point.x},${point.y}`,
          `deepest=${deepestElement?.id ?? "none"}`,
          `type=${deepestElement?.elementType ?? "none"}`,
          `editable=${deepestElement?.editable ?? false}`,
          `focusable=${deepestElement?.focusable ?? false}`,
          `focused=${deepestElement?.focused ?? false}`,
          `clickable=${deepestElement?.clickable ?? false}`,
          `resource=${deepestElement?.resourceId ?? "none"}`,
          `text=${deepestElement?.text ?? "none"}`,
          `editableTarget=${editableTarget?.id ?? "none"}`,
        ].join(" | "),
      );
    }

    /*
     * Plain Interact must never become Inspector selection.
     *
     * Recording needs semantic target ownership so the step
     * can be persisted. Normal Interact only mirrors the
     * physical gesture and must not trigger locator analysis.
     */
    if (
      recording
      && target
    ) {
      onSelect(target.id);
    }

    /*
     * Input capability is independent from Inspector
     * selection and locator analysis.
     *
     * Persist the semantic snapshot target before the pointer
     * leaves the device surface for the Inspector panel.
     */
    if (editableTarget) {
      onEditableTarget?.(editableTarget);
    }

    setInteracting(true);

    try {
      if (
        recording &&
        target &&
        onRecorderTapIntent
      ) {
        const accepted =
          await onRecorderTapIntent(
            target,
            point,
          );

        if (!accepted) {
          return;
        }
      }

      /*
       * Interact mirrors the user's physical gesture.
       *
       * Locator Intelligence belongs to inspection,
       * recording metadata and generated automation.
       * It must never replace the actual pointer gesture
       * performed on the rendered device surface.
       *
       * Coordinates are derived from the current screenshot
       * geometry; no device-specific coordinates or offsets.
       */
      await mobileApi.addRuntimeLog(
        "info",
        "aut",
        [
          "INTERACT TAP",
          `target=${target?.id ?? "none"}`,
          `point=${point.x},${point.y}`,
        ].join(" | "),
      );

      await mobileApi.tapSession(
        snapshot.sessionId,
        point.x,
        point.y,
      );

      /*
       * Observe the foreground immediately after the native
       * interaction. Do not recover here.
       *
       * This tells us whether the AUT -> Launcher transition
       * was caused by the dispatched tap or happened later.
       */
      const contextAfterTap =
        await mobileApi.androidAppContext(
          snapshot.sessionId,
        );

      await mobileApi.addRuntimeLog(
        contextAfterTap.package
          === applicationPackage
          ? "info"
          : "error",
        "aut",
        [
          "TAP POST FOREGROUND",
          `expected=${applicationPackage}`,
          `actual=${contextAfterTap.package}`,
          `activity=${contextAfterTap.activity}`,
          `point=${point.x},${point.y}`,
        ].join(" | "),
      );

      if (
        recording &&
        target &&
        onRecordedTap
      ) {
        onRecordedTap(
          target,
          point,
        );
      }

      /*
       * Semantic synchronization must never block the visual
       * interaction path.
       *
       * The live stream owns visual feedback. Appium refresh
       * updates hierarchy/metadata asynchronously after the
       * application has had a short stabilization window.
       *
       * No activateApp.
       * No automatic AUT recovery.
       */
      void (async () => {
        await new Promise((resolve) =>
          window.setTimeout(
            resolve,
            250,
          ),
        );

        try {
          await refreshSnapshot();
        } catch (reason) {
          const message =
            reason instanceof Error
              ? reason.message
              : String(reason);

          await mobileApi.addRuntimeLog(
            "error",
            "aut",
            `ASYNC SEMANTIC REFRESH FAILED | ${message}`,
          );
        }
      })();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : String(reason),
      );
    } finally {
      setInteracting(false);
    }
  };

  const executeSwipe =
    async (
      direction:
        | "up"
        | "down"
        | "left"
        | "right",
    ) => {
      if (interacting) {
        return;
      }

      try {

        if (
          !(await ensureApplicationContext())
        ) {
          return;
        }

        setInteracting(true);

        /*
         * Gesture coordinates are proportional to the
         * real device viewport. They are not tied to
         * screenshot zoom or desktop scroll position.
         */
        const width =
          snapshot.screenWidth;

        const height =
          snapshot.screenHeight;

        const centerX =
          Math.round(width * 0.5);

        const centerY =
          Math.round(height * 0.5);

        const horizontalStart =
          Math.round(width * 0.78);

        const horizontalEnd =
          Math.round(width * 0.22);

        const verticalStart =
          Math.round(height * 0.72);

        const verticalEnd =
          Math.round(height * 0.28);

        let startX = centerX;
        let startY = centerY;
        let endX = centerX;
        let endY = centerY;

        switch (direction) {
          /*
           * Direction describes CONTENT movement.
           * Touch gesture therefore moves oppositely.
           */
          case "up":
            startY = verticalEnd;
            endY = verticalStart;
            break;

          case "down":
            startY = verticalStart;
            endY = verticalEnd;
            break;

          case "left":
            startX = horizontalEnd;
            endX = horizontalStart;
            break;

          case "right":
            startX = horizontalStart;
            endX = horizontalEnd;
            break;
        }

        const durationMs = 420;

        await mobileApi.swipeSession(
          snapshot.sessionId,
          startX,
          startY,
          endX,
          endY,
          durationMs,
        );

        onRecordedSwipe?.(
          direction,
          {
            x: startX,
            y: startY,
          },
          {
            x: endX,
            y: endY,
          },
          durationMs,
        );

        await new Promise((resolve) =>
          window.setTimeout(
            resolve,
            250,
          ),
        );

        await synchronizeAfterInteraction();
      } catch (reason) {
        onError(
          reason instanceof Error
            ? reason.message
            : String(reason),
        );
      } finally {
        setInteracting(false);
      }
    };

  const hideAndroidKeyboard = async () => {
    if (
      snapshot.platform !== "android"
      || interacting
    ) {
      return;
    }

    setInteracting(true);

    try {
      await mobileApi.hideAndroidKeyboard(
        snapshot.sessionId,
      );

      /*
       * Keyboard visibility changes the live viewport.
       * Refresh only after Appium completes the operation.
       */
      await refreshSnapshot();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : String(reason),
      );
    } finally {
      setInteracting(false);
    }
  };

  const executeAndroidNavigation =
    async (
      action: "back" | "home" | "recents",
    ) => {
      if (interacting) {
        return;
      }

      try {
        setInteracting(true);
        setOutsideApplication(null);

        await mobileApi.androidNavigationKey(
          snapshot.sessionId,
          action,
        );

        if (
          action === "back"
        ) {
          onRecordedBack?.();
        }

        await new Promise((resolve) =>
          window.setTimeout(
            resolve,
            250,
          ),
        );

        const context =
          await mobileApi.androidAppContext(
            snapshot.sessionId,
          );

        if (
          context.package !==
          applicationPackage
        ) {
          setOutsideApplication(
            context.package,
          );

          return;
        }

        await refreshSnapshot();
      } catch (reason) {
        onError(
          reason instanceof Error
            ? reason.message
            : String(reason),
        );
      } finally {
        setInteracting(false);
      }
    };



  const visibleBounds =
    mode === "inspect"
      ? snapshot.elements.filter(
          (element) =>
            element.id === selectedId ||
            element.id === hoveredId,
        )
      : [];

  return (
    <main
      className={[
        "mi-device-panel",
        recorderLayout
          ? "mi-device-panel-recorder"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showHeader && !recorderLayout && (
      <div className="mi-panel-header">
        <div>
          <strong>Live Device</strong>
          <span className="mi-panel-subtitle">
            {mode === "inspect"
              ? "Select and analyze elements"
              : "Interact with the application"}
          </span>
        </div>

        <span>
          {snapshot.screenWidth}
          {" × "}
          {snapshot.screenHeight}
        </span>
      </div>

      )}

      <div
        ref={workspaceRef}
        className="mi-device-workspace"
      >
      <div
        ref={stageRef}
        className={[
          "mi-device-stage",
          fitMode
            ? "mi-device-stage-fit"
            : "mi-device-stage-manual",
          viewportScrolling
            ? "mi-device-stage-scrolling"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onScroll={handleViewportScroll}
      >
        <div className="mi-device-canvas">
          <div
            className="mi-device-scale"
          style={{
            width:
              snapshot.screenWidth *
              (zoom / 100),
            height:
              snapshot.screenHeight *
              (zoom / 100),
            "--device-render-width":
              `${snapshot.screenWidth * (zoom / 100)}px`,
          } as React.CSSProperties}
        >
          <div
            ref={screenRef}
            className={[
              "mi-device-screen",
              mode === "interact"
                ? "mi-device-interact"
                : "mi-device-inspect",
              interacting
                ? "mi-device-busy"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseMove={
              handlePointerMove
            }
            onMouseLeave={
              handlePointerLeave
            }
            onClick={(event) => {
              if (mode === "inspect") {
                handleInspectClick(event);
                return;
              }

              void handleDeviceClick(event);
            }}
          >
            <LiveDeviceSurface
              screenshotBase64={
                snapshot.screenshotBase64
              }
              streaming={
                mode === "interact"
                && streaming
              }
              deviceId={deviceId}
              platform={platform}
              imageRef={screenshotImageRef}
            />

            {visibleBounds.map(
              (element) => (
                <ElementBounds
                  key={element.id}
                  element={element}
                  snapshot={snapshot}
                  screenElement={
                    screenshotImageRef.current
                  }
                  selected={
                    element.id ===
                    selectedId
                  }
                />
              ),
            )}

            {interactionHoverBounds && (
              <LocatorTestBounds
                bounds={interactionHoverBounds}
                screenElement={
                  screenshotImageRef.current
                }
                className="mi-interaction-hover-bounds"
              />
            )}

            {locatorHighlightBounds && (
              <LocatorTestBounds
                key={[
                  locatorHighlightBounds.x,
                  locatorHighlightBounds.y,
                  locatorHighlightBounds.width,
                  locatorHighlightBounds.height,
                ].join(":")}
                bounds={locatorHighlightBounds}
                screenElement={
                  screenshotImageRef.current
                }
              />
            )}

            {interacting && (
              <div className="mi-device-progress">
                Executing gesture…
              </div>
            )}
          </div>
          </div>
        </div>

      </div>

        {snapshot.platform === "android" ? (
          <AndroidDeviceControls
            disabled={interacting}
            onSwipeUp={() =>
              void executeSwipe("up")
            }
            onSwipeDown={() =>
              void executeSwipe("down")
            }
            onSwipeLeft={() =>
              void executeSwipe("left")
            }
            onSwipeRight={() =>
              void executeSwipe("right")
            }
            onBack={() =>
              void executeAndroidNavigation(
                "back",
              )
            }
            onHideKeyboard={() =>
              void hideAndroidKeyboard()
            }
          />
        ) : (
          <IosDeviceControls
            disabled
            onHome={() => undefined}
            onLock={() => undefined}
          />
        )}

      </div>


      <div className="mi-device-toolbar">
        <div className="mi-mode-switch">
          <button
            type="button"
            className={
              mode === "inspect"
                ? "mi-mode-active"
                : ""
            }
            disabled={recording}
            onClick={() =>
              changeMode("inspect")
            }
            title={
              recording
                ? "Stop recording to return to Inspect"
                : "Inspect elements"
            }
          >
            Inspect
          </button>

          <button
            type="button"
            className={
              mode === "interact"
                ? "mi-mode-active"
                : ""
            }
            onClick={() =>
              changeMode("interact")
            }
          >
            Interact
          </button>
        </div>


        <div className="mi-zoom-controls">
          <button
            type="button"
            onClick={() =>
              changeZoom(-5)
            }
          >
            −
          </button>

          <button
            type="button"
            className="mi-zoom-value"
            onClick={setNativeZoom}
            title="Set native 100% zoom"
          >
            {zoom}%
          </button>

          <button
            type="button"
            onClick={() =>
              changeZoom(5)
            }
          >
            +
          </button>

          <button
            type="button"
            className={
              fitMode
                ? "mi-fit-active"
                : ""
            }
            onClick={fit}
          >
            Fit
          </button>
        </div>
      </div>
    </main>
  );
}

function LocatorTestBounds({
  bounds,
  screenElement,
  className = "mi-locator-test-bounds",
}: {
  bounds: ElementBoundsValue;
  screenElement: HTMLImageElement | null;
  className?: string;
}) {
  console.log("[LOCATOR-HIGHLIGHT]", {
    bounds,
    hasScreenElement: Boolean(screenElement),
    naturalWidth: screenElement?.naturalWidth ?? null,
    naturalHeight: screenElement?.naturalHeight ?? null,
  });
  if (
    !screenElement
    || screenElement.naturalWidth <= 0
    || screenElement.naturalHeight <= 0
  ) {
    return null;
  }

  const imageRect =
    screenElement.getBoundingClientRect();

  if (
    imageRect.width <= 0
    || imageRect.height <= 0
  ) {
    return null;
  }

  const parentRect =
    screenElement.parentElement
      ?.getBoundingClientRect();

  if (!parentRect) {
    return null;
  }

  /*
   * Same projection contract as Inspector bounds.
   *
   * Appium provides the live element rectangle.
   * The rendered screenshot provides visual geometry.
   *
   * No device-specific coordinates or offsets.
   */
  const viewportBounds =
    deviceBoundsToViewport(
      bounds,
      screenElement.naturalWidth,
      screenElement.naturalHeight,
      imageRect.width,
      imageRect.height,
      imageRect.left - parentRect.left,
      imageRect.top - parentRect.top,
    );

  return (
    <div
      className={className}
      style={{
        left: viewportBounds.left,
        top: viewportBounds.top,
        width: viewportBounds.width,
        height: viewportBounds.height,
      }}
    />
  );
}

function ElementBounds({
  element,
  screenElement,
  selected,
}: {
  element: InspectorElement;
  snapshot: InspectorSnapshot;
  screenElement: HTMLImageElement | null;
  selected: boolean;
}) {
  const bounds = element.bounds;

  if (
    !bounds
    || !screenElement
    || screenElement.naturalWidth <= 0
    || screenElement.naturalHeight <= 0
  ) {
    return null;
  }

  const imageRect =
    screenElement.getBoundingClientRect();

  if (
    imageRect.width <= 0
    || imageRect.height <= 0
  ) {
    return null;
  }

  const parentRect =
    screenElement.parentElement
      ?.getBoundingClientRect();

  if (!parentRect) {
    return null;
  }

  /*
   * Inspect geometry has one visual authority: the actual
   * screenshot image rendered to the user.
   *
   * Element coordinates are projected from intrinsic image
   * pixels into the rendered image rectangle.
   *
   * The resulting position is then expressed relative to
   * the overlay containing block.
   *
   * No device model, resolution, orientation, system-bar
   * offset or platform-specific constant is involved.
   */
  const viewportBounds =
    deviceBoundsToViewport(
      bounds,
      screenElement.naturalWidth,
      screenElement.naturalHeight,
      imageRect.width,
      imageRect.height,
      imageRect.left - parentRect.left,
      imageRect.top - parentRect.top,
    );

  return (
    <div
      className={
        selected
          ? "mi-bounds mi-bounds-selected"
          : "mi-bounds"
      }
      style={{
        left: viewportBounds.left,
        top: viewportBounds.top,
        width: viewportBounds.width,
        height: viewportBounds.height,
      }}
    />
  );
}
