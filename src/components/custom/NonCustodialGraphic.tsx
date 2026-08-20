interface NonCustodialGraphicProps {
  className?: string
}

/**
 * Enhanced animated "non-custodial" illustration.
 *
 * Isometric wallet (you hold your keys) → bidirectional animated particle
 * flow → smart-contract core with orbital rings, shield lock, and hexagonal
 * blockchain nodes. 3-face isometric shading, blurred contact shadows,
 * glowing accents. Theme-aware: wireframe uses `currentColor`, accents use
 * `--primary`. Keyframes in index.css: `.ncg-float` / `.ncg-flow-dash` /
 * `.ncg-pulse-slow` / `.ncg-orbit` / `.ncg-particle` / `.ncg-hex-pulse`.
 */
export function NonCustodialGraphic({ className }: NonCustodialGraphicProps) {
  const glow = (strength: number) =>
    `drop-shadow(0 0 ${strength}px color-mix(in srgb, var(--primary) 65%, transparent))`

  const glowStrong = (strength: number) =>
    `drop-shadow(0 0 ${strength}px color-mix(in srgb, var(--primary) 80%, transparent))`

  return (
    <svg
      className={className}
      viewBox="0 0 900 450"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Your wallet locks funds directly in a smart-contract escrow — no custodian holds them"
    >
      <defs>
        <filter id="ncg-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id="ncg-blur-sm" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <radialGradient id="ncg-aura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.35 }} />
          <stop offset="60%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.08 }} />
          <stop offset="100%" style={{ stopColor: 'var(--primary)', stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id="ncg-aura-strong" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.5 }} />
          <stop offset="50%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.12 }} />
          <stop offset="100%" style={{ stopColor: 'var(--primary)', stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id="ncg-flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.1 }} />
          <stop offset="50%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.6 }} />
          <stop offset="100%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.1 }} />
        </linearGradient>
        <linearGradient id="ncg-chain-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.5 }} />
          <stop offset="50%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.2 }} />
          <stop offset="100%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.5 }} />
        </linearGradient>
      </defs>

      {/* ═══════════════════════════════════════════════════ */}
      {/* BACKGROUND — Rotating blockchain node ring          */}
      {/* ═══════════════════════════════════════════════════ */}
      <g>
        {/* Outer ring — 16 nodes, slow clockwise rotation */}
        <g className="ncg-ring-rotate">
          {Array.from({ length: 16 }, (_, i) => {
            const angle = (i / 16) * Math.PI * 2
            const rx = 410
            const ry = 200
            const x = 450 + Math.cos(angle) * rx
            const y = 225 + Math.sin(angle) * ry
            return (
              <g key={`rn1-${i}`} className="ncg-node-pulse" style={{ animationDelay: `${i * 0.35}s` }}>
                {/* Connecting line to next node */}
                <line
                  x1={x}
                  y1={y}
                  x2={450 + Math.cos(((i + 1) / 16) * Math.PI * 2) * rx}
                  y2={225 + Math.sin(((i + 1) / 16) * Math.PI * 2) * ry}
                  stroke="var(--primary)"
                  strokeWidth={0.6}
                  strokeOpacity={0.18}
                />
                {/* Hexagonal node */}
                <polygon
                  points={`${x},${y - 7} ${x + 6},${y - 3.5} ${x + 6},${y + 3.5} ${x},${y + 7} ${x - 6},${y + 3.5} ${x - 6},${y - 3.5}`}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={0.8}
                  strokeOpacity={0.22}
                />
                {/* Node core dot */}
                <circle cx={x} cy={y} r={1.8} fill="var(--primary)" fillOpacity={0.3} />
                {/* Glow halo */}
                <circle cx={x} cy={y} r={5} fill="var(--primary)" fillOpacity={0.06} />
              </g>
            )
          })}
        </g>

        {/* Inner ring — 10 nodes, counter-clockwise rotation */}
        <g className="ncg-ring-rotate-rev">
          {Array.from({ length: 10 }, (_, i) => {
            const angle = (i / 10) * Math.PI * 2
            const rx = 280
            const ry = 135
            const x = 450 + Math.cos(angle) * rx
            const y = 225 + Math.sin(angle) * ry
            return (
              <g key={`rn2-${i}`} className="ncg-node-pulse" style={{ animationDelay: `${i * 0.5 + 0.2}s` }}>
                <line
                  x1={x}
                  y1={y}
                  x2={450 + Math.cos(((i + 1) / 10) * Math.PI * 2) * rx}
                  y2={225 + Math.sin(((i + 1) / 10) * Math.PI * 2) * ry}
                  stroke="var(--primary)"
                  strokeWidth={0.5}
                  strokeOpacity={0.12}
                />
                {/* Small diamond node */}
                <rect
                  x={x - 4}
                  y={y - 4}
                  width={8}
                  height={8}
                  rx={1.5}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={0.7}
                  strokeOpacity={0.16}
                  transform={`rotate(45, ${x}, ${y})`}
                />
                <circle cx={x} cy={y} r={1.2} fill="var(--primary)" fillOpacity={0.25} />
              </g>
            )
          })}
        </g>
      </g>

      {/* ─── Background hex grid nodes ─── */}
      <g opacity={0.15}>
        {/* Scattered hexagonal nodes suggesting blockchain network */}
        {[
          [60, 80], [180, 50], [320, 30], [450, 55], [580, 25], [720, 60], [840, 45],
          [100, 380], [250, 400], [400, 420], [550, 395], [700, 410], [820, 385],
          [40, 220], [860, 200], [450, 15], [450, 435],
        ].map(([x, y], i) => (
          <g key={i} className="ncg-hex-pulse" style={{ animationDelay: `${i * 0.3}s` }}>
            <polygon
              points={`${x},${y - 8} ${x + 7},${y - 4} ${x + 7},${y + 4} ${x},${y + 8} ${x - 7},${y + 4} ${x - 7},${y - 4}`}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1}
              strokeOpacity={0.5}
            />
            <circle cx={x} cy={y} r={1.5} fill="var(--primary)" fillOpacity={0.6} />
          </g>
        ))}
        {/* Connecting lines between nearby hexes */}
        <line x1={60} y1={80} x2={180} y2={50} stroke="var(--primary)" strokeWidth={0.5} strokeOpacity={0.3} strokeDasharray="4 4" />
        <line x1={180} y1={50} x2={320} y2={30} stroke="var(--primary)" strokeWidth={0.5} strokeOpacity={0.3} strokeDasharray="4 4" />
        <line x1={720} y1={60} x2={840} y2={45} stroke="var(--primary)" strokeWidth={0.5} strokeOpacity={0.3} strokeDasharray="4 4" />
        <line x1={250} y1={400} x2={400} y2={420} stroke="var(--primary)" strokeWidth={0.5} strokeOpacity={0.3} strokeDasharray="4 4" />
        <line x1={550} y1={395} x2={700} y2={410} stroke="var(--primary)" strokeWidth={0.5} strokeOpacity={0.3} strokeDasharray="4 4" />
      </g>

      {/* ─── Chain-link path (wallet → contract backbone) ─── */}
      <g opacity={0.3}>
        <path
          d="M240 225 L660 225"
          stroke="url(#ncg-chain-grad)"
          strokeWidth={1}
          strokeDasharray="6 8"
          fill="none"
        />
        {/* Chain link nodes along the path */}
        {[300, 380, 460, 540, 620].map((x, i) => (
          <g key={i}>
            <rect x={x - 3} y={222} width={6} height={6} rx={1} fill="var(--primary)" fillOpacity={0.25} stroke="var(--primary)" strokeWidth={0.7} strokeOpacity={0.4} />
          </g>
        ))}
      </g>

      {/* ═══════════════════════════════════════════ */}
      {/* LEFT — Isometric Wallet (you hold your keys) */}
      {/* ═══════════════════════════════════════════ */}
      <g transform="translate(100,120)">
        {/* Ground shadow */}
        <ellipse cx={80} cy={195} rx={90} ry={14} fill="currentColor" fillOpacity={0.22} filter="url(#ncg-blur)" />

        <g className="ncg-float">
          {/* Wallet body — 3-face isometric shading */}
          {/* Top face */}
          <path d="M0 45 L25 22 L155 62 L130 85 Z" fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
          {/* Left face */}
          <path d="M0 45 L0 135 L130 175 L130 85 Z" fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
          {/* Right face */}
          <path d="M130 175 L155 152 L155 62 L130 85 Z" fill="currentColor" fillOpacity={0.04} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />

          {/* Card slot lines on left face */}
          <line x1={15} y1={75} x2={115} y2={115} stroke="currentColor" strokeWidth={1} strokeOpacity={0.15} />
          <line x1={15} y1={90} x2={115} y2={130} stroke="currentColor" strokeWidth={1} strokeOpacity={0.12} />
          <line x1={15} y1={105} x2={115} y2={145} stroke="currentColor" strokeWidth={1} strokeOpacity={0.09} />

          {/* Flap + clasp */}
          <path d="M118 80 L155 92 L155 115 L118 103 Z" fill="currentColor" fillOpacity={0.06} stroke="currentColor" strokeWidth={1.5} />
          <circle cx={135} cy={97} r={3.5} fill="none" stroke="var(--primary)" strokeWidth={1.5} />
          <circle cx={135} cy={97} r={1.2} fill="var(--primary)" />

          {/* ── Glowing key with orbit ring ── */}
          <g className="ncg-orbit-key" style={{ transformOrigin: '55px 110px' }}>
            {/* Orbit ring */}
            <ellipse cx={55} cy={110} rx={28} ry={8} fill="none" stroke="var(--primary)" strokeWidth={0.8} strokeOpacity={0.25} strokeDasharray="3 3" className="ncg-flow-dash" />
            {/* Key body */}
            <g style={{ filter: glowStrong(10) }}>
              <circle cx={55} cy={110} r={13} fill="none" stroke="var(--primary)" strokeWidth={2.5} />
              <path d="M68 110 L96 110" fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" />
              <path d="M82 110 L82 119" fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" />
              <path d="M90 110 L90 117" fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" />
              {/* Key glow dot */}
              <circle cx={55} cy={110} r={4} fill="var(--primary)" fillOpacity={0.3} />
            </g>
          </g>

          {/* "YOU" label */}
          <text x={65} y={200} fill="currentColor" fillOpacity={0.35} fontSize={10} fontWeight={600} letterSpacing="0.1em" textAnchor="middle" fontFamily="Inter Variable, sans-serif">YOU</text>
        </g>
      </g>

      {/* ═══════════════════════════════════════════════ */}
      {/* CENTER — Bidirectional animated particle flow    */}
      {/* ═══════════════════════════════════════════════ */}
      <g>
        {/* Flow path glow (background) */}
        <path
          d="M260 195 C350 140, 500 140, 590 195"
          stroke="var(--primary)"
          strokeWidth={3}
          strokeOpacity={0.08}
          fill="none"
          style={{ filter: glow(6) }}
        />
        {/* Top arc: wallet → contract */}
        <path
          className="ncg-flow-dash"
          d="M260 195 C350 140, 500 140, 590 195"
          stroke="var(--primary)"
          strokeDasharray="8 12"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          style={{ filter: glow(3) }}
        />
        {/* Arrow head → cusp at exact path endpoint (590, 195) */}
        <path d="M578 186 L590 195 L578 204" fill="var(--primary)" fillOpacity={0.8} />

        {/* Bottom arc: contract → wallet (reverse) */}
        <path
          className="ncg-flow-dash"
          d="M590 295 C500 350, 350 350, 260 295"
          stroke="var(--primary)"
          strokeDasharray="8 12"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          style={{ animationDirection: 'reverse', filter: glow(3) }}
        />
        {/* Arrow head ← cusp at exact path endpoint (260, 295) */}
        <path d="M272 286 L260 295 L272 304" fill="var(--primary)" fillOpacity={0.8} />

        {/* Flow glow background (bottom) */}
        <path
          d="M590 295 C500 350, 350 350, 260 295"
          stroke="var(--primary)"
          strokeWidth={3}
          strokeOpacity={0.06}
          fill="none"
          style={{ filter: glow(4) }}
        />

        {/* ── Animated particles along top path ── */}
        {[0, 1, 2, 3].map((i) => (
          <circle
            key={`pt-${i}`}
            className="ncg-particle"
            r={2.5}
            fill="var(--primary)"
            style={{
              offsetPath: `path("M260 195 C350 140, 500 140, 590 195")`,
              animationDelay: `${i * 1.2}s`,
              filter: glowStrong(4),
            }}
          />
        ))}
        {/* ── Animated particles along bottom path ── */}
        {[0, 1, 2, 3].map((i) => (
          <circle
            key={`pb-${i}`}
            className="ncg-particle-reverse"
            r={2.5}
            fill="var(--primary)"
            style={{
              offsetPath: `path("M590 295 C500 350, 350 350, 260 295")`,
              animationDelay: `${i * 1.2}s`,
              filter: glowStrong(4),
            }}
          />
        ))}

        {/* Center label */}
        <text x={425} y={225} fill="var(--primary)" fillOpacity={0.5} fontSize={9} fontWeight={600} letterSpacing="0.15em" textAnchor="middle" fontFamily="Inter Variable, sans-serif">ESCROW</text>
      </g>

      {/* ═══════════════════════════════════════════════════ */}
      {/* RIGHT — Smart-contract cubic core with orbital rings */}
      {/* ═══════════════════════════════════════════════════ */}
      <g transform="translate(600,120)">
        {/* Ground shadow */}
        <ellipse cx={90} cy={210} rx={105} ry={16} fill="currentColor" fillOpacity={0.2} filter="url(#ncg-blur)" />

        {/* Large aura */}
        <ellipse cx={90} cy={100} rx={140} ry={120} fill="url(#ncg-aura)" />

        {/* ── Orbital rings ── */}
        {/* Ring 1 — horizontal orbit */}
        <ellipse
          cx={90} cy={105} rx={110} ry={22}
          fill="none" stroke="var(--primary)" strokeWidth={0.8} strokeOpacity={0.2}
          strokeDasharray="4 6"
          className="ncg-flow-dash"
          style={{ transformOrigin: '90px 105px', animationDuration: '8s' }}
        />
        {/* Ring 2 — tilted orbit */}
        <ellipse
          cx={90} cy={95} rx={95} ry={30}
          fill="none" stroke="var(--primary)" strokeWidth={0.6} strokeOpacity={0.15}
          strokeDasharray="3 5"
          className="ncg-flow-dash"
          style={{ transformOrigin: '90px 95px', animationDuration: '12s', animationDirection: 'reverse' }}
        />
        {/* Ring 3 — vertical orbit */}
        <ellipse
          cx={90} cy={100} rx={20} ry={105}
          fill="none" stroke="var(--primary)" strokeWidth={0.5} strokeOpacity={0.12}
          strokeDasharray="3 5"
          className="ncg-flow-dash"
          style={{ transformOrigin: '90px 100px', animationDuration: '15s' }}
        />

        {/* Orbiting dot */}
        <circle
          className="ncg-orbit"
          r={3}
          fill="var(--primary)"
          style={{
            offsetPath: `ellipse(110px 22px at 90px 105px)`,
            filter: glowStrong(5),
          }}
        />

        {/* Outer wireframe frame — 3 faces */}
        <path d="M0 55 L90 0 L180 55 L90 110 Z" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1.2} />
        <path d="M0 55 L0 145 L90 200 L90 110 Z" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1.2} />
        <path d="M90 200 L180 145 L180 55 L90 110 Z" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1.2} />

        {/* Mid frame */}
        <path d="M20 68 L90 28 L160 68 L90 108 Z" fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />

        {/* ── Glowing core cube with 3-face shading ── */}
        <g className="ncg-pulse-slow" style={{ filter: glowStrong(18) }}>
          <path d="M35 72 L90 40 L145 72 L90 104 Z" fill="var(--primary)" fillOpacity={0.38} stroke="var(--primary)" strokeWidth={1.8} strokeLinejoin="round" />
          <path d="M35 72 L35 128 L90 160 L90 104 Z" fill="var(--primary)" fillOpacity={0.22} stroke="var(--primary)" strokeWidth={1.8} strokeLinejoin="round" />
          <path d="M90 160 L145 128 L145 72 L90 104 Z" fill="var(--primary)" fillOpacity={0.12} stroke="var(--primary)" strokeWidth={1.8} strokeLinejoin="round" />

          {/* ── Shield + Lock icon inside core ── */}
          {/* Shield outline */}
          <path
            d="M90 58 L72 68 L72 90 C72 105 90 118 90 118 C90 118 108 105 108 90 L108 68 Z"
            fill="var(--primary)"
            fillOpacity={0.15}
            stroke="var(--primary)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {/* Lock body */}
          <rect x={83} y={82} width={14} height={11} rx={2} fill="var(--primary)" fillOpacity={0.5} stroke="var(--primary)" strokeWidth={1.2} />
          {/* Lock shackle */}
          <path d="M86 82 L86 77 C86 73 94 73 94 77 L94 82" fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeLinecap="round" />
          {/* Keyhole */}
          <circle cx={90} cy={87} r={1.8} fill="var(--primary-foreground)" />
          <rect x={89.2} y={87} width={1.6} height={3} rx={0.5} fill="var(--primary-foreground)" />
        </g>

        {/* "CONTRACT" label */}
        <text x={90} y={222} fill="currentColor" fillOpacity={0.35} fontSize={10} fontWeight={600} letterSpacing="0.1em" textAnchor="middle" fontFamily="Inter Variable, sans-serif">CONTRACT</text>
      </g>

      {/* ─── Ambient floating particles ─── */}
      {[
        [200, 100, 1.2], [350, 80, 0.8], [500, 110, 1], [650, 90, 0.7],
        [280, 350, 0.9], [450, 370, 1.1], [600, 340, 0.6],
        [150, 250, 0.5], [750, 230, 0.8], [420, 60, 0.6],
      ].map(([x, y, r], i) => (
        <circle
          key={`amb-${i}`}
          cx={x}
          cy={y}
          r={r}
          fill="var(--primary)"
          fillOpacity={0.2}
          className="ncg-float"
          style={{ animationDelay: `${i * 0.5}s`, animationDuration: `${3 + i * 0.4}s` }}
        />
      ))}
    </svg>
  )
}
