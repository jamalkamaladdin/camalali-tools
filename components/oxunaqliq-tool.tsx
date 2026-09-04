"use client";

import { useMemo, useState } from "react";
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
import { analyseReadability, READABILITY_GUIDANCE } from "../lib/oxunaqliq";

const SAMPLE_TEXT =
  "Bu sistemdə istifadəçinin göndərdiyi hər sorğu əvvəlcə doğrulanır, sonra emal olunur və nəticə formalaşdırılır. Doğrulanır, çünki doğrulanmamış sorğu bazaya birbaşa göndərilsə, sistemin bütövlüyü təhlükəyə düşə bilər, bu da uzun müddətdə etibarlılığı azaldan amillərdən biridir.\n\nNəticə formalaşdırılır və istifadəçiyə qaytarılır. Sadə cümlə oxumaq asandır.";

function formatReadingTime(minutes: number, seconds: number): string {
  if (minutes === 0) return `${seconds} san`;
  return `${minutes} dəq ${seconds} san`;
}

export function OxunaqliqTool() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const report = useMemo(() => analyseReadability(text), [text]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Mətn"
          action={
            <ToolButton size="chip" onClick={() => setText(SAMPLE_TEXT)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="Mətn" htmlFor="oxunaqliq-input">
            <ToolTextArea
              id="oxunaqliq-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder="Oxunaqlığını ölçmək istədiyin mətni yapışdır…"
            />
          </ToolField>
        </div>
      </ToolPanel>

      <ToolResultPanel title="Ümumi ölçülər" hint={`${report.wordCount} söz`}>
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
          <ToolStat
            label="Cümlə sayı"
            value={report.sentences.count}
            note="Orta cümlə uzunluğu üçün aşağıya bax"
          />
          <ToolStat
            label="Orta cümlə uzunluğu"
            value={`${report.sentences.averageWords} söz`}
            note={READABILITY_GUIDANCE.averageSentenceLength}
          />
          <ToolStat
            label="Orta söz uzunluğu"
            value={`${report.wordLength.averageLetters} hərf`}
            note={READABILITY_GUIDANCE.averageWordLength}
          />
          <ToolStat
            label="Uzun söz payı"
            value={`${report.wordLength.longWordSharePercent}%`}
            note={READABILITY_GUIDANCE.longWordShare}
          />
          <ToolStat
            label="Abzas sayı"
            value={report.paragraphs.count}
            note={`Orta ${report.paragraphs.averageWords} söz/abzas`}
          />
          <ToolStat
            label="Oxuma vaxtı"
            value={formatReadingTime(report.readingTime.minutes, report.readingTime.seconds)}
            note="200 söz/dəqiqə sürəti ilə"
          />
        </div>
        {report.paragraphs.averageWords > 120 && (
          <div className="px-4 pb-4">
            <ToolNote tone="accent">{READABILITY_GUIDANCE.averageParagraphLength}</ToolNote>
          </div>
        )}
      </ToolResultPanel>

      {report.sentences.longest && (
        <ToolResultPanel title="Ən uzun cümlə" hint={`${report.sentences.longest.words} söz`}>
          <div className="p-4">
            <p className="text-ios-subhead text-ink">{report.sentences.longest.text}</p>
            {report.sentences.longest.words > 35 && (
              <p className="mt-2 text-ios-footnote text-muted">{READABILITY_GUIDANCE.longestSentence}</p>
            )}
          </div>
        </ToolResultPanel>
      )}

      <ToolResultPanel title="Passiv fel işarəsi" hint={`${report.passive.sharePercent}% söz`}>
        <div className="p-4">
          <ToolStat
            label="-ılır/-ilir/-ulur/-ülür ilə bitən söz"
            value={report.passive.matchCount}
            note={READABILITY_GUIDANCE.passiveVoice}
          />
          {report.passive.sample.length > 0 && (
            <p className="mt-3 text-ios-footnote text-muted">
              Nümunə: {report.passive.sample.join(", ")}
            </p>
          )}
        </div>
      </ToolResultPanel>

      <div className="grid gap-5 sm:grid-cols-2">
        <ToolResultPanel title="Təkrarlanan söz" hint={`${report.repeatedWords.length} söz`}>
          <div className="p-4">
            {report.repeatedWords.length === 0 ? (
              <p className="text-ios-footnote text-muted">Təkrarlanan söz tapılmadı.</p>
            ) : (
              <ol className="space-y-1.5 font-ui text-xs">
                {report.repeatedWords.map((entry, index) => (
                  <li key={entry.text} className="flex items-center justify-between gap-3">
                    <span>
                      <span className="text-muted">{index + 1}.</span> {entry.text}
                    </span>
                    <span className="tabular-nums text-muted">{entry.count}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-ios-footnote text-muted">{READABILITY_GUIDANCE.repeatedWords}</p>
          </div>
        </ToolResultPanel>

        <ToolResultPanel title="Təkrarlanan ifadə" hint={`${report.repeatedPhrases.length} ifadə`}>
          <div className="p-4">
            {report.repeatedPhrases.length === 0 ? (
              <p className="text-ios-footnote text-muted">Təkrarlanan ifadə tapılmadı.</p>
            ) : (
              <ol className="space-y-1.5 font-ui text-xs">
                {report.repeatedPhrases.map((entry, index) => (
                  <li key={entry.text} className="flex items-center justify-between gap-3">
                    <span>
                      <span className="text-muted">{index + 1}.</span> {entry.text}
                    </span>
                    <span className="tabular-nums text-muted">{entry.count}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-ios-footnote text-muted">{READABILITY_GUIDANCE.repeatedPhrases}</p>
          </div>
        </ToolResultPanel>
      </div>

      {report.wordCount === 0 && <ToolNote tone="info">Ölçmək üçün ən azı bir cümlə yaz.</ToolNote>}
    </div>
  );
}
