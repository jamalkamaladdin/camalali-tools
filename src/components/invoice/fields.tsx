"use client";

import type { ComponentProps, ReactNode } from "react";

const controlBase =
  "w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-faint outline-none transition-colors duration-150 focus:border-accent focus:ring-4 focus:ring-accent/12";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-faint">{hint}</span>}
    </label>
  );
}

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${controlBase} h-10 ${className}`} {...props} />;
}

export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={`${controlBase} py-2 leading-6 ${className}`} {...props} />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`${controlBase} h-10 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9 ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%238792a2'><path d='M6 8l4 4 4-4' stroke='%238792a2' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
      }}
      {...props}
    />
  );
}
