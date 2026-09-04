import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

/*
 * The parts every tool is built from.
 *
 * Server-safe on purpose: a tool page keeps its heading, its explanation and
 * its FAQ on the server, and only the interactive widget crosses into the
 * browser. Nothing here holds state, so nothing here needs to.
 *
 * No component below writes a colour, a radius or a shadow of its own. The
 * surfaces take the site's tokens and the controls take the `--btn-*` /
 * `--field-*` tokens, which is what makes a field on a tool page the same
 * object as a field anywhere else on the site. A hand-rolled bordered
 * rectangle is the failure mode this exists to prevent: `docs/IOS-DESIGN.md`
 * lists the controls the system actually has, and everything here is one of
 * them.
 *
 * Interface text is never monospace. `font-mono` survives in exactly two
 * places below — `ToolTextArea` and `ToolOutput` — because both hold code.
 */

/**
 * Border and radius handed to a field. Fields read `--field-radius`, not
 * `--btn-radius`: a button is a capsule (980px) and a capsule on a 636x192
 * textarea is an ellipse that clips the first three characters of the first
 * line.
 */
const fieldShape: CSSProperties = {
  borderColor: "var(--field-border, var(--btn-border))",
  borderRadius: "var(--field-radius, var(--btn-radius))",
};

/*
 * 44px high — the iOS minimum touch target, and the height the system's own
 * text fields are. Filled with `surface` rather than `paper` so the field has
 * an edge even where `--btn-border` resolves to transparent: the fill is the
 * edge, exactly as it is on the phone. Body size, not a small size: what a
 * visitor types is reading text.
 */
const fieldClass =
  "h-11 w-full border bg-surface px-3 text-ios-body text-ink " +
  "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-ios)] " +
  "motion-reduce:transition-none hover:bg-hover disabled:opacity-60";

function merge(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(" ");
}

/*
 * A highlight whose two sides are both stated. `bg-accent/25` was tried first
 * and failed: an alpha tint resolves against whatever its parent happens to
 * be, so the same class landed on a different pair on every surface. Mixing
 * the accent into a named ground pins both sides instead.
 *
 * That ground is `--color-result`, not `--color-surface`: both places this is
 * used — a warning stat and a regex match — sit on the result surface, and a
 * wash mixed from a ground it is not drawn on nearly disappears against the
 * one it is.
 */
export const accentWash =
  "color-mix(in srgb, var(--color-accent) 25%, var(--color-result))";

/* ---------- buttons ---------- */

/*
 * The one button in the tool layer. Nine widgets had each hand-rolled
 * `border border-rule` with its own padding and text size; the class itself is
 * load-bearing, because `globals.css` keys the whole `--btn-*` chrome to
 * `button.border-rule` — that is what makes this a capsule with the system's
 * fill, its hover face and its press-scale.
 *
 * Neither radius nor hover face is written here on purpose: that rule sets
 * both on the same selector and outranks a utility class, so a `rounded` or a
 * `hover:bg-hover` in this file would be a line that never applies. A button
 * that wants a different face therefore hands the rule different tokens
 * rather than trying to paint over it — see `selectedTint`.
 */
const buttonSize = {
  default: "px-3.5 py-1.5 text-ios-subhead font-medium",
  /* The compact one: a header strip, a field suffix, a row of presets. */
  chip: "px-3 py-1 text-ios-footnote font-medium",
} as const;

/*
 * The chosen member of a set, as a tinted capsule — the iOS filter pill. The
 * tint is handed to the chrome rule as `--btn-face` instead of being set as a
 * background here, because that rule outranks any utility; overriding the
 * token keeps the hover face, the radius and the press-scale intact.
 */
const selectedTint = {
  "--btn-face": "color-mix(in srgb, var(--color-accent) 15%, transparent)",
  "--btn-hover-face": "color-mix(in srgb, var(--color-accent) 24%, transparent)",
} as CSSProperties;

export function ToolButton({
  size = "default",
  selected,
  className,
  style,
  children,
  ...props
}: ComponentPropsWithoutRef<"button"> & {
  size?: keyof typeof buttonSize;
  /*
   * Omitted for a plain action; a boolean makes this button one of a set, and
   * an unchosen member of a set steps back to `muted`.
   */
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={merge(
        "relative border border-rule font-ui disabled:opacity-50",
        buttonSize[size],
        selected === undefined
          ? "text-ink"
          : selected
            ? "font-semibold text-accent-text"
            : "text-muted",
        className,
      )}
      style={selected === true ? { ...selectedTint, ...style } : style}
    >
      {children}
    </button>
  );
}

/* ---------- surfaces ---------- */

/** A card: 14px corner, hairline edge, one step of elevation. */
export function ToolPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={merge("rounded-lg border border-rule bg-surface shadow-elev-1", className)}>
      {children}
    </section>
  );
}

