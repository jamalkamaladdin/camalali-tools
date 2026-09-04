"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented } from "./tabs";
import {
  accentWash,
  ToolButton,
  ToolField,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { formatNumber } from "../shared/format";
import {
  diffLines,
  MAX_LINES,
  splitLines,
  summaryText,
  toSideBySide,
  toUnifiedText,
  type DiffLine,
  type SideCell,
} from "../lib/ferq";

type View = "yan" | "vahid";

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "yan", label: "Yan-yana" },
  { value: "vahid", label: "Vahid" },
];

/*
 * How many rows are drawn, not how many are compared.
 *
 * The comparison itself is capped at MAX_LINES in the library. Drawing is a
 * separate cost: a table of four thousand rows lays out slowly on a phone even
 * though the diff behind it was computed in milliseconds. The rest is not
 * hidden — the count under the table says how many rows were left out, and the
 * copy button still copies the whole thing.
 */
const RENDER_LIMIT = 1000;

const SAMPLE_LEFT = `server {
  listen 80;
  server_name camalali.com;
  root /var/www/sayt;
}`;

const SAMPLE_RIGHT = `server {
  listen 443 ssl;
  server_name camalali.com www.camalali.com;
  root /var/www/sayt;
  gzip on;
}`;

const ENDING_LABELS: Record<string, string> = {
  lf: "LF (Linux, macOS)",
  crlf: "CRLF (Windows)",
  mixed: "qarışıq",
  none: "sətir sonu yoxdur",
};

