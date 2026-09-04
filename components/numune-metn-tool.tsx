"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  clampCount,
  COUNT_LIMITS,
  generateSampleText,
  type SampleOptions,
  type SampleUnit,
} from "../lib/numune-metn";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";
import { ToolSegmented } from "./tabs";
import { formatNumber } from "../shared/format";

const UNIT_OPTIONS: { value: SampleUnit; label: string }[] = [
  { value: "paragraph", label: "Abzas" },
  { value: "sentence", label: "Cümlə" },
  { value: "word", label: "Söz" },
  { value: "list", label: "Siyahı" },
];

const PENDING = "Mətn brauzerdə yaradılır…";

/* The same "has the browser taken over yet" question as the uuid tool asks,
   answered the same way: `generateSampleText` calls `Math.random`, so a
   prerendered batch would disagree with the client's own first batch and
   React would report a hydration mismatch on every load of this page. */
const subscribeToNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function NumuneMetnTool() {
  const [unit, setUnit] = useState<SampleUnit>("paragraph");
  const [count, setCount] = useState(3);
  const [withHeading, setWithHeading] = useState(true);
  const [html, setHtml] = useState(false);
  // Bumped only by the explicit regenerate button, the same reasoning as
  // the uuid tool's seed: a fresh batch replacing itself under the
  // visitor's cursor while they are reading it is worse than a batch that
  // waits to be asked for.
  const [seed, setSeed] = useState(0);

  const onBrowser = useSyncExternalStore(subscribeToNothing, onClient, onServer);

  const options: SampleOptions = { unit, count, withHeading, html };

  const result = useMemo(
    () => (onBrowser ? generateSampleText(options) : null),
    // `options` is rebuilt every render; its four fields plus `seed` are the
    // real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onBrowser, unit, count, withHeading, html, seed],
  );

  const limits = COUNT_LIMITS[unit];

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Nümunə mətn"
          action={
            <>
              <ToolSegmented
                label="Vahid"
                options={UNIT_OPTIONS}
                value={unit}
                onChange={(next) => {
                  setUnit(next);
                  setCount((current) => clampCount(next, current));
                }}
              />
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Say
                <ToolInput
                  type="number"
                  min={limits.min}
                  max={limits.max}
                  value={count}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    setCount(clampCount(unit, next));
                  }}
                  className="h-8 w-20 px-2 text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                <input
                  type="checkbox"
                  checked={withHeading}
                  onChange={(event) => setWithHeading(event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Başlıq
              </label>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                <input
                  type="checkbox"
                  checked={html}
                  onChange={(event) => setHtml(event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                HTML teqləri
              </label>
              <ToolButton size="chip" onClick={() => setSeed((s) => s + 1)}>
                Yenidən yarat
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <ToolNote>
            Azərbaycan sözünün uzunluğu və şəkilçiləri latın lorem ipsum-dan
            fərqlidir: maket üçün ölçü buradan daha doğru çıxır.
          </ToolNote>

          <ToolResultPanel
            title="Mətn"
            hint={
              result ? (
                <span className="tabular-nums">{formatNumber(result.wordCount)} söz</span>
              ) : undefined
            }
            action={<CopyButton value={result?.text ?? ""} label="mətni kopyala" />}
            className="min-w-0"
          >
            <ToolOutput className="m-3 max-h-96 overflow-y-auto">
              {result === null ? <span className="text-muted">{PENDING}</span> : result.text}
            </ToolOutput>
          </ToolResultPanel>
        </div>
      </ToolPanel>
    </div>
  );
}
