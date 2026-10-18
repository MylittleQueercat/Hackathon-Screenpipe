// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import type { ReactNode } from 'react';

export function Button({ children, onClick, active = false, disabled = false, title }: { children: ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`h-9 rounded-md border px-3 font-sans text-sm ${
        active ? 'border-ink bg-ink text-bone' : 'border-line bg-surface text-ink hover:border-ink hover:bg-ink hover:text-bone'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

export function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-sm px-3 font-sans text-sm ${o.value === value ? 'bg-signal text-white' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Screen({ title, lede, children, actions }: { title: string; lede?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="flex h-full w-full flex-col px-10 pb-7 pt-6">
      <header className="mb-5 flex items-end justify-between gap-6">
        <div>
          <h1 className="font-sans text-[36px] font-medium leading-tight tracking-tight">{title}</h1>
          {lede && <p className="mt-1 max-w-[1100px] font-serif text-[22px] leading-snug text-muted">{lede}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-surface ${className}`}>{children}</div>;
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`font-sans text-sm font-medium text-muted ${className}`}>{children}</div>;
}

export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  // A size in className replaces the default; two font sizes would leave the winner to CSS order.
  const sized = /(^|\s)text-(xs|sm|base|lg|[2-9]?xl|\[\d+px\])(\s|$)/.test(className);
  return <span className={`font-mono ${sized ? '' : 'text-[13px]'} ${className}`}>{children}</span>;
}

/** Pass or fail, by shape and word as well as tone. */
export function Mark({ pass }: { pass: boolean | null | undefined }) {
  if (pass == null) return <span className="font-mono text-[13px] text-faint" title="not scored">–</span>;
  return pass ? (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink font-mono text-[11px] text-bone" title="pass" aria-label="pass">✓</span>
  ) : (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-ink font-mono text-[11px] text-ink" title="fail" aria-label="fail">✕</span>
  );
}
