interface GabiLogoProps {
  size?: number
  className?: string
}

export function GabiLogo({ size = 64, className }: GabiLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      aria-label="G.A.B.I. logo"
    >
      <defs>
        <linearGradient id="gabiCubeGradSide" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6D28D9" />
          <stop offset="100%" stopColor="#4C1D95" />
        </linearGradient>
        <linearGradient id="gabiCubeGradTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#6D28D9" />
        </linearGradient>
      </defs>

      <path d="M 100 40 L 155 70 L 100 100 L 45 70 Z" fill="url(#gabiCubeGradTop)" />
      <path d="M 45 70 L 100 100 L 100 160 L 45 130 Z" fill="url(#gabiCubeGradSide)" />
      <path
        d="M 100 100 L 155 70 L 155 130 L 100 160 Z"
        fill="url(#gabiCubeGradSide)"
        opacity="0.85"
      />

      <g fill="none" stroke="#F97316" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 127.5 85 L 100 70 L 72.5 85 L 72.5 115 L 100 130 L 127.5 115 L 100 100" />
      </g>

      <circle cx="100" cy="100" r="5" fill="#F97316" />
    </svg>
  )
}