export function FerqTool() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [view, setView] = useState<View>("yan");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);

  const result = useMemo(
    () => diffLines(left, right, { ignoreWhitespace, ignoreCase }),
    [left, right, ignoreWhitespace, ignoreCase],
  );

  const rows = useMemo(
    () => (result.ok && view === "yan" ? toSideBySide(result.lines) : []),
    [result, view],
  );

  const empty = left === "" && right === "";

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Mətnlər"
          action={
            <>
              <label className="flex items-center gap-1.5 font-ui text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={ignoreWhitespace}
                  onChange={(event) => setIgnoreWhitespace(event.target.checked)}
                  className="size-3.5 accent-[var(--color-accent)]"
                />
                Boşluğa məhəl qoyma
              </label>
              <label className="flex items-center gap-1.5 font-ui text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={ignoreCase}
                  onChange={(event) => setIgnoreCase(event.target.checked)}
                  className="size-3.5 accent-[var(--color-accent)]"
                />
                Hərf böyüklüyünə məhəl qoyma
              </label>
              <ToolButton
                size="chip"
                onClick={() => {
                  setLeft(SAMPLE_LEFT);
                  setRight(SAMPLE_RIGHT);
                }}
              >
                Nümunə
              </ToolButton>
              <ToolButton
                size="chip"
                onClick={() => {
                  // Swapping is how you check which direction a change went in:
                  // "3 added" one way is "3 removed" the other.
                  setLeft(right);
                  setRight(left);
                }}
                disabled={empty}
              >
                Yerini dəyiş
              </ToolButton>
              <ToolButton
                size="chip"
                onClick={() => {
                  setLeft("");
                  setRight("");
                }}
                disabled={empty}
              >
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-2">
          <ToolField
            label="Köhnə mətn"
            htmlFor="ferq-left"
            hint={
              <span className="tabular-nums">{formatNumber(splitLines(left).length)} sətir</span>
            }
          >
            <ToolTextArea
              id="ferq-left"
              value={left}
              onChange={(event) => setLeft(event.target.value)}
              placeholder="Birinci mətni yapışdır…"
              spellCheck={false}
              className="min-h-56!"
            />
          </ToolField>

          <ToolField
            label="Yeni mətn"
            htmlFor="ferq-right"
            hint={
              <span className="tabular-nums">{formatNumber(splitLines(right).length)} sətir</span>
            }
          >
            <ToolTextArea
              id="ferq-right"
              value={right}
              onChange={(event) => setRight(event.target.value)}
              placeholder="İkinci mətni yapışdır…"
              spellCheck={false}
              className="min-h-56!"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok ? (
        <ToolNote tone="accent" title="Müqayisə aparılmadı">
          {result.error}
        </ToolNote>
      ) : (
        <ToolResultPanel
          title="Fərq"
          hint={
            <span className="tabular-nums">
              +{result.summary.added} / −{result.summary.removed}
            </span>
          }
          action={
            <>
              <ToolSegmented
                label="Görünüş"
                options={VIEW_OPTIONS}
                value={view}
                onChange={setView}
              />
              <CopyButton
                value={toUnifiedText(result.lines)}
                label="fərqi kopyala"
                disabled={result.lines.length === 0}
              />
            </>
          }
        >
          <div className="space-y-4 p-3">
            <div className="grid grid-cols-3 gap-3">
              <ToolStat
                label="Əlavə"
                value={formatNumber(result.summary.added)}
                tone={result.summary.added > 0 ? "warning" : "default"}
              />
              <ToolStat
                label="Silinmə"
                value={formatNumber(result.summary.removed)}
                tone={result.summary.removed > 0 ? "accent" : "default"}
              />
              <ToolStat
                label="Dəyişməyib"
                value={formatNumber(result.summary.unchanged)}
              />
            </div>

            <p className="font-ui text-xs/6 text-muted">{summaryText(result.summary)}</p>

            {result.summary.endingDiffers && (
              <ToolNote title="Sətir sonu fərqlidir">
                Köhnə mətn {ENDING_LABELS[result.summary.leftEnding]}, yeni mətn{" "}
                {ENDING_LABELS[result.summary.rightEnding]} işlədir. Bu fərq sətir-sətir
                müqayisəyə daxil edilmir: əks halda bütün sətirlər dəyişmiş görünərdi.
              </ToolNote>
            )}

            {empty ? (
              <p className="font-ui text-sm text-muted">
                Yuxarıdakı iki sahəyə mətn yapışdır: fərq burada görünəcək. Hər tərəf üçün
                hədd <span className="tabular-nums">{formatNumber(MAX_LINES)}</span> sətirdir.
              </p>
            ) : view === "yan" ? (
              <SideBySideView rows={rows} />
            ) : (
              <UnifiedView lines={result.lines} />
            )}
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}

/**
 * The shared look of a changed line. Neither is a colour name: the site's
 * palette has no red and no green, and a diff that needs them is a diff a
 * colour-blind reader cannot use. Additions carry the accent wash, removals
 * carry the accent rail down their left edge — the same two marks `ToolStat`
 * already uses for its two emphasised tones — and both keep their sign glyph,
 * which survives greyscale and a screen reader alike.
 */
const ADD_STYLE = { backgroundColor: accentWash };
const REMOVE_CLASS = "border-l-2 border-l-accent";

function OmittedNote({ shown, total }: { shown: number; total: number }) {
  if (shown >= total) return null;
  return (
    <p className="mt-2 font-ui text-[11px] text-muted">
      İlk <span className="tabular-nums">{formatNumber(shown)}</span> sətir göstərilir,{" "}
      <span className="tabular-nums">{formatNumber(total - shown)}</span> sətir çölə qalıb:
      «fərqi kopyala» hamısını götürür.
    </p>
  );
}

function UnifiedView({ lines }: { lines: DiffLine[] }) {
  const shown = lines.slice(0, RENDER_LIMIT);

  return (
    <div>
      <div className="overflow-x-auto rounded border border-result-rule">
        <table className="w-full border-collapse font-mono text-xs">
          <caption className="sr-only">Vahid görünüşdə sətir-sətir fərq</caption>
          <tbody>
            {shown.map((line, index) => (
              <tr
                key={`${line.kind}-${index}`}
                className={line.kind === "remove" ? REMOVE_CLASS : undefined}
                style={line.kind === "add" ? ADD_STYLE : undefined}
              >
                <td className="w-10 px-2 py-0.5 text-right tabular-nums text-muted select-none">
                  {line.left ?? ""}
                </td>
                <td className="w-10 px-2 py-0.5 text-right tabular-nums text-muted select-none">
                  {line.right ?? ""}
                </td>
                <td className="w-5 px-1 py-0.5 text-center select-none" aria-hidden>
                  {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : ""}
                </td>
                <td className="px-2 py-0.5 break-words whitespace-pre-wrap">
                  {/* An added or removed empty line is still a change, and an
                      empty cell would make it invisible in the table. */}
                  {line.text === "" ? " " : line.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <OmittedNote shown={shown.length} total={lines.length} />
    </div>
  );
}

function DiffCell({ cell, side }: { cell: SideCell | null; side: "old" | "new" }) {
  if (cell === null) {
    // An empty half of a row: the other side added or removed a line that this
    // side has no counterpart for.
    return (
      <>
        <td className="w-10 px-2 py-0.5 select-none" />
        <td className="px-2 py-0.5" />
      </>
    );
  }

  return (
    <>
      <td className="w-10 px-2 py-0.5 text-right tabular-nums text-muted select-none">
        {cell.number}
      </td>
      <td
        className={`px-2 py-0.5 break-words whitespace-pre-wrap ${cell.changed ? "border-l-2 border-l-accent" : ""}`}
        style={cell.changed && side === "new" ? ADD_STYLE : undefined}
      >
        {cell.text === "" ? " " : cell.text}
      </td>
    </>
  );
}

function SideBySideView({ rows }: { rows: { left: SideCell | null; right: SideCell | null }[] }) {
  const shown = rows.slice(0, RENDER_LIMIT);

  return (
    <div>
      <div className="overflow-x-auto rounded border border-result-rule">
        <table className="w-full table-fixed border-collapse font-mono text-xs">
          <caption className="sr-only">Yan-yana görünüşdə sətir-sətir fərq</caption>
          <thead>
            <tr className="border-b border-result-rule text-left text-muted">
              <th scope="col" colSpan={2} className="w-1/2 p-2 font-normal">
                Köhnə
              </th>
              <th scope="col" colSpan={2} className="w-1/2 p-2 font-normal">
                Yeni
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={index} className="align-top">
                <DiffCell cell={row.left} side="old" />
                <DiffCell cell={row.right} side="new" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <OmittedNote shown={shown.length} total={rows.length} />
    </div>
  );
}
