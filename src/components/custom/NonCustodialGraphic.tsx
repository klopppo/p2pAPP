interface NonCustodialGraphicProps {
  className?: string
}

/**
 * Animated "non-custodial" illustration — 3D shaded.
 *
 * An isometric wallet (you hold your keys) with a glowing key, bidirectional
 * flowing energy lines, and a smart-contract cubic core with a glowing inner
 * cube (escrow). The cubes use 3-face isometric shading (top/light, left/mid,
 * right/dark) plus blurred contact shadows that stay grounded while the wallet
 * floats above them. Theme-aware: wireframe uses `currentColor`, accents use
 * the `--primary` token.
 *
 * Ported (graphic only) from the landing mockup. Keyframes live in index.css:
 * `.ncg-float` / `.ncg-flow-dash` / `.ncg-pulse-slow`.
 */
export function NonCustodialGraphic({ className }: NonCustodialGraphicProps) {
  // Glow built from the brand color so it adapts to the theme.
  const glow = (strength: number) =>
    `drop-shadow(0 0 ${strength}px color-mix(in srgb, var(--primary) 65%, transparent))`

  return (
    <svg
      className={className}
      viewBox="0 0 800 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Your wallet locks funds directly in a smart-contract escrow — no custodian holds them"
    >
      <defs>
        {/* soft blur for contact shadows */}
        <filter id="ncg-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        {/* radial aura behind the core */}
        <radialGradient id="ncg-aura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.4 }} />
          <stop offset="70%" style={{ stopColor: 'var(--primary)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      {/* Left — isometric wallet (you hold it) */}
      <g transform="translate(120,140)">
        {/* grounded contact shadow (stays put while the cube floats) */}
        <ellipse cx={70} cy={170} rx={80} ry={13} fill="currentColor" fillOpacity={0.28} filter="url(#ncg-blur)" />
        <g className="ncg-float">
          {/* body — 3-face shading: top light, left mid, right dark */}
          <path d="M0 40 L20 20 L140 60 L120 80 Z" fill="currentColor" fillOpacity={0.17} stroke="currentColor" strokeWidth={2.5} />
          <path d="M0 40 L0 120 L120 160 L120 80 Z" fill="currentColor" fillOpacity={0.10} stroke="currentColor" strokeWidth={2.5} />
          <path d="M120 160 L140 140 L140 60 L120 80 Z" fill="currentColor" fillOpacity={0.05} stroke="currentColor" strokeWidth={2.5} />
          {/* flap + button */}
          <path d="M110 75 L140 85 L140 105 L110 95 Z" fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={2} />
          <circle cx={125} cy={90} r={3} fill="currentColor" />
          {/* glowing key */}
          <g style={{ filter: glow(8) }}>
            <circle cx={50} cy={100} r={12} fill="none" stroke="var(--primary)" strokeWidth={2.5} />
            <path d="M62 100 L90 100 L90 110 M75 100 L75 108" fill="none" stroke="var(--primary)" strokeWidth={2.5} />
          </g>
        </g>
      </g>

      {/* Center — bidirectional flow */}
      <g opacity={0.9}>
        {/* top: wallet -> contract */}
        <path
          className="ncg-flow-dash"
          d="M280 180 Q400 120 520 180"
          stroke="var(--primary)"
          strokeDasharray="10 10"
          strokeWidth={2.5}
          fill="none"
          style={{ filter: glow(4) }}
        />
        <path d="M510 170 L525 180 L510 190" fill="var(--primary)" />
        {/* bottom: contract -> wallet (reverse) */}
        <path
          className="ncg-flow-dash"
          d="M520 280 Q400 340 280 280"
          stroke="var(--primary)"
          strokeDasharray="10 10"
          strokeWidth={2.5}
          fill="none"
          style={{ animationDirection: 'reverse', filter: glow(4) }}
        />
        <path d="M290 270 L275 280 L290 290" fill="var(--primary)" />
      </g>

      {/* Right — smart-contract cubic core */}
      <g transform="translate(540,140)">
        {/* grounded contact shadow */}
        <ellipse cx={80} cy={190} rx={92} ry={15} fill="currentColor" fillOpacity={0.25} filter="url(#ncg-blur)" />
        {/* aura */}
        <ellipse cx={80} cy={95} rx={120} ry={100} fill="url(#ncg-aura)" />
        {/* outer frame */}
        <path d="M0 50 L80 0 L160 50 L80 100 Z" fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.5} />
        <path d="M0 50 L0 130 L80 180 L80 100 Z" fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.5} />
        <path d="M80 180 L160 130 L160 50 L80 100 Z" fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.5} />
        {/* glowing core — 3-face shading */}
        <g className="ncg-pulse-slow" style={{ filter: glow(15) }}>
          <path d="M30 65 L80 35 L130 65 L80 95 Z" fill="var(--primary)" fillOpacity={0.42} stroke="var(--primary)" strokeWidth={2} />
          <path d="M30 65 L30 115 L80 145 L80 95 Z" fill="var(--primary)" fillOpacity={0.26} stroke="var(--primary)" strokeWidth={2} />
          <path d="M80 145 L130 115 L130 65 L80 95 Z" fill="var(--primary)" fillOpacity={0.15} stroke="var(--primary)" strokeWidth={2} />
          {/* inner solid cube */}
          <path d="M65 80 L80 70 L95 80 L80 90 Z" fill="var(--primary)" />
        </g>
      </g>
    </svg>
  )
}
