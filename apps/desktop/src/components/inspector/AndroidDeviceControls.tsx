interface Props {
  disabled: boolean;

  onSwipeUp: () => void;
  onSwipeDown: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;

  onBack: () => void;
  onHideKeyboard: () => void;
}

export function AndroidDeviceControls({
  disabled,

  onSwipeUp,
  onSwipeDown,
  onSwipeLeft,
  onSwipeRight,

  onBack,
  onHideKeyboard,
}: Props) {
  return (
    <aside
      className="mi-device-side-controls"
      aria-label="Android device controls"
    >
      <div className="mi-gesture-pad">
        <button
          type="button"
          disabled={disabled}
          onClick={onSwipeUp}
          title="Scroll content up"
          aria-label="Scroll content up"
        >
          ↑
        </button>

        <div>
          <button
            type="button"
            disabled={disabled}
            onClick={onSwipeLeft}
            title="Scroll content left"
            aria-label="Scroll content left"
          >
            ←
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={onSwipeRight}
            title="Scroll content right"
            aria-label="Scroll content right"
          >
            →
          </button>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={onSwipeDown}
          title="Scroll content down"
          aria-label="Scroll content down"
        >
          ↓
        </button>
      </div>

      <div className="mi-device-control-divider" />

      <button
        type="button"
        disabled={disabled}
        onClick={onBack}
        title="Back"
        aria-label="Back"
        className="mi-back-control"
      >
        <span
          className="mi-back-control-icon"
          aria-hidden="true"
        >
          ‹
        </span>
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={onHideKeyboard}
        title="Hide keyboard"
        aria-label="Hide keyboard"
        className="mi-hide-keyboard-control"
      >
        <span
          className="mi-hide-keyboard-icon"
          aria-hidden="true"
        >
          ⌨
        </span>
      </button>

      

      
    </aside>
  );
}
