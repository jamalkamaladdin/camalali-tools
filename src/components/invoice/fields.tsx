"use client";

import type { ComponentProps, ReactNode } from "react";

// min-w-0: a grid item defaults to min-width:auto, so a <select> with a long
// option label refuses to shrink and widens the whole column on narrow screens.
const controlBase =
  "w-full min-w-0 rounded-sm border border-line bg-surface px-2.5 text-[14px] text-ink placeholder:text-ink-faint outline-none transition-colors duration-150 focus:border-accent focus:ring-4 focus:ring-accent/10";

export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-[12px] font-medium text-ink-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-faint">{hint}</span>}
    </label>
  );
}

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${controlBase} h-9 ${className}`} {...props} />;
}

export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={`${controlBase} py-2 leading-6 ${className}`} {...props} />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`${controlBase} h-9 appearance-none bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat pr-8 ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M6 8l4 4 4-4' stroke='%238792a2' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
      }}
      {...props}
    />
  );
}

/** One block of the form. Sections sit inside a single panel, divided by a rule
 *  rather than each becoming its own card — five stacked cards read as noise. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line px-5 py-5 last:border-b-0">
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TextButton({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={`text-[13px] font-medium text-accent transition-colors hover:text-accent-hover ${className}`}
      {...props}
    />
  );
}
