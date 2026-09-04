"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ReferenceTable } from "./reference-table";
import { ToolTabs } from "./tabs";
import {
  accentWash,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  asciiUnicodeRows,
  asciiUnicodeSections,
  inspectText,
  INSPECT_LIMIT,
  lookupCodePoint,
  textSummary,
  type CharInfo,
} from "../lib/ascii-unicode";

/*
 * The sample is not decoration. Every one of the four defects the tool exists
 * to find is in it — a non-breaking space, a zero-width space, a BOM and a
 * pair of smart quotes — plus a family emoji, so the code-point count and the
 * grapheme count disagree the moment the button is pressed. A visitor who
 * presses it once has seen what the tool is for without reading anything.
 */
const SAMPLE_TEXT =
  "Şəhərin adı — «Bakı».\u00A0Əvvəlki boşluq adi boşluq deyil.\n" +
  "Burada\u200Bsıfır enli boşluq gizlənib.\n" +
  "\uFEFFBOM, \u201cağıllı dırnaq\u201d və 👨\u200d👩\u200d👦 emojisi.";

const LOOKUP_PLACEHOLDER = "U+0259 · 0259 · 601 · &#601; · ə";

function CharCell({ info }: { info: CharInfo }) {
  return (
    <span
      className={info.invisible ? "text-base text-muted" : "text-base"}
      /* The character itself, not a description of it — a screen reader
         announcing a bare "·" would say nothing useful, so the name carries
         the meaning and the glyph is decorative. */
      aria-hidden={info.invisible}
    >
      {info.display}
    </span>
  );
}

