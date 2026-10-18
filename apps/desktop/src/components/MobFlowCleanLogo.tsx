type MobFlowCleanLogoProps = {
  className?: string;
};

export const MobFlowCleanLogo = ({
  className = "",
}: MobFlowCleanLogoProps) => {
  return (
    <div className={`mobflow-logo ${className}`.trim()}>
      <svg
        viewBox="0 0 220 105"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="MobFlow Automation Engine"
      >
        <defs>
          <linearGradient
            id="mobTextGrad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#C084FC" />
            <stop offset="100%" stopColor="#F43F5E" />
          </linearGradient>

          <linearGradient
            id="flowTextGrad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>

          <linearGradient
            id="phoneBorderGrad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#818CF8" />
          </linearGradient>

          <linearGradient
            id="tapActiveGrad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#F43F5E" />
            <stop offset="100%" stopColor="#FB7185" />
          </linearGradient>

          <filter
            id="glowEffect"
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite
              in="SourceGraphic"
              in2="blur"
              operator="over"
            />
          </filter>
        </defs>

        <g
          fontFamily="Inter, system-ui, -apple-system, sans-serif"
          transform="translate(10, 0)"
        >
          <text
            x="0"
            y="65"
            fontSize="46"
            fontWeight="900"
            fill="url(#mobTextGrad)"
            letterSpacing="-1"
          >
            Mob
          </text>

          <text
            x="96"
            y="65"
            fontSize="46"
            fontWeight="500"
            fill="url(#flowTextGrad)"
            letterSpacing="-1"
          >
            Fl
          </text>

          <g transform="translate(135, 22)">
            <rect
              x="0"
              y="0"
              width="26"
              height="44"
              rx="7"
              fill="#0F172A"
              stroke="url(#phoneBorderGrad)"
              strokeWidth="2.5"
            />

            <line
              x1="9"
              y1="4"
              x2="17"
              y2="4"
              stroke="#38BDF8"
              strokeWidth="1.8"
              strokeLinecap="round"
              opacity="0.8"
            />

            <path
              d="M 7 33 Q 13 22 19 16"
              fill="none"
              stroke="url(#tapActiveGrad)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />

            <circle
              cx="19"
              cy="16"
              r="3"
              fill="#F43F5E"
              filter="url(#glowEffect)"
            />
          </g>

          <text
            x="169"
            y="65"
            fontSize="46"
            fontWeight="500"
            fill="url(#flowTextGrad)"
            letterSpacing="-1"
          >
            w
          </text>

          <g transform="translate(2, 88)">
            <circle
              cx="4"
              cy="-4"
              r="3"
              fill="#10B981"
              filter="url(#glowEffect)"
            />

            <text
              x="14"
              y="0"
              fontSize="10"
              fontWeight="700"
              fill="#64748B"
              letterSpacing="5"
            >
              AUTOMATION ENGINE
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
};
