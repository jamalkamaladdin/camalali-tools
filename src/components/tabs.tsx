"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  hint?: string;
  content: ReactNode;
};

/** Shared roving-focus arithmetic for the two keyboard-driven groups below. */
function nextIndex(key: string, current: number, count: number) {
  if (count === 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp")
    return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * The page's long material — explanation, FAQ, related links — folded into one
 * block instead of three stacked full-width bands.
 *
 * Every panel is rendered; the inactive ones only carry the `hidden` attribute.
 * That is deliberate: the prose and the FAQ have to stay in the served HTML for
 * search engines, so unmounting them is not an option.
 */
export function Tabs({
  items,
  initialId,
  className = "",
  idPrefix,
}: {
  items: TabItem[];
  initialId?: string;
  className?: string;
  idPrefix: string;
}) {
  const [activeId, setActiveId] = useState(initialId ?? items[0]?.id ?? "");
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeId),
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = nextIndex(event.key, activeIndex, items.length);
    if (target === null) return;
    // Automatic activation: the panels are mounted anyway, so following the
    // arrow key with the selection costs nothing and matches the APG default.
    event.preventDefault();
    setActiveId(items[target].id);
    triggers.current[target]?.focus();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        className="flex gap-6 overflow-x-auto border-b border-line"
      >
        {items.map((item, index) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(node) => {
                triggers.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${item.id}`}
              aria-controls={`${idPrefix}-panel-${item.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              // The 2px underline sits on the hairline rule (-mb-px), which is
              // why the row needs no pill, chip or background fill.
              className={`-mb-px shrink-0 border-b-2 pt-1 pb-2.5 text-[14px] font-medium transition-colors duration-200 [transition-timing-function:var(--ease-brand)] ${
                selected
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-faint hover:text-ink"
              }`}
            >
              {item.label}
              {item.hint && (
                <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-faint">
                  {item.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${idPrefix}-panel-${item.id}`}
          aria-labelledby={`${idPrefix}-tab-${item.id}`}
          tabIndex={0}
          hidden={item.id !== activeId}
          className="pt-6"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

export type SegmentOption = { value: string; label: string };

/**
 * A tool's mode switch (encode/decode, gross/net). One control instead of two
 * buttons plus two near-identical panels — the duplication those produce is
 * what makes the pages long.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  className = "",
}: {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = nextIndex(event.key, activeIndex, options.length);
    if (target === null) return;
    event.preventDefault();
    onChange(options[target].value);
    buttons.current[target]?.focus();
  }

  return (
    <div
      role="radiogroup"
      onKeyDown={handleKeyDown}
      className={`inline-flex h-[30px] items-center rounded-sm border border-line bg-surface p-px ${className}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`h-full rounded-[2px] px-3 text-[13px] font-medium transition-colors duration-200 [transition-timing-function:var(--ease-brand)] ${
              selected ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
