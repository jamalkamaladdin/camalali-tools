import type { ComponentProps, ReactNode } from "react";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-(--container-page) px-5 ${className}`}>
      {children}
    </div>
  );
}

// Measured: 4px radius, 48px tall, no shadow in either state, and a 0.3s
// cubic-bezier(.25,1,.5,1) transition. The hover darkens the fill — an earlier
// guess lightened it, which is the opposite of the reference.
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-sm px-6 h-12 text-[15px] font-medium transition-colors duration-300 [transition-timing-function:var(--ease-brand)] disabled:opacity-50 disabled:pointer-events-none";

const buttonVariants = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary:
    "bg-surface text-ink border border-line hover:border-line-strong hover:bg-subtle",
  ghost: "text-ink-muted hover:text-accent hover:bg-accent-soft",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`${buttonBase} ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"a"> & { variant?: ButtonVariant }) {
  return (
    <a
      className={`${buttonBase} ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md border border-line bg-surface ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow && (
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 text-[28px] sm:text-[32px]">{title}</h2>
      {lead && (
        <p className="mt-3 text-[17px] leading-7 text-ink-muted">{lead}</p>
      )}
    </div>
  );
}
