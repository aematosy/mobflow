import type {
  InspectorElement,
} from "../../../types/mobile";

import "./TextInputInteraction.css";

interface Props {
  target: InspectorElement;
  value: string;
  busy: boolean;
  error: string | null;

  onValueChange: (
    value: string,
  ) => void;

  onType: () => void;
  onClear: () => void;
  onCancel: () => void;
}

function targetLabel(
  target: InspectorElement,
): string {
  return (
    target.accessibilityId
    ?? target.text
    ?? target.resourceId
    ?? target.elementType
  );
}

export default function TextInputInteraction({
  target,
  value,
  busy,
  error,
  onValueChange,
  onType,
  onClear,
  onCancel,
}: Props) {
  const submit = (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      busy
      || value.length === 0
    ) {
      return;
    }

    onType();
  };

  return (
    <div className="mi-text-input-interaction">
      <div className="mi-text-input-icon">
        ✎
      </div>

      <div className="mi-text-input-heading">
        <strong>Text input</strong>

        <span>
          Editable element selected
        </span>
      </div>

      <div className="mi-text-input-target">
        <span>TARGET</span>

        <strong>
          {targetLabel(target)}
        </strong>

        <code>
          {target.elementType}
        </code>
      </div>

      <form
        className="mi-text-input-form"
        onSubmit={submit}
      >
        <label htmlFor="mi-interaction-text">
          Text to enter
        </label>

        <input
          id="mi-interaction-text"
          type="text"
          value={value}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          placeholder="Enter text..."
          onChange={(event) =>
            onValueChange(
              event.currentTarget.value,
            )
          }
        />

        {error && (
          <div
            className="mi-text-input-error"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="mi-text-input-buttons">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onClear}
          >
            Clear
          </button>

          <button
            type="submit"
            disabled={
              busy
              || value.length === 0
            }
          >
            {busy
              ? "Working..."
              : "Type text"}
          </button>
        </div>
      </form>

      <small>
        Enter also sends the text to the selected field.
      </small>
    </div>
  );
}
