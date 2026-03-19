'use client';

import { memo } from 'react';

/* ── Design tokens (inline to avoid coupling to Chakra context) ── */
const ACCENT = '#F97316';
const ACCENT_DIM = 'rgba(249,115,22,0.55)';
const ACCENT_GLOW = 'rgba(249,115,22,0.35)';
const ACCENT_FAINT = 'rgba(249,115,22,0.12)';
const DARK = '#09090B';
const SURFACE = '#18181B';

/* ── Keyframe names injected via <style> inside SVG ──────────── */
const NS = 'aai'; // namespace prefix to avoid clashes

interface AdminAIAgentIconProps {
  /** Icon size in px (applied to width & height). Default: 28 */
  size?: number;
  /** Enable animations. Default: true */
  animated?: boolean;
  /** Enable outer glow filter. Default: true */
  glow?: boolean;
  /** Accessible title text */
  title?: string;
}

/**
 * Custom branded SVG icon for the TyreRescue Admin AI Agent.
 *
 * Composition:
 *  - Outer tyre ring with 6 tread notches
 *  - Inner circuit ring with 4 short circuit spokes
 *  - Central glowing AI core node
 *  - Small orbiting signal spark
 *
 * Animations (CSS keyframes, no JS runtime cost):
 *  - Outer tyre ring: slow continuous rotation (40s)
 *  - Central core: gentle breathing pulse (3s)
 *  - Signal spark: orbiting dot (6s)
 *  - Glow filter: subtle breathing (3s, offset from core)
 *
 * All animations respect prefers-reduced-motion automatically
 * and can be disabled via the `animated` prop.
 */
function AdminAIAgentIconInner({
  size = 28,
  animated = true,
  glow = true,
  title = 'Admin AI Agent',
}: AdminAIAgentIconProps) {
  const anim = animated ? '' : `
    .${NS}-spin, .${NS}-pulse, .${NS}-orbit, .${NS}-glow { animation: none !important; }
  `;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <title>{title}</title>

      {/* ── Scoped keyframes + reduced-motion ──────────── */}
      <style>{`
        @keyframes ${NS}-spin   { to { transform: rotate(360deg); } }
        @keyframes ${NS}-pulse  { 0%,100% { opacity:.75; r:5; } 50% { opacity:1; r:6.2; } }
        @keyframes ${NS}-orbit  { to { transform: rotate(360deg); } }
        @keyframes ${NS}-breathe{ 0%,100% { opacity:.45; } 50% { opacity:.7; } }

        .${NS}-spin  { animation: ${NS}-spin 40s linear infinite; transform-origin: 32px 32px; }
        .${NS}-pulse { animation: ${NS}-pulse 3s ease-in-out infinite; transform-origin: 32px 32px; }
        .${NS}-orbit { animation: ${NS}-orbit 6s linear infinite; transform-origin: 32px 32px; }
        .${NS}-glow  { animation: ${NS}-breathe 3s ease-in-out infinite 1.5s; }

        @media (prefers-reduced-motion: reduce) {
          .${NS}-spin, .${NS}-pulse, .${NS}-orbit, .${NS}-glow { animation: none !important; }
        }
        ${anim}
      `}</style>

      <defs>
        {/* Glow filter — lightweight gaussian, no heavy composites */}
        {glow && (
          <filter id={`${NS}-glow-f`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}

        {/* Radial gradient for core node */}
        <radialGradient id={`${NS}-core-g`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ACCENT} />
          <stop offset="70%" stopColor={ACCENT_DIM} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>

        {/* Background fill gradient */}
        <radialGradient id={`${NS}-bg-g`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={SURFACE} />
          <stop offset="100%" stopColor={DARK} />
        </radialGradient>
      </defs>

      {/* ── Background circle ────────────────────────── */}
      <circle cx="32" cy="32" r="30" fill={`url(#${NS}-bg-g)`} />

      {/* ── Outer tyre ring (rotates slowly) ─────────── */}
      <g className={`${NS}-spin`}>
        {/* Main tyre band */}
        <circle cx="32" cy="32" r="26" fill="none" stroke={ACCENT} strokeWidth="3.5" strokeOpacity="0.6" />
        <circle cx="32" cy="32" r="26" fill="none" stroke={ACCENT} strokeWidth="3.5" strokeOpacity="0.3"
          strokeDasharray="10 17.27" strokeLinecap="round" />

        {/* 6 tread notch marks on outer edge */}
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <line
            key={deg}
            x1="32" y1="3.5" x2="32" y2="7"
            stroke={ACCENT}
            strokeWidth="2"
            strokeLinecap="round"
            strokeOpacity="0.5"
            transform={`rotate(${deg} 32 32)`}
          />
        ))}
      </g>

      {/* ── Inner circuit ring with spokes ───────────── */}
      <circle cx="32" cy="32" r="17" fill="none" stroke={ACCENT_DIM} strokeWidth="1" strokeOpacity="0.4" />

      {/* 4 circuit spokes — short dashes pointing inward */}
      {[0, 90, 180, 270].map((deg) => (
        <line
          key={`sp-${deg}`}
          x1="32" y1="15" x2="32" y2="19.5"
          stroke={ACCENT}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.5"
          transform={`rotate(${deg} 32 32)`}
        />
      ))}

      {/* Small circuit dots at spoke ends */}
      {[0, 90, 180, 270].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const cx = 32 + 17 * Math.sin(rad);
        const cy = 32 - 17 * Math.cos(rad);
        return <circle key={`d-${deg}`} cx={cx} cy={cy} r="1.2" fill={ACCENT} fillOpacity="0.5" />;
      })}

      {/* ── Central AI core (pulsing glow) ───────────── */}
      <circle
        className={`${NS}-glow`}
        cx="32" cy="32" r="9"
        fill={ACCENT_FAINT}
        filter={glow ? `url(#${NS}-glow-f)` : undefined}
      />
      <circle
        className={`${NS}-pulse`}
        cx="32" cy="32" r="5"
        fill={ACCENT}
      />
      {/* Bright highlight dot */}
      <circle cx="30.5" cy="30.5" r="1.5" fill="white" fillOpacity="0.6" />

      {/* ── Orbiting signal spark ────────────────────── */}
      <g className={`${NS}-orbit`}>
        <circle cx="32" cy="11" r="1.8" fill={ACCENT} fillOpacity="0.8" />
        <circle cx="32" cy="11" r="1.8" fill={ACCENT_GLOW} filter={glow ? `url(#${NS}-glow-f)` : undefined} />
      </g>
    </svg>
  );
}

const AdminAIAgentIcon = memo(AdminAIAgentIconInner);
AdminAIAgentIcon.displayName = 'AdminAIAgentIcon';

export { AdminAIAgentIcon };
export type { AdminAIAgentIconProps };
