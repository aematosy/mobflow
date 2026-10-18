import {
  useEffect,
  useRef,
  useState,
} from "react";

import { mobileApi } from "../../../services/mobileApi";

interface Props {
  screenshotBase64: string;
  deviceId: string;
  platform: "android" | "ios";
  streaming?: boolean;
  alt?: string;
  imageRef?: React.RefObject<HTMLImageElement | null>;
}

export default function LiveDeviceSurface({
  screenshotBase64,
  deviceId,
  platform,
  streaming = false,
  alt = "Current device",
  imageRef,
}: Props) {
  const [liveFrame, setLiveFrame] =
    useState<string | null>(null);

  const generationRef =
    useRef(0);

  useEffect(() => {
    const generation =
      ++generationRef.current;

    let stopped = false;

    if (
      !streaming
      || platform !== "android"
    ) {
      setLiveFrame(null);
      return () => {
        stopped = true;
      };
    }

    const run = async () => {
      while (
        !stopped
        && generationRef.current
          === generation
      ) {
        try {
          const frame =
            await mobileApi.androidStreamFrame(
              deviceId,
            );

          if (
            stopped
            || generationRef.current
              !== generation
          ) {
            return;
          }

          setLiveFrame(frame);

          /*
           * UI delivery is intentionally bounded to ~30 FPS.
           * The backend decoder may run independently.
           */
          await new Promise(
            (resolve) =>
              window.setTimeout(
                resolve,
                33,
              ),
          );
        } catch (reason) {
          console.warn(
            "Live frame failed; keeping last available frame",
            reason,
          );

          /*
           * Avoid a hot error loop if ADB temporarily
           * disappears.
           */
          await new Promise(
            (resolve) =>
              window.setTimeout(
                resolve,
                300,
              ),
          );
        }
      }
    };

    void run();

    return () => {
      stopped = true;
    };
  }, [
    deviceId,
    platform,
    streaming,
  ]);

  const frame =
    liveFrame
    ?? screenshotBase64;

  const reallyLive =
    streaming
    && liveFrame !== null;

  return (
    <div
      className={[
        "mi-live-device-surface",
        reallyLive
          ? "mi-live-device-streaming"
          : "mi-live-device-fallback",
      ].join(" ")}
    >
      <img
        ref={imageRef}
        src={`data:image/png;base64,${frame}`}
        alt={alt}
        draggable={false}
      />

    </div>
  );
}
