import {
  useEffect,
  useState,
} from "react";

import { mobileApi } from "../../services/mobileApi";

import type {
  MobileRecording,
} from "../inspector/mobile-recorder";

interface Props {
  onClose: () => void;
}

export default function RecordingLibrary({
  onClose,
}: Props) {
  const [recordings, setRecordings] =
    useState<MobileRecording[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      setRecordings(
        await mobileApi.listMobileRecordings(),
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

  useEffect(() => {
    void load();
  }, []);

  const remove = async (
    recordingId: string,
  ) => {
    try {
      await mobileApi.deleteMobileRecording(
        recordingId,
      );

      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : String(reason),
      );
    }
  };

  const exportRecording = async (
    recording: MobileRecording,
  ) => {
    try {
      setError(null);

      await mobileApi.exportMobileRecording(
        recording,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : String(reason),
      );
    }
  };

  return (
    <div className="recording-library-overlay">
      <section className="recording-library">
        <header className="recording-library-header">
          <div>
            <span>TESTFLOW MOBILE</span>
            <h2>Recordings</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        {error && (
          <div className="recording-library-error">
            {error}
          </div>
        )}

        <div className="recording-library-content">
          {loading ? (
            <div className="recording-library-empty">
              Loading recordings…
            </div>
          ) : recordings.length === 0 ? (
            <div className="recording-library-empty">
              <strong>No recordings yet</strong>
              <span>
                Finish a recording and it will appear here.
              </span>
            </div>
          ) : (
            recordings.map(
              (recording) => (
                <article
                  key={recording.id}
                  className="recording-library-card"
                >
                  <div className="recording-library-card-main">
                    <span className="recording-library-platform">
                      {recording.platform}
                    </span>

                    <strong>
                      {recording.applicationPackage}
                    </strong>

                    <span>
                      {recording.deviceId}
                      {" · "}
                      {recording.steps.length}
                      {" steps"}
                    </span>

                    <code>
                      {recording.id}
                    </code>
                  </div>

                  <div className="recording-library-actions">
                    <button
                      type="button"
                      className="recording-library-primary"
                      disabled
                      title="Runner is the next V5 stage"
                    >
                      Run
                    </button>

                    <button
                      type="button"
                      disabled
                      title="Editor is the next V5 stage"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void exportRecording(
                          recording,
                        )
                      }
                    >
                      Export
                    </button>

                    <button
                      type="button"
                      className="recording-library-delete"
                      onClick={() =>
                        void remove(
                          recording.id,
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ),
            )
          )}
        </div>
      </section>
    </div>
  );
}
