export function StolotoLogo({ className = '' }: { className?: string }) {
  return (
    <svg 
      className={className}
      viewBox="0 0 240 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      style={{ height: '32px', width: 'auto', display: 'block', overflow: 'visible' }}
    >
      {/* 4 Balls */}
      <circle cx="16" cy="20" r="14" fill="#FFCC00" />
      <circle cx="36" cy="20" r="14" fill="#E3000F" style={{ mixBlendMode: 'multiply' }} />
      <circle cx="56" cy="20" r="14" fill="#00B350" style={{ mixBlendMode: 'multiply' }} />
      <circle cx="76" cy="20" r="14" fill="#00A0E4" style={{ mixBlendMode: 'multiply' }} />
      
      <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        {/* С */}
        <path d="M 112 14 A 8 8 0 0 0 112 26" />
        {/* Т */}
        <path d="M 120 12 L 136 12 M 128 12 L 128 28" />
        {/* О */}
        <circle cx="148" cy="20" r="8" />
        {/* Л */}
        <path d="M 162 28 L 166 12 L 170 28" />
        {/* О */}
        <circle cx="184" cy="20" r="8" />
        {/* Т */}
        <path d="M 196 12 L 212 12 M 204 12 L 204 28" />
        {/* О */}
        <circle cx="224" cy="20" r="8" />
      </g>
    </svg>
  )
}
