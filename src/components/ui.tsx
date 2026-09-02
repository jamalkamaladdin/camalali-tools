import type { ComponentProps, ReactNode } from "react";

/* ------------------------------------------------------------------ layout */

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  // `page-gutter` lets globals.css zero out a nested gutter, so a component
  // that carries its own container (PageHead) can also be dropped inside a
  // page-level Container without doubling the side margin.
  return (
    <div
      className={`page-gutter mx-auto max-w-(--container-page) px-5 ${className}`}
    >
      {children}
    </div>
  );
}

/** A surface. Defined by its 1px border — never by a shadow, and never gaining
 *  one on hover; that was the strongest tell of the generated look. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-line bg-surface ${className}`}>
      {children}
    </div>
  );
}

/** 44px title row for a Panel. UI text, so Inter — the serif heading rule from
 *  globals.css is cancelled here on purpose. */
export function PanelHeader({
  title,
  hint,
  action,
  className = "",
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-11 items-center gap-3 border-b border-line px-4 ${className}`}
    >
      <h2 className="min-w-0 truncate font-sans text-[13px] font-medium tracking-normal text-ink">
        {title}
      </h2>
      {hint && (
        <span className="min-w-0 truncate text-[12px] text-ink-faint">
          {hint}
        </span>
      )}
      {action && (
        <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  );
}

/** The mono replacement for uppercase sans eyebrows: a small label followed by
 *  a hairline that runs to the end of the column. Used sparingly. */
export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
        {children}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  );
}

/** The page opener. Sits on the canvas with no tinted band behind it and costs
 *  under 160px of height — the old hero was four times that. Carries its own
 *  gutter, so it works both bare and inside a Container. */
export function PageHead({
  breadcrumb,
  title,
  lead,
  meta,
}: {
  breadcrumb?: ReactNode;
  title: string;
  lead?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="py-8 sm:py-10">
      <Container>
        {breadcrumb && (
          <div className="text-[12px] text-ink-faint">{breadcrumb}</div>
        )}
        <h1
          className={`text-[30px] sm:text-[36px] ${breadcrumb ? "mt-2.5" : ""}`}
        >
          {title}
        </h1>
        {lead && (
          <p className="mt-3 max-w-[62ch] text-[16px] leading-[1.7] text-ink-muted">
            {lead}
          </p>
        )}
        {/* Not uppercased: CSS casing of Azerbaijani i/ı is engine-dependent,
            so the strip prints exactly the letters it was given. */}
        {meta && (
          <div className="mt-4 font-mono text-[12px] text-ink-faint">{meta}</div>
        )}
      </Container>
    </div>
  );
}

/* -------------------------------------------------------------------- text */

/** Running text. Set at a comfortable 68ch measure with descendant styles, so
 *  a page can pass plain markup (or MDX-shaped JSX) without wrapper classes. */
export function Prose({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`max-w-[68ch] text-[16px] leading-[1.75] text-ink-muted [&_a:hover]:text-accent-hover [&_a]:text-accent-text [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded-sm [&_code]:bg-code-soft [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-ink [&_h2]:mt-8 [&_h2]:text-[22px] [&_h2]:text-ink [&_h3]:mt-6 [&_h3]:text-[18px] [&_h3]:text-ink [&_li]:pl-1 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:mt-4 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&>*:first-child]:mt-0 ${className}`}
    >
      {children}
    </div>
  );
}

export function CodeBlock({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <pre
      className={`overflow-x-auto rounded-md bg-code p-4 font-mono text-[13px] leading-[1.6] text-code-ink ${className}`}
    >
      {children}
    </pre>
  );
}

/* ---------------------------------------------------------------- controls */

// Colour transition only — no shadow, no lift, no scale. 200ms is short enough
// that a keyboard user does not see the fill lag behind the focus ring.
const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm font-medium transition-colors duration-200 [transition-timing-function:var(--ease-brand)] disabled:opacity-50 disabled:pointer-events-none";

const buttonVariants = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary:
    "border border-line bg-surface text-ink hover:border-line-strong hover:bg-subtle",
  ghost: "text-ink-muted hover:bg-accent-soft hover:text-accent-text",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

// 44px, not 48: at 48 a button is the tallest thing on the page and the form
// reads as a landing page. 32px for the secondary actions inside a panel.
const buttonSize = "h-11 px-5 text-[15px]";
const smallButtonSize = "h-8 px-3 text-[13px]";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`${buttonBase} ${buttonSize} ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function SmallButton({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`${buttonBase} ${smallButtonSize} ${buttonVariants[variant]} ${className}`}
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
      className={`${buttonBase} ${buttonSize} ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

/* -------------------------------------------------------------- data & notes */

const statTones = {
  default: "text-ink",
  accent: "text-accent-text",
  warning: "text-warning",
} as const;

export type StatTone = keyof typeof statTones;

/** A number a tool produced. Mono + tabular-nums so the digits stop dancing
 *  while the user types in the field that feeds them. */
export function Stat({
  label,
  value,
  note,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: StatTone;
}) {
  return (
    <div>
      <div className="font-mono text-[11px] tracking-[0.08em] text-ink-faint">
        {label}
      </div>
      <div
        className={`mt-1.5 font-mono text-[22px] tabular-nums ${statTones[tone]}`}
      >
        {value}
      </div>
      {note && <div className="mt-1 text-[12px] text-ink-faint">{note}</div>}
    </div>
  );
}

const calloutTones = {
  info: "border-l-accent bg-accent-soft/70",
  success: "border-l-success bg-success/8",
  warning: "border-l-warning bg-warning/8",
  danger: "border-l-danger bg-danger/8",
} as const;

export type CalloutTone = keyof typeof calloutTones;

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-md border border-line border-l-2 p-4 text-[14px] leading-[1.6] text-ink-muted ${calloutTones[tone]}`}
    >
      {title && (
        <p className="mb-1 text-[14px] font-medium text-ink">{title}</p>
      )}
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- accordion */

export function Accordion({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`divide-y divide-line ${className}`}>{children}</div>
  );
}

/** Native <details>, so it opens with zero JavaScript and stays usable in a
 *  server component. `group` maps to the `name` attribute: items sharing one
 *  name close each other, which is the browser's own exclusive accordion. */
export function AccordionItem({
  summary,
  hint,
  defaultOpen,
  group,
  children,
}: {
  summary: ReactNode;
  hint?: ReactNode;
  defaultOpen?: boolean;
  group?: string;
  children: ReactNode;
}) {
  return (
    <details className="group" name={group} open={defaultOpen}>
      <summary className="flex cursor-pointer items-center gap-3 py-3.5 text-[15px] font-medium text-ink">
        <svg
          aria-hidden="true"
          viewBox="0 0 10 10"
          className="size-2.5 shrink-0 fill-ink-faint transition-transform duration-200 [transition-timing-function:var(--ease-brand)] group-open:rotate-90"
        >
          <path d="M2 0l6 5-6 5z" />
        </svg>
        <span className="min-w-0 flex-1">{summary}</span>
        {hint && (
          <span className="shrink-0 text-[13px] font-normal text-ink-faint">
            {hint}
          </span>
        )}
      </summary>
      <div className="pb-5 pl-[22px] text-[15px] leading-[1.7] text-ink-muted">
        {children}
      </div>
    </details>
  );
}
