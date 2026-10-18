interface IosDeviceControlsProps {
  disabled?: boolean;
  onHome: () => void;
  onLock: () => void;
}

export function IosDeviceControls({
  disabled = false,
  onHome,
  onLock,
}: IosDeviceControlsProps) {
  return (
    <aside
      className="mi-device-side-controls mi-ios-controls"
      aria-label="iOS device controls"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onHome}
        title="Home"
        aria-label="iOS Home"
      >
        <span className="mi-ios-home-icon" />
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={onLock}
        title="Lock device"
        aria-label="Lock iOS device"
      >
        <span className="mi-ios-lock-icon">
          ◇
        </span>
      </button>
    </aside>
  );
}
