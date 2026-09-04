"use client";

import { useMemo, useState } from "react";
import { ToolSegmented } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { analyseDensity, type DensityReport, type Phrase } from "../lib/acar-soz-sixligi";

const SAMPLE_TEXT =
  "Bu alət mətndəki açar sözlərin sıxlığını hesablayır. Açar söz sıxlığı reytinq amili deyil, sadəcə mətnin nədən bəhs etdiyini göstərən bir güzgüdür.\n\nMətnini bura yapışdır və açar sözlərin təkrarını izlə.";

const SAMPLE_HTML =
  '<article>\n  <h1>Açar söz sıxlığı</h1>\n  <p>Bu mətn açar söz sıxlığını izah edir.</p>\n  <script>console.log("bu sətir ölçüyə düşmür");</script>\n</article>';

/** How many rows of a phrase table are drawn — a long paste can produce hundreds of unique phrases, and only the DOM needs the cap since the full set still feeds `longestPhrase` and the totals above. */
const VISIBLE_ROWS = 40;

type InputMode = "metn" | "html";

const INPUT_MODE_OPTIONS: { value: InputMode; label: string }[] = [
  { value: "metn", label: "Mətn" },
  { value: "html", label: "HTML" },
];

type StopwordMode = "aktiv" | "bagli";

const STOPWORD_OPTIONS: { value: StopwordMode; label: string }[] = [
  { value: "aktiv", label: "Stopword süzgəci: aktiv" },
  { value: "bagli", label: "Stopword süzgəci: bağlı" },
];

type SizeChoice = "1" | "2" | "3";

const SIZE_OPTIONS: { value: SizeChoice; label: string }[] = [
  { value: "1", label: "1 söz" },
  { value: "2", label: "2 söz" },
  { value: "3", label: "3 söz" },
];

/**
 * The longest phrase actually found, in the sense of "most words" rather
 * than "most characters": the top-ranked 3-word phrase if the text has one
 * repeating, otherwise the top 2-word one, otherwise the top single word.
 * `null` only for text with no words in it at all.
 */
function longestPhrase(report: DensityReport): Phrase | null {
  return report.phrases[3][0] ?? report.phrases[2][0] ?? report.phrases[1][0] ?? null;
}

export function AcarSozSixligiTool() {
  const [text, setText] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("metn");
  const [stopwordMode, setStopwordMode] = useState<StopwordMode>("aktiv");
  const [activeSize, setActiveSize] = useState<SizeChoice>("1");

  const report = useMemo(
    () =>
      analyseDensity(text, {
        html: inputMode === "html",
        dropStopwords: stopwordMode === "aktiv",
      }),
    [text, inputMode, stopwordMode],
  );

  const size = Number(activeSize) as 1 | 2 | 3;
  const rows = report.phrases[size];
  const longest = longestPhrase(report);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Mətn"
          action={
            <>
              <ToolSegmented
                label="Giriş növü"
                options={INPUT_MODE_OPTIONS}
                value={inputMode}
                onChange={setInputMode}
              />
              <ToolButton
                size="chip"
                onClick={() => setText(inputMode === "html" ? SAMPLE_HTML : SAMPLE_TEXT)}
              >
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setText("")} disabled={text === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="space-y-3 p-4">
          <ToolField
            label="Mətn və ya HTML"
            htmlFor="acar-soz-sixligi-input"
            note="Səhifə mənbəyini yapışdırmısansa «HTML» seç — teqlər və skript/stil gövdəsi ölçüdən əvvəl atılır."
          >
            <ToolTextArea
              id="acar-soz-sixligi-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Sıxlığını görmək istədiyin mətni yapışdır…"
              className="min-h-60"
              spellCheck={false}
            />
          </ToolField>

          <ToolSegmented
            label="Stopword süzgəci"
            options={STOPWORD_OPTIONS}
            value={stopwordMode}
            onChange={setStopwordMode}
          />
        </div>
      </ToolPanel>

      <div className="grid grid-cols-4 gap-2">
        <ToolStat label="Ümumi söz" value={report.totalWords} />
        <ToolStat label="Unikal söz" value={report.uniqueWords} />
        <ToolStat label="Stopword payı" value={`${report.stopwordShare}%`} />
        <ToolStat label="Ən uzun ifadə" value={longest ? longest.phrase : "—"} />
      </div>

      <ToolResultPanel
        title="İfadələr"
        hint={rows.length > VISIBLE_ROWS ? `ilk ${VISIBLE_ROWS} sətir göstərilir` : `${rows.length} ifadə`}
        action={
          <ToolSegmented
            label="İfadə uzunluğu"
            options={SIZE_OPTIONS}
            value={activeSize}
            onChange={setActiveSize}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-ui text-xs">
            <thead>
              <tr className="border-b border-result-rule text-left text-muted">
                <th scope="col" className="p-2 font-normal">
                  İfadə
                </th>
                <th scope="col" className="p-2 text-right font-normal">
                  Təkrar
                </th>
                <th scope="col" className="p-2 text-right font-normal">
                  Sıxlıq
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-muted">
                    Hələ ifadə yoxdur.
                  </td>
                </tr>
              ) : (
                rows.slice(0, VISIBLE_ROWS).map((row) => (
                  <tr key={row.phrase} className="border-b border-result-rule last:border-0">
                    <td className="p-2 break-words">{row.phrase}</td>
                    <td className="p-2 text-right tabular-nums">{row.count}</td>
                    <td className="p-2 text-right tabular-nums">{row.density}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ToolResultPanel>

      <ToolNote tone="accent" title="Sıxlıq reytinq amili deyil">
        Bu cədvəl mətnin sözlərini necə paylandığını göstərir, hədəf faiz vermir. Google açar söz
        sıxlığına görə sıralamır — süni şəkildə eyni ifadəni artırmaq oxunaqlığı pozur və faydası
        yoxdur. Rəqəmə deyil, nəticəyə bax: gözlədiyin söz cədvəldə heç görünmürsə, mətn
        mövzudan yayınıb deməkdir.
      </ToolNote>
    </div>
  );
}
