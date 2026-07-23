import { useEffect, useState } from 'react'

/**
 * Non-Custodial Protocol diagram — wallet <-> smart contract escrow flow.
 * Pure visual component.
 */
function TrustlessFlow() {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-card rounded-3xl border border-white/5 shadow-2xl overflow-hidden group">
      <div className="relative w-full max-w-[600px] aspect-[2/1]">
        <svg
          viewBox="0 0 800 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_0_30px_rgba(255,0,199,0.1)]"
        >
          {/* Wallet Section (Left) */}
          <g transform="translate(100, 150)" className="animate-float">
            <path
              d="M10 40 L60 10 L160 50 L110 80 Z"
              fill="#1C1C1C"
              stroke="white"
              strokeWidth="2"
              className="transition-all duration-500 group-hover:stroke-brand-accent"
            />
            <path d="M10 40 L10 100 L110 140 L110 80 Z" fill="#1C1C1C" stroke="white" strokeWidth="2" />
            <path d="M110 140 L160 110 L160 50 L110 80 Z" fill="#1C1C1C" stroke="white" strokeWidth="2" />
            <path d="M130 65 L160 80 L160 100 L130 85 Z" fill="#1C1C1C" stroke="white" strokeWidth="2" />

            {/* Key Icon with Neon Glow */}
            <circle cx="65" cy="85" r="10" stroke="var(--brand-accent)" strokeWidth="2" fill="none">
              <animate attributeName="r" values="9;11;9" dur="3s" repeatCount="indefinite" />
            </circle>
            <path
              d="M75 85 L95 85 L95 95 M85 85 L85 90"
              stroke="var(--brand-accent)"
              strokeWidth="2"
              fill="none"
              className="drop-shadow-[0_0_8px_var(--brand-accent)]"
            />
          </g>

          {/* Flow Arrows (Animated Dash) */}
          <g className="opacity-80">
            {/* Top Flow: Wallet to Contract */}
            <path
              d="M280 180 Q400 130 520 180"
              stroke="var(--brand-accent)"
              strokeWidth="2"
              fill="none"
              strokeDasharray="8 8"
              className="animate-flow-dash"
            />
            <path
              d="M510 170 L525 182 L510 190"
              stroke="var(--brand-accent)"
              strokeWidth="2"
              fill="none"
              className="drop-shadow-[0_0_5px_var(--brand-accent)]"
            />

            {/* Bottom Flow: Return/Feedback */}
            <path
              d="M280 260 Q400 310 520 260"
              stroke="var(--brand-accent)"
              strokeWidth="2"
              fill="none"
              className="drop-shadow-[0_0_10px_rgba(255,0,199,0.3)]"
            />
            <path d="M290 250 L275 258 L290 270" stroke="var(--brand-accent)" strokeWidth="2" fill="none" />
          </g>

          {/* Smart Contract Section (Right) */}
          <g transform="translate(550, 150)">
            {/* Outer Box */}
            <path d="M0 40 L70 0 L140 40 L70 80 Z" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" fill="none" />
            <path d="M0 40 L0 100 L70 140 L70 80 Z" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" fill="none" />
            <path d="M70 140 L140 100 L140 40 L70 80 Z" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" fill="none" />

            {/* Glowing Core */}
            <g className="animate-pulse-slow">
              <path
                d="M40 55 L70 40 L100 55 L70 70 Z"
                fill="var(--brand-accent)"
                fillOpacity="0.2"
                stroke="var(--brand-accent)"
                strokeWidth="2"
                className="drop-shadow-[0_0_15px_var(--brand-accent)]"
              />
              <path d="M40 55 L40 85 L70 100 L70 70 Z" fill="var(--brand-accent)" fillOpacity="0.2" stroke="var(--brand-accent)" strokeWidth="2" />
              <path d="M70 100 L100 85 L100 55 L70 70 Z" fill="var(--brand-accent)" fillOpacity="0.2" stroke="var(--brand-accent)" strokeWidth="2" />
            </g>
          </g>
        </svg>

        <style>{`
          @keyframes flow-dash { to { stroke-dashoffset: -100; } }
          @keyframes float {
            0%, 100% { transform: translate(100px, 150px); }
            50% { transform: translate(100px, 140px); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          .animate-flow-dash { animation: flow-dash 10s linear infinite; }
          .animate-float { animation: float 4s ease-in-out infinite; }
          .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        `}</style>
      </div>

      <div className="mt-6 text-center">
        <h3 className="text-white font-bold text-lg tracking-tight">Non-Custodial Protocol</h3>
        <p className="text-white/40 text-sm mt-1 max-w-[300px]">
          Smart contract escrow ensures funds move directly between peers.
        </p>
      </div>
    </div>
  )
}

export default TrustlessFlow

/**
 * Hold the "Y" key to reveal the TrustlessFlow diagram as a full-screen overlay.
 * Release to hide. Ignored while typing in inputs / textareas / contenteditable.
 */
export function TrustlessFlowOverlay() {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if ((e.key === 'y' || e.key === 'Y') && !isEditable(e.target)) setHeld(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'y' || e.key === 'Y') setHeld(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  if (!held) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <TrustlessFlow />
    </div>
  )
}
