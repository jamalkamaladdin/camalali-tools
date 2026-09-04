"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/*
 * Two controls that only exist because a tool page is long, and both of them
 * are the same object: the system's segmented control. `.ios-segmented` in
 * `globals.css` draws the track and lifts a thumb under whichever child
 * carries `aria-selected` / `aria-checked` = "true", so nothing here paints a
 * selected state. The children are deliberately unstyled.
 *
 * The rule both obey: nothing is unmounted. A tab that is not the open one
 * keeps its panel in the DOM and only carries the `hidden` attribute, so the
 * explanation and the FAQ a search engine reads are the same words a visitor
 * finds behind the tab. Rendering only the active panel would quietly delete
 * most of the page's text from the served HTML.
 */

export type ToolTabItem = {
  /** ASCII: it becomes a DOM id in `aria-controls`. */
  id: string;
  label: string;
  hint?: string;
  content: ReactNode;
};

export function ToolTabs({
  items,
  initialId,
  idPrefix,
  className,
}: {
  items: ToolTabItem[];
  initialId?: string;
  /** Prefix for the generated tab and panel ids — unique per page. */
  idPrefix: string;
  className?: string;
}) {
  const [activeId, setActiveId] = useState(initialId ?? items[0]?.id);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  if (items.length === 0) return null;

  /* Roving tabindex: one stop for the whole strip, arrows walk inside it.
     Moving focus also selects, which is the automatic-activation pattern the
     panels can afford because they are all rendered already. */
  const focusAt = (index: number) => {
    const next = items[(index + items.length) % items.length];
    if (!next) return;
    setActiveId(next.id);
    buttons.current[next.id]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div className={className}>
      {/*
       * A segmented control is one line or it is not a segmented control: six
       * tabs wrapping onto a second row would be two tracks with one thumb
       * between them. So the narrow case scrolls instead. The padding is what
       * the thumb's shadow needs — `overflow-x` forces `overflow-y` to `auto`
       * as well, and without room the lift would be sliced off.
       */}
      <div className="-mx-1 overflow-x-auto px-1 pt-1.5 pb-3">
        <div role="tablist" className="ios-segmented">
          {items.map((item, index) => {
            const selected = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`${idPrefix}-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`${idPrefix}-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                ref={(node) => {
                  buttons.current[item.id] = node;
                }}
                onClick={() => setActiveId(item.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                {item.label}
                {item.hint !== undefined && (
                  <span className="ml-1.5 tabular-nums">{item.hint}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${idPrefix}-panel-${item.id}`}
          aria-labelledby={`${idPrefix}-tab-${item.id}`}
          hidden={item.id !== activeId}
          tabIndex={0}
          className="pt-2"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

export type ToolSegmentedOption<T extends string> = { value: T; label: string };

/**
 * A controlled radiogroup for the two-or-three-way switches a tool is full of:
 * encode/decode, v4/v7, ƏDV üstünə/daxil/yox. The tool owns the value — this
 * only draws it.
 */
export function ToolSegmented<T extends string>({
  options,
  value,
  onChange,
  className,
  label,
  fill = false,
}: {
  options: ToolSegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Named for screen readers when the visible label sits elsewhere. */
  label?: string;
  /**
   * Spreads the segments across the whole row, the way the phone draws one
   * that owns its panel. Off by default: most of these sit in a header strip
   * beside other controls, where a full-width switch would push them out.
   */
  fill?: boolean;
}) {
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (index: number) => {
    const next = options[(index + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    buttons.current[next.value]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(index - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(options.length - 1);
        break;
      default:
        break;
    }
  };

  /*
   * The caller's `className` goes on a wrapper, not on the control itself.
   * `.ios-segmented` sets `display` from outside every Tailwind layer and so
   * outranks a utility — a caller asking for `@min-[52rem]:hidden` would have
   * been ignored, and the switch it meant to hide would have stayed on screen
   * next to the pane it duplicates.
   */
  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label={label}
        className={`ios-segmented${fill ? " ios-segmented-fill" : ""}`}
      >
        {options.map((option, index) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              ref={(node) => {
                buttons.current[option.value] = node;
              }}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
