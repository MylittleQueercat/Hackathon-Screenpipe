export const fmtSeconds = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${String(r).padStart(2, '0')}s`;
};

export const pct = (from: number, to: number) => ((to - from) / from) * 100;

export const signed = (n: number, digits = 0) =>
  `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

export const pad2 = (n: number) => String(n).padStart(2, '0');
