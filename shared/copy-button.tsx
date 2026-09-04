"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Copy-to-clipboard, shared by every tool. It exists because five widgets had
 * each grown their own two-second-confirm button: same behaviour, five places
 * to fix when the clipboard is refused.
 *
 * A neutral system chip — `.ios-btn .ios-btn-gray` — so it sits quietly next
 * to whatever field it copies. The confirmed state swaps in a checkmark glyph
 * rather than recolouring the button, which is the iOS way of saying "done"
 * without borrowing the accent for a two-second flash.
 */
export function CopyButton({
  value,
  label = "Kopyala",
  doneLabel = "Kopyalandı",
  className = "",
  disabled,
}: {
  value: string;
  label?: string;
  doneLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /* The confirmation resets itself, so an unmount mid-countdown must not fire
     setState on a component that is gone. */
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      /* A refused clipboard is a permission decision, not a bug — say so once
         and leave the button in its resting state. */
      console.warn("clipboard write refused", error);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled || !value}
      aria-live="polite"
      className={`ios-btn ios-btn-gray ${className}`}
    >
      {copied ? (
        <svg aria-hidden viewBox="0 0 14 14" className="size-3.5">
          <path
            d="M2 7.5l3.5 3.5L12 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {copied ? doneLabel : label}
    </button>
  );
}
