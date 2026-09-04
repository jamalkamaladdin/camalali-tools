"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  buildAlphabet,
  CHARSETS,
  CHARSET_ORDER,
  crackTimeLabel,
  DEFAULT_REQUEST,
  entropyBits,
  MAX_COUNT,
  MAX_LENGTH,
  MIN_LENGTH,
  rateStrength,
  generatePasswords,
  type CharsetKey,
  type CharsetSelection,
} from "../lib/parol";
import { formatNumber } from "../shared/format";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

/* The four a visitor actually reaches for, in growing order of length. */
const LENGTH_PRESETS = [12, 16, 20, 32];

const PENDING = "Parollar brauzerdə yaradılır…";

/* Nothing to subscribe to: "is this the browser yet" is answered once and
   never changes again. The uuid tool answers the same question the same way. */
const subscribeToNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value)));
}

export function ParolTool() {
  const [length, setLength] = useState(DEFAULT_REQUEST.length);
  const [count, setCount] = useState(DEFAULT_REQUEST.count);
  const [sets, setSets] = useState<CharsetSelection>(DEFAULT_REQUEST.sets);
  const [excludeSimilar, setExcludeSimilar] = useState(DEFAULT_REQUEST.excludeSimilar);
  /* Bumped by the regenerate button only. A batch that replaces itself while
     the visitor is comparing two of its rows is worse than one that waits. */
  const [seed, setSeed] = useState(0);

  /* Random bytes are a browser fact and the server has none, so the static
     HTML and the first hydration render agree on showing nothing. */
  const onBrowser = useSyncExternalStore(subscribeToNothing, onClient, onServer);

  /*
   * The strength figures are pure arithmetic over the settings, so they are
   * computed apart from the batch and survive the server render: the visitor
   * sees what 20 characters is worth before a single password exists.
   */
  const alphabet = useMemo(
    () => buildAlphabet(sets, excludeSimilar),
    [sets, excludeSimilar],
  );
  const bits = entropyBits(alphabet.length, length);
  const strength = rateStrength(bits);

  const batch = useMemo(
    () =>
      onBrowser ? generatePasswords({ length, count, sets, excludeSimilar }) : null,
    // `seed` changes nothing about the request; it is listed so that the
    // regenerate button has something to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onBrowser, length, count, sets, excludeSimilar, seed],
  );

  const allPasswords = batch !== null && batch.ok ? batch.passwords.join("\n") : "";

  const toggle = (key: CharsetKey) => {
    setSets((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Parametrlər"
          action={
            <>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Uzunluq
                <ToolInput
                  type="number"
                  min={MIN_LENGTH}
                  max={MAX_LENGTH}
                  value={length}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    setLength(clamp(next, MIN_LENGTH, MAX_LENGTH));
                  }}
                  className="h-8 w-16 px-2 text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Say
                <ToolInput
                  type="number"
                  min={1}
                  max={MAX_COUNT}
                  value={count}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    setCount(clamp(next, 1, MAX_COUNT));
                  }}
                  className="h-8 w-16 px-2 text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                <input
                  type="checkbox"
                  checked={excludeSimilar}
                  onChange={(event) => setExcludeSimilar(event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Oxşar simvolsuz (<span className="font-mono">0O1lI</span>)
              </label>
              <ToolButton size="chip" onClick={() => setSeed((s) => s + 1)}>
                Yenidən yarat
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div>
              <ToolLabel>Simvol dəstləri</ToolLabel>
              <div className="mt-2 space-y-1.5">
                {CHARSET_ORDER.map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 font-ui text-xs text-muted"
                  >
                    <input
                      type="checkbox"
                      checked={sets[key]}
                      onChange={() => toggle(key)}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                    {CHARSETS[key].label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <ToolLabel>Hazır uzunluqlar</ToolLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LENGTH_PRESETS.map((preset) => (
                  <ToolButton
                    key={preset}
                    size="chip"
                    selected={length === preset}
                    onClick={() => setLength(preset)}
                  >
                    {preset}
                  </ToolButton>
                ))}
              </div>
            </div>
          </div>

          <ToolResultPanel
            title="Parollar"
            hint={<span className="tabular-nums">{alphabet.length} simvollu əlifba</span>}
            action={
              <CopyButton
                value={allPasswords}
                label="hamısını kopyala"
                disabled={allPasswords === ""}
              />
            }
            className="min-w-0"
          >
            <div className="p-3">
              {batch === null ? (
                <p className="font-ui text-sm text-muted">{PENDING}</p>
              ) : !batch.ok ? (
                <ToolNote tone="accent" title="Parol yaradıla bilmir">
                  {batch.error}
                </ToolNote>
              ) : (
                <ul className="space-y-2">
                  {batch.passwords.map((password, index) => (
                    <li key={index} className="flex items-center gap-2">
                      {/* `break-all`: a password is one long word with no break
                          opportunity, so word wrapping alone lets it push the
                          copy button off the row. */}
                      <ToolOutput className="min-w-0 flex-1 break-all">
                        {password}
                      </ToolOutput>
                      <CopyButton value={password} label="Kopyala" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ToolResultPanel>
        </div>
      </ToolPanel>

      <div className="grid gap-3 sm:grid-cols-3">
        <ToolStat
          label="Entropiya"
          value={`${formatNumber(bits, 1)} bit`}
          note={`${alphabet.length} simvoldan ${length} ədəd`}
          tone={bits < 40 ? "warning" : bits >= 80 ? "accent" : "default"}
        />
        <ToolStat label="Qiymət" value={strength.label} note={strength.note} />
        <ToolStat
          label="Seçmə ilə tapılma vaxtı"
          value={crackTimeLabel(bits)}
          note="Saniyədə 10 milyard cəhd edən hücuma görə (sızmış bazadakı ən pis hal)."
        />
      </div>

      <ToolNote title="Parol yadda saxlanmır">
        Simvollar brauzerin kriptoqrafik təsadüf mənbəyindən gəlir və bu səhifə
        heç bir sorğu göndərmir. Səhifəni yeniləyəndə parollar itir — istifadə
        edəcəyin parolu əvvəlcə parol menecerinə köçür.
      </ToolNote>
    </div>
  );
}