function CharTable({ rows }: { rows: CharInfo[] }) {
  return (
    /* Seven columns do not fit a phone and must not be allowed to wrap into an
       unreadable stack, so the table keeps its width and the box scrolls. */
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left font-mono text-xs">
        <thead>
          <tr className="border-b border-result-rule text-muted">
            <th scope="col" className="px-2 py-2 font-normal">
              simvol
            </th>
            <th scope="col" className="px-2 py-2 font-normal">
              kod
            </th>
            <th scope="col" className="px-2 py-2 font-normal">
              onluq
            </th>
            <th scope="col" className="px-2 py-2 font-normal">
              UTF-8
            </th>
            <th scope="col" className="px-2 py-2 font-normal">
              UTF-16
            </th>
            <th scope="col" className="px-2 py-2 font-normal">
              HTML
            </th>
            <th scope="col" className="px-2 py-2 font-normal">
              ad
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-result-rule">
          {rows.map((info, index) => (
            <tr key={`${info.codePoint}-${index}`}>
              <td
                className={
                  info.warning === undefined
                    ? "px-2 py-1.5"
                    : "border-l-2 border-l-accent px-2 py-1.5"
                }
              >
                <CharCell info={info} />
              </td>
              <td className="px-2 py-1.5 tabular-nums">{info.hex}</td>
              <td className="px-2 py-1.5 tabular-nums">{info.decimal}</td>
              <td className="px-2 py-1.5 tabular-nums">{info.utf8}</td>
              <td className="px-2 py-1.5 tabular-nums">{info.utf16}</td>
              <td className="px-2 py-1.5">{info.entity}</td>
              <td className="px-2 py-1.5">
                {info.warning === undefined ? (
                  info.name
                ) : (
                  <>
                    <span
                      className="rounded-[2px] px-1 text-ink"
                      style={{ backgroundColor: accentWash }}
                    >
                      {info.name}
                    </span>
                    <span className="mt-1 block text-[11px]/5 text-muted">{info.warning}</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Inspector() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");

  /* The table is rebuilt from scratch on every keystroke; deferring it keeps
     the textarea itself responsive while a long paste is being described. */
  const deferredText = useDeferredValue(text);
  const summary = useMemo(() => textSummary(deferredText), [deferredText]);
  const rows = useMemo(() => inspectText(deferredText), [deferredText]);
  const found = useMemo(() => lookupCodePoint(query), [query]);

  const truncated = summary.codePoints > rows.length;

  return (
    <div className="space-y-4">
      <ToolPanel>
        <ToolPanelHeader
          title="Mətn"
          hint={`${summary.codePoints} kod nöqtəsi`}
          action={
            <>
              <ToolButton size="chip" onClick={() => setText(SAMPLE_TEXT)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setText("")} disabled={text === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="space-y-4 p-4">
          <ToolField
            label="Yoxlanacaq mətn"
            note="Yazdıqların brauzerdən çıxmır — heç bir serverə göndərilmir."
            htmlFor="ascii-unicode-input"
          >
            <ToolTextArea
              id="ascii-unicode-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Simvollarına ayırmaq istədiyin mətni yapışdır…"
              className="min-h-40"
              spellCheck={false}
            />
          </ToolField>

          <div className="grid grid-cols-2 gap-2 @min-[38rem]:grid-cols-3">
            <ToolStat label="Kod nöqtəsi" value={summary.codePoints} />
            <ToolStat
              label="Qrafem"
              value={summary.graphemes}
              note="gözün bir simvol saydığı"
            />
            <ToolStat label="UTF-8 bayt" value={summary.utf8Bytes} />
            <ToolStat label="UTF-16 vahid" value={summary.utf16Units} />
            <ToolStat label="ASCII-dən kənar" value={summary.nonAscii} />
            <ToolStat
              label="Görünməyən"
              value={summary.invisible}
              tone={summary.invisible > 0 ? "warning" : "default"}
              note={summary.invisible > 0 ? "aşağıda işarələnib" : undefined}
            />
          </div>

          {summary.codePoints !== summary.graphemes && (
            <ToolNote tone="accent" title="Kod nöqtəsi ilə qrafem fərqlənir">
              Mətndə emoji və ya birləşən işarə var: ekranda bir simvol görünən şey bir neçə kod
              nöqtəsindən qurulub. Simvol həddi qoyan formalar adətən kod nöqtəsi sayır.
            </ToolNote>
          )}
        </div>
      </ToolPanel>

      {rows.length > 0 && (
        <ToolResultPanel title="Simvollar" hint={`${rows.length} sətir`}>
          {truncated && (
            <p className="border-b border-result-rule px-3 py-2 font-ui text-[11px]/5 text-muted">
              Mətn uzundur: yalnız ilk {INSPECT_LIMIT} kod nöqtəsi cədvələ salınıb. Yuxarıdakı
              rəqəmlər bütöv mətnə aiddir.
            </p>
          )}
          <CharTable rows={rows} />
        </ToolResultPanel>
      )}

      <ToolPanel>
        <ToolPanelHeader title="Kodla simvol tap" />
        <div className="space-y-3 p-4">
          <ToolField
            label="Kod nöqtəsi və ya simvol"
            note="Sıfırla başlayan rəqəm onaltılıq, sıfırsız rəqəm onluq sayılır."
            htmlFor="ascii-unicode-lookup"
          >
            <ToolInput
              id="ascii-unicode-lookup"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={LOOKUP_PLACEHOLDER}
              autoComplete="off"
              spellCheck={false}
            />
          </ToolField>

          {query.trim() !== "" &&
            (found === null ? (
              <ToolNote>Bu yazılışa uyğun simvol tapılmadı.</ToolNote>
            ) : (
              <ToolResultPanel title={found.name} hint={found.hex}>
                <CharTable rows={[found]} />
              </ToolResultPanel>
            ))}
        </div>
      </ToolPanel>
    </div>
  );
}

export function AsciiUnicodeTool() {
  return (
    <div className="@container mt-8" data-spec="ascii-unicode-tool">
      <ToolTabs
        idPrefix="ascii-unicode"
        items={[
          { id: "mufettis", label: "Müfəttiş", content: <Inspector /> },
          {
            id: "arayis",
            label: "Arayış",
            hint: String(asciiUnicodeRows.length),
            content: (
              <ReferenceTable
                rows={asciiUnicodeRows}
                sections={asciiUnicodeSections}
                placeholder="simvol, ad, kod nöqtəsi və ya onluq dəyər"
                footnote="Kod nöqtələri və baytlar cədvəldə əl ilə yazılmır — hər sətir simvolun özündən hesablanır. Adlar Unicode kateqoriyalarına əsaslanır və azərbaycanca verilib."
              />
            ),
          },
        ]}
      />
    </div>
  );
}
