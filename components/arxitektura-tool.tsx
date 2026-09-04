"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolTabs, type ToolTabItem } from "./tabs";
import {
  ToolButton,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
} from "./ui";
import {
  confidenceLabels,
  defaultAnswers,
  formatReport,
  presets,
  questions,
  recommend,
  withAnswer,
  type Answers,
  type Confidence,
  type QuestionId,
  type Recommendation,
} from "../lib/arxitektura";

/*
 * Eight answers in, five recommendations out. The scoring is in
 * `lib/arxitektura` and is pure, so this file only decides shape.
 *
 * Two shape decisions carry over from the standalone page because both fixed a
 * measured defect. First, a question is a label and a hint on one line with the
 * select on its own full-width row underneath: the Azerbaijani option labels
 * run long ("Relyasion — cədvəl və əlaqələr") and a select sharing a row with
 * its label clipped them. Second, the five recommendations are one list per
 * aspect rather than five cards each repeating four sections, which is what the
 * tabs are for.
 */

const confidenceStyles: Record<Confidence, string> = {
  high: "border-accent",
  medium: "border-rule",
  low: "border-rule text-muted",
};

/**
 * The five recommendations read as one list per aspect, not as five cards each
 * repeating the same four sections. This is the row every tab shares: the layer
 * it belongs to on top, then whatever that tab is about.
 */
function AreaRow({
  item,
  action,
  children,
}: {
  item: Recommendation;
  /** Right-hand side of the area line — a badge, or nothing. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <p className="font-ui text-[11px] text-muted">
          {item.area}
        </p>
        {action}
      </div>
      {children}
    </li>
  );
}

export function ArxitekturaTool() {
  const [answers, setAnswers] = useState<Answers>(defaultAnswers);

  const recommendations = useMemo(() => recommend(answers), [answers]);
  const report = useMemo(() => formatReport(answers), [answers]);

  const update = (id: QuestionId, value: string) =>
    setAnswers((previous) => withAnswer(previous, id, value));

  const activePreset = presets.find((preset) =>
    questions.every(
      (question) => preset.answers[question.id] === answers[question.id],
    ),
  );

  const tabs: ToolTabItem[] = [
    {
      id: "tovsiye",
      label: "Tövsiyə",
      content: (
        <ToolResultPanel title="Beş qat">
          <ul className="divide-y divide-rule p-3">
            {recommendations.map((item) => (
              <AreaRow
                key={item.id}
                item={item}
                action={
                  <span
                    className={`shrink-0 rounded-sm border px-2 py-0.5 font-ui text-[11px] ${confidenceStyles[item.confidence]}`}
                  >
                    {confidenceLabels[item.confidence]}
                  </span>
                }
              >
                <p className="mt-1 font-ui text-base/6 font-semibold">
                  {item.pick}
                </p>
                <p className="mt-1.5 text-sm/6 text-muted">
                  <span>Alternativ: </span>
                  <span className="font-semibold text-ink">
                    {item.alternative}
                  </span>{" "}
                  ({item.alternativeWhen}).
                </p>
              </AreaRow>
            ))}
          </ul>
        </ToolResultPanel>
      ),
    },
    {
      id: "sebeb",
      label: "Səbəb",
      content: (
        <ToolResultPanel title="Beş qat">
          <ul className="divide-y divide-rule p-3">
            {recommendations.map((item) => (
              <AreaRow key={item.id} item={item}>
                <p className="mt-1 text-sm/6 text-muted">
                  <span className="font-ui font-semibold text-ink">
                    {item.pick}
                  </span>
                  <span> · Niyə: </span>
                  {item.why}
                </p>
              </AreaRow>
            ))}
          </ul>
        </ToolResultPanel>
      ),
    },
    {
      id: "uygun-deyil",
      label: "Nə vaxt uyğun deyil",
      content: (
        <ToolResultPanel title="Beş qat">
          <div className="p-3">
            <p className="font-ui text-[11px] text-muted">
              Nə vaxt bu səhv olar:
            </p>
            <ul className="mt-2 divide-y divide-rule">
              {recommendations.map((item) => (
                <AreaRow key={item.id} item={item}>
                  <p className="mt-1 text-sm/6 text-muted">
                    <span className="font-ui font-semibold text-ink">
                      {item.pick}
                    </span>{" "}
                    ({item.wrongWhen})
                  </p>
                </AreaRow>
              ))}
            </ul>
          </div>
        </ToolResultPanel>
      ),
    },
  ];

  return (
    /* The container, not the viewport: inside a window the two are unrelated.
       items-start, or the recommendation panel is padded out to the height of
       the eight questions beside it. */
    <div className="@container">
      <div className="grid gap-4 @min-[52rem]:grid-cols-2 @min-[52rem]:items-start">
        <ToolPanel>
          <ToolPanelHeader
            title="Suallar"
            hint={activePreset?.label}
            action={
              <ToolButton
                size="chip"
                onClick={() => setAnswers(defaultAnswers)}
                disabled={answers === defaultAnswers}
              >
                Sıfırla
              </ToolButton>
            }
          />

          <div className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2.5">
            <span className="font-ui text-[11px] text-muted">
              Hazır profil:
            </span>
            {presets.map((preset) => (
              <ToolButton
                key={preset.id}
                size="chip"
                selected={activePreset?.id === preset.id}
                onClick={() => setAnswers(preset.answers)}
              >
                {preset.label}
              </ToolButton>
            ))}
          </div>

          {/* A question is a label + hint line, then its control on its own row
              at full width — eight of them fit in the space three of the old
              field cards used to take, and no option label gets clipped. */}
          <div className="divide-y divide-rule px-3">
            {questions.map((question) => (
              <div key={question.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <label
                    htmlFor={`arx-${question.id}`}
                    className="font-ui text-xs font-semibold"
                  >
                    {question.label}
                  </label>
                  <p className="font-ui text-[11px]/5 text-muted">
                    {question.hint}
                  </p>
                </div>
                <ToolSelect
                  id={`arx-${question.id}`}
                  className="mt-2"
                  value={answers[question.id]}
                  onChange={(event) => update(question.id, event.target.value)}
                >
                  {question.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </ToolSelect>
              </div>
            ))}
          </div>
        </ToolPanel>

        {/* The scored half: each of the three tab bodies is recomputed from the
            eight answers beside it and carries the result ground. This outer
            panel keeps the input surface because it holds the tab strip — see
            the note beside the `Rəqəmlər` tab in `miqyas-tool.tsx`. */}
        <ToolPanel>
          <ToolPanelHeader
            title="Tövsiyə"
            action={<CopyButton value={report} label="tövsiyəni kopyala" />}
          />

          <p className="border-b border-rule px-3 py-2.5 font-ui text-[11px]/5 text-muted">
            Beş qat üzrə tövsiyə: cavabı dəyişən kimi yenilənir.
          </p>

          <div className="p-3">
            <ToolTabs idPrefix="arxitektura-tovsiye" items={tabs} />
          </div>

          <div className="border-t border-rule p-3">
            <ToolNote tone="info" title="Bu, qərar deyil">
              Yuxarıdakı beş tövsiyə səkkiz cavaba görə hesablanır: komandanın
              təcrübəsini, mövcud kod bazasını, müqavilə tələblərini və işə
              götürmə bazarını bilmir. Onları müzakirənin başlanğıc nöqtəsi kimi
              işlət: «niyə» və «nə vaxt səhv olar» hissələri adın özündən
              vacibdir.
            </ToolNote>
          </div>
        </ToolPanel>
      </div>
    </div>
  );
}