/**
 * The strip across the top of a panel: what this panel is on the left, a count
 * or a unit after it, and its controls on the right.
 *
 * `min-h-10` rather than `h-10`, and the row wraps. A fixed height with three
 * unwrappable slots is what pushed the uuid tool off this primitive and into
 * bespoke markup — its header carries a segmented control, a number field,
 * three checkboxes and a button, which is a row, not a slot. `action` is
 * therefore laid out as a row itself, so a caller can hand it several controls
 * and let them fall onto a second line when the panel is narrow.
 */
export function ToolPanelHeader({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-3 py-2">
      {/* `flex-auto`, not `flex-1`: a zero flex-basis would let the title
          shrink away to keep the controls on the same line, when the wanted
          behaviour is the opposite — the title holds its line and the controls
          wrap under it. */}
      {/* h2, not h3: the tool title is the page's h1 and a panel is a direct
          section of it, so h3 skipped a level — axe reports it as a
          heading-order defect on every tool page that has a panel. */}
      <h2 className="min-w-0 flex-auto truncate text-ios-headline">{title}</h2>
      {hint !== undefined && (
        <span className="text-ios-footnote text-muted tabular-nums">{hint}</span>
      )}
      {action !== undefined && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{action}</div>
      )}
    </header>
  );
}

/**
 * The counterpart to `ToolPanel` for what the tool computed, as opposed to
 * what the visitor typed. Three things separate the two and only one of them
 * is colour — the ground (`--result`), an accent edge along the top of the
 * header, and the header word itself — so a greyscale printout and a reader
 * with no colour vision both keep two.
 *
 * The accent is spent on that edge and not on the title, and that is a
 * measurement rather than a preference: the accent as small ink measures
 * 3.9:1, under the 4.5 AA asks for, so a coloured heading would have been a
 * defect in the very thing this exists to help. `ToolStat` draws its ladder
 * for the same reason.
 *
 * `title` is required — an unnamed result panel is back to being told apart by
 * colour alone. `hint` and `action` behave exactly as on `ToolPanelHeader`,
 * which draws the row.
 */
export function ToolResultPanel({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      /* The hook every style rule and the contrast probe use. An attribute
         rather than a class, so it says what the surface IS and survives a
         change of utilities. */
      data-surface="result"
      className={merge(
        "rounded-lg border border-t-2 border-result-rule border-t-accent",
        "bg-result shadow-elev-1",
        className,
      )}
    >
      <ToolPanelHeader title={title} hint={hint} action={action} />
      {children}
    </section>
  );
}

/**
 * A read-only surface for whatever the tool produced: monospace, wrapped,
 * selectable — and on the result ground, not on `paper`. This is one of the
 * two places `font-mono` is still correct: what lands here is JSON, base64, a
 * JWT, a hash or a block of generated source, and its glyphs have to line up.
 */
