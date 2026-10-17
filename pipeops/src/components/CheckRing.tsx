import { motion } from 'framer-motion';

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/** One arc segment per evaluation check. */
export function CheckRing({
  passed,
  size = 120,
  stroke = 8,
  gapDeg = 6,
  selected = null,
  onSelect,
  delay = 0,
  showIndex = false,
  dimmed,
}: {
  passed: boolean[];
  size?: number;
  stroke?: number;
  gapDeg?: number;
  selected?: number | null;
  onSelect?: (i: number) => void;
  delay?: number;
  showIndex?: boolean;
  /** per-check: true = outside the active filter */
  dimmed?: boolean[];
}) {
  const n = passed.length;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - stroke - (showIndex ? 26 : 2);
  const seg = (2 * Math.PI) / n;
  const gap = (gapDeg * Math.PI) / 180;
  const start = -Math.PI / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      <defs>
        <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {passed.map((ok, i) => {
        const a0 = start + i * seg + gap / 2;
        const a1 = start + (i + 1) * seg - gap / 2;
        const isSel = selected === i;
        const color = ok ? '#C8FF4D' : '#FF7A52';
        const mid = (a0 + a1) / 2;
        const lr = r + stroke + 16;
        return (
          <g
            key={i}
            onClick={onSelect ? () => onSelect(i) : undefined}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            <path d={arcPath(cx, cy, r, a0, a1)} stroke="#24262C" strokeWidth={stroke} fill="none" strokeLinecap="butt" />
            <motion.path
              d={arcPath(cx, cy, r, a0, a1)}
              stroke={color}
              strokeWidth={isSel ? stroke + 6 : stroke}
              fill="none"
              strokeLinecap="butt"
              filter={isSel ? 'url(#ring-glow)' : undefined}
              initial={{ pathLength: 0, opacity: 1 }}
              animate={{ pathLength: 1, opacity: dimmed?.[i] ? 0.12 : selected === null || isSel ? 1 : 0.45 }}
              transition={{
                pathLength: { delay: delay + i * 0.06, duration: 0.45, ease: 'easeOut' },
                opacity: { duration: 0.2 },
                strokeWidth: { duration: 0.2 },
              }}
            />
            {onSelect && (
              <path d={arcPath(cx, cy, r, a0, a1)} stroke="transparent" strokeWidth={stroke + 28} fill="none" />
            )}
            {showIndex && (
              <text
                x={cx + lr * Math.cos(mid)}
                y={cy + lr * Math.sin(mid)}
                textAnchor="middle"
                dominantBaseline="central"
                className="font-mono"
                fontSize="12"
                fill={isSel ? '#C8FF4D' : '#6B707C'}
              >
                {String(i + 1).padStart(2, '0')}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
