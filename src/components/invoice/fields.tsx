"use client";

import type { ComponentProps, ReactNode } from "react";

// 40px controls on the 3px radius, bordered by --line. They carry no focus ring
// of their own: the global `:focus-visible` outline in globals.css is the single
// focus treatment on the site, so `outline-none` must not be set here.
// min-w-0: a grid item defaults to min-width:auto, so a <select> with a long
// option label refuses to shrink and widens the whole column on narrow screens.
const controlBase =
  "w-full min-w-0 rounded-sm border border-line bg-surface px-2.5 text-[14px] text-ink placeholder:text-ink-faint transition-colors duration-200 [transition-timing-function:var(--ease-brand)] hover:border-line-strong";

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
      <span className="mb-1.5 block text-[12px] font-medium text-ink-muted">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-[12px] leading-[1.5] text-ink-faint">
          {hint}
        </span>
      )}
    </label>
  );
}

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${controlBase} h-10 ${className}`} {...props} />;
}

export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={`${controlBase} py-2.5 leading-6 ${className}`} {...props} />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`${controlBase} h-10 appearance-none bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat pr-8 ${className}`}
      style={{
        // The chevron is drawn in --ink-faint (#6f6b62); the old one carried the
        // blue-grey of the palette this redesign removed.
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M6 8l4 4 4-4' stroke='%236f6b62' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
      }}
      {...props}
    />
  );
}

/** One block of the form, divided by a rule rather than becoming its own card —
 *  five stacked cards read as noise. The invoice form itself is an `Accordion`
 *  now; this stays exported for blocks that are always open. */
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
        {/* font-sans cancels the global serif heading rule: this is a UI label,
            not running text. */}
        <h2 className="font-sans text-[13px] font-medium tracking-normal text-ink">
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
      className={`text-[13px] font-medium text-accent-text transition-colors duration-200 [transition-timing-function:var(--ease-brand)] hover:text-accent-hover ${className}`}
      {...props}
    />
  );
}