export function ToolOutput({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-surface="result"
      className={merge(
        "overflow-x-auto rounded border border-result-rule bg-result p-3",
        "font-mono text-sm break-words whitespace-pre-wrap",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------- labels and fields ---------- */

/**
 * The caption over a group of controls — the iOS group header. Deliberately
 * not `uppercase` and no letter-spacing: CSS upper-casing turns the
 * Azerbaijani "i" into "I" instead of "İ", and tracking out a 11px line was
 * the old way of faking small caps. Size and colour carry it instead.
 */
export function ToolLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={merge("text-ios-footnote text-muted", className)}>{children}</p>;
}

export function ToolField({
  label,
  hint,
  note,
  htmlFor,
  suffix,
  className,
  children,
}: {
  label: ReactNode;
  /**
   * Shares the label's line and does not wrap, so it holds a unit, a count or
   * a range. A sentence belongs in `note`.
   */
  hint?: ReactNode;
  /**
   * A sentence-length hint, placed under the control where it has the whole
   * row. `hint` sits beside the label and is `shrink-0`, so a sentence there
   * pushes the label out of its own row; miqyas and faktura had both worked
   * around that by hand-rolling this paragraph at the call site.
   */
  note?: ReactNode;
  htmlFor?: string;
  /** Sits after the control on the same line: "gün", "%", "MB". */
  suffix?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={merge("min-w-0", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between gap-2 text-ios-footnote text-muted"
      >
        <span className="min-w-0">{label}</span>
        {hint !== undefined && <span className="shrink-0 text-right">{hint}</span>}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {suffix !== undefined && (
          <span className="shrink-0 text-ios-footnote text-muted">{suffix}</span>
        )}
      </div>
      {note !== undefined && <p className="mt-1.5 text-ios-footnote text-muted">{note}</p>}
    </div>
  );
}

export function ToolInput({
  className,
  style,
  ...props
}: ComponentPropsWithoutRef<"input">) {
  return (
    <input
      {...props}
      className={merge(fieldClass, className)}
      style={{ ...fieldShape, ...style }}
    />
  );
}

export function ToolSelect({
  className,
  style,
  children,
  ...props
}: ComponentPropsWithoutRef<"select">) {
  /* The native chevron is left alone: it is drawn by the operating system the
     visitor is actually on, and a menu is one of the few places where the
     platform's own control beats a redrawn one. */
  return (
    <select
      {...props}
      className={merge(fieldClass, className)}
      style={{ ...fieldShape, ...style }}
    >
      {children}
    </select>
  );
}

/**
 * The other place `font-mono` stays: a multi-line field holds source, a list
 * of URLs, a diff or a block of JSON, and every one of those is read by its
 * alignment.
 */
export function ToolTextArea({
  className,
  style,
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  return (
    <textarea
      {...props}
      className={merge(
        "min-h-24 w-full resize-y border bg-surface px-3 py-2.5",
        "font-mono text-sm/6 text-ink hover:bg-hover",
        "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-ios)]",
        "motion-reduce:transition-none",
        className,
      )}
      style={{ ...fieldShape, ...style }}
    />
  );
}

/* ---------- readouts ---------- */

/**
 * One measured number with its name. The interface face with tabular figures,
 * not monospace: a number is not code, and the figures still line up while the
 * value changes under the visitor's hands. A stat is a computed reading, so it
 * carries the result ground itself and stays legible when a tool drops one
 * outside a `ToolResultPanel`.
 *
 * `tone` is emphasis, and it is deliberately not a text colour. The obvious
 * candidate was the accent as ink, and it was measured rather than assumed: on
 * small text it reaches 3.9:1, under the 4.5 AA needs. The ladder is drawn
 * instead — an accent rule down the side for `accent`, and for `warning` the
 * same rule plus `accentWash` behind the number.
 */
export function ToolStat({
  label,
  value,
  note,
  tone = "default",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: "default" | "accent" | "warning";
  className?: string;
}) {
  return (
    <div
      data-surface="result"
      className={merge(
        "min-w-0 rounded border border-result-rule bg-result p-3",
        /* The accent rail replaces the left edge rather than adding to it, so
           an emphasised stat is a thicker line in the same place — visible in
           greyscale, unlike a colour swap. */
        tone !== "default" && "border-l-2 border-l-accent",
        className,
      )}
    >
      <p className="text-ios-footnote text-muted">{label}</p>
      <p
        className={merge(
          "mt-1 text-ios-title3 tabular-nums",
          /* Negative margin against the padding, so the wash reads as a
             highlight around the figures and does not move them. */
          tone === "warning" && "-mx-1.5 inline-block rounded-sm px-1.5 text-ink",
        )}
        style={tone === "warning" ? { backgroundColor: accentWash } : undefined}
      >
        {value}
      </p>
      {note !== undefined && <p className="mt-1 text-ios-footnote text-muted">{note}</p>}
    </div>
  );
}

/**
 * An aside the visitor should read before trusting a number. `accent` is the
 * loud one; there is no red here, because the palette has no red in it and a
 * tool inventing one would be the only thing on the page that did.
 */
export function ToolNote({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "accent";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={merge(
        "rounded border border-l-2 border-rule bg-surface px-3 py-2.5",
        tone === "accent" ? "border-l-accent" : "border-l-rule",
        className,
      )}
    >
      {title !== undefined && (
        <p className="text-ios-footnote font-semibold text-muted">{title}</p>
      )}
      <div className={merge("text-ios-subhead", title !== undefined && "mt-1")}>{children}</div>
    </div>
  );
}

/* ---------- accordion ---------- */

/**
 * The disclosure chevron, drawn rather than typed. A `›` is a punctuation
 * glyph: its weight, its size and its position on the baseline are whatever
 * the loaded face decided, and it sat visibly off-centre. This is the system's
 * own `chevron.right` — 13px, 2px stroke, round joins — and `.ios-chevron`
 * rotates it when the `<details>` around it opens.
 */
function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 13 13"
      width="13"
      height="13"
      fill="none"
      className="ios-chevron"
    >
      <path
        d="m4.75 2.5 4 4-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * An inset grouped list: one rounded surface, rows inside it, hairlines inset
 * to where the row's text begins and never drawn under the last one. All of
 * that is `.ios-list` and `.ios-row` in `globals.css`, so nothing is drawn
 * here.
 */
export function ToolAccordion({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={merge("ios-list", className)}>{children}</div>;
}

/**
 * A native `<details>` as one cell of that list. Passing the same `group` to
 * several items makes the browser close the previous answer when a new one
 * opens — an exclusive accordion with no JavaScript and no state to get out of
 * step.
 */
export function ToolAccordionItem({
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
    <details name={group} open={defaultOpen}>
      <summary className="ios-row list-none text-ios-body [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        {hint !== undefined && (
          <span className="shrink-0 text-ios-footnote text-muted">{hint}</span>
        )}
        <Chevron />
      </summary>
      <div className="px-4 pb-4 text-ios-subhead text-muted">{children}</div>
    </details>
  );
}
