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

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 h-10 text-[14px] font-medium transition-all duration-150 ease-out disabled:opacity-50 disabled:pointer-events-none";

const buttonVariants = {
  // The lift on hover is the signature move of this visual language.
  primary:
    "bg-accent text-on-accent shadow-soft hover:bg-accent-hover hover:shadow-lift hover:-translate-y-px",
  secondary:
    "bg-surface text-ink border border-line shadow-soft hover:border-line-strong hover:shadow-card hover:-translate-y-px",
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
      className={`rounded-lg border border-line bg-surface shadow-soft ${className}`}
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
