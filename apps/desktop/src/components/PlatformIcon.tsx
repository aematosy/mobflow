type PlatformIconProps = {
  platform: "android" | "ios";
  className?: string;
};

export function PlatformIcon({
  platform,
  className = "",
}: PlatformIconProps) {
  if (platform === "android") {
    return (
      <span
        className={`platform-icon platform-icon-android ${className}`.trim()}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M7.2 8.1h9.6c1.15 0 2.08.93 2.08 2.08v6.2c0 1.15-.93 2.08-2.08 2.08H7.2a2.08 2.08 0 0 1-2.08-2.08v-6.2c0-1.15.93-2.08 2.08-2.08Z"
            fill="currentColor"
          />
          <path
            d="M7.7 7.9c.2-2.15 2.05-3.82 4.3-3.82s4.1 1.67 4.3 3.82"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
          />
          <path
            d="m8.5 3.1 1.05 1.55M15.5 3.1l-1.05 1.55"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
          <circle cx="9.5" cy="6.25" r=".65" fill="#0d1622" />
          <circle cx="14.5" cy="6.25" r=".65" fill="#0d1622" />
          <path
            d="M7.9 18.2v2.1M16.1 18.2v2.1M3.7 10.1v5.2M20.3 10.1v5.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`platform-icon platform-icon-ios ${className}`.trim()}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.7 12.7c.02-2.05 1.68-3.04 1.76-3.09-.96-1.4-2.45-1.59-2.98-1.61-1.25-.13-2.47.75-3.11.75-.65 0-1.63-.74-2.69-.72-1.36.02-2.64.81-3.34 2.04-1.44 2.49-.37 6.15 1.01 8.16.69.99 1.49 2.09 2.55 2.05 1.04-.04 1.43-.66 2.69-.66 1.24 0 1.61.66 2.69.63 1.11-.02 1.81-.99 2.47-1.99.8-1.13 1.12-2.25 1.13-2.31-.03-.01-2.16-.84-2.18-3.26Z" />
        <path d="M14.66 6.68c.55-.69.93-1.63.82-2.58-.8.04-1.8.56-2.37 1.23-.51.59-.97 1.57-.85 2.48.91.07 1.84-.46 2.4-1.13Z" />
      </svg>
    </span>
  );
}
