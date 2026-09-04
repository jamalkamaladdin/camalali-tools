"use client";

import { useId, useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { ToolSegmented, ToolTabs } from "./tabs";
import {
  describeStep,
  differenceLists,
  intersectLists,
  JOIN_SEPARATOR_LABELS,
  parseListText,
  processList,
  type CaseMode,
  type JoinSeparator,
  type ListStep,
  type SortBy,
  type SortDirection,
} from "../lib/siyahi";

/*
 * The dotted/dotless capital I pair sits in the sample on purpose — it is
 * the exact case-conversion trap `siyahi.ts` guards against, and the
 * quickest way to see the guard working is to add a lowercase-conversion
 * step and watch the two capitalised names land on two different lowercase
 * letters rather than both collapsing onto the same wrong one.
 */
const SAMPLE_LIST = `Vəli
əli
Zeynəb
vəli
İlqar
Islam
`;

const SAMPLE_LIST_A = "alma\narmud\nheyva\nnar";
const SAMPLE_LIST_B = "armud\nnar\nüzüm";

type StepKind = ListStep["kind"];

const STEP_LABELS: Record<StepKind, string> = {
  dedupe: "Təkrarı sil",
  sort: "Sırala",
  reverse: "Tərsinə çevir",
  shuffle: "Qarışdır",
  "drop-blank": "Boş sətirləri at",
  trim: "Kənar boşluqları kəs",
  prefix: "Prefiks əlavə et",
  suffix: "Suffiks əlavə et",
  number: "Nömrələ",
  case: "Kiçik/böyük hərfə çevir",
  separator: "Ayırıcını dəyiş",
};

const STEP_KINDS: StepKind[] = [
  "dedupe",
  "sort",
  "reverse",
  "shuffle",
  "drop-blank",
  "trim",
  "prefix",
  "suffix",
  "number",
  "case",
  "separator",
];

function PipelineTab() {
  const [text, setText] = useState(SAMPLE_LIST);
  const [steps, setSteps] = useState<ListStep[]>([]);
  const [draftKind, setDraftKind] = useState<StepKind>("dedupe");
  const [draftSortBy, setDraftSortBy] = useState<SortBy>("alpha");
  const [draftSortDirection, setDraftSortDirection] = useState<SortDirection>("asc");
  const [draftText, setDraftText] = useState("");
  const [draftCase, setDraftCase] = useState<CaseMode>("lower");
  const [draftSeparator, setDraftSeparator] = useState<JoinSeparator>("newline");
  const inputId = useId();

  const result = useMemo(() => processList(text, steps), [text, steps]);
  const inputCount = useMemo(() => parseListText(text).length, [text]);

  const addStep = () => {
    switch (draftKind) {
      case "dedupe":
        setSteps((prev) => [...prev, { kind: "dedupe" }]);
        return;
      case "sort":
        setSteps((prev) => [...prev, { kind: "sort", by: draftSortBy, direction: draftSortDirection }]);
        return;
      case "reverse":
        setSteps((prev) => [...prev, { kind: "reverse" }]);
        return;
      case "shuffle":
        setSteps((prev) => [...prev, { kind: "shuffle", seed: Math.floor(Math.random() * 2 ** 31) }]);
        return;
      case "drop-blank":
        setSteps((prev) => [...prev, { kind: "drop-blank" }]);
        return;
      case "trim":
        setSteps((prev) => [...prev, { kind: "trim" }]);
        return;
      case "prefix":
        setSteps((prev) => [...prev, { kind: "prefix", text: draftText }]);
        return;
      case "suffix":
        setSteps((prev) => [...prev, { kind: "suffix", text: draftText }]);
        return;
      case "number":
        setSteps((prev) => [...prev, { kind: "number" }]);
        return;
      case "case":
        setSteps((prev) => [...prev, { kind: "case", mode: draftCase }]);
        return;
      case "separator":
        setSteps((prev) => [...prev, { kind: "separator", join: draftSeparator }]);
        return;
    }
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <ToolField label="Siyahı" htmlFor={inputId} hint={`${inputCount} sətir`}>
        <ToolTextArea
          id={inputId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          spellCheck={false}
        />
      </ToolField>

      <ToolPanel>
        <ToolPanelHeader title="Əməliyyat əlavə et" />
        <div className="flex flex-wrap items-end gap-3 p-4">
          <ToolField label="Əməliyyat" className="w-52">
            <ToolSelect
              value={draftKind}
              onChange={(event) => setDraftKind(event.target.value as StepKind)}
            >
              {STEP_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {STEP_LABELS[kind]}
                </option>
              ))}
            </ToolSelect>
          </ToolField>

          {draftKind === "sort" && (
            <>
              <ToolField label="Üzrə" className="w-40">
                <ToolSelect
                  value={draftSortBy}
                  onChange={(event) => setDraftSortBy(event.target.value as SortBy)}
                >
                  <option value="alpha">Əlifba</option>
                  <option value="numeric">Rəqəm</option>
                  <option value="length">Uzunluq</option>
                </ToolSelect>
              </ToolField>
              <ToolField label="İstiqamət" className="w-40">
                <ToolSelect
                  value={draftSortDirection}
                  onChange={(event) => setDraftSortDirection(event.target.value as SortDirection)}
                >
                  <option value="asc">Artan</option>
                  <option value="desc">Azalan</option>
                </ToolSelect>
              </ToolField>
            </>
          )}

          {(draftKind === "prefix" || draftKind === "suffix") && (
            <ToolField
              label={draftKind === "prefix" ? "Prefiks mətni" : "Suffiks mətni"}
              className="w-52"
            >
              <ToolInput
                type="text"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
              />
            </ToolField>
          )}

          {draftKind === "case" && (
            <ToolSegmented
              label="Kiçik/böyük"
              value={draftCase}
              onChange={setDraftCase}
              options={[
                { value: "lower", label: "kiçik" },
                { value: "upper", label: "böyük" },
              ]}
            />
          )}

          {draftKind === "separator" && (
            <ToolField label="Yeni ayırıcı" className="w-40">
              <ToolSelect
                value={draftSeparator}
                onChange={(event) => setDraftSeparator(event.target.value as JoinSeparator)}
              >
                {(Object.keys(JOIN_SEPARATOR_LABELS) as JoinSeparator[]).map((separator) => (
                  <option key={separator} value={separator}>
                    {JOIN_SEPARATOR_LABELS[separator]}
                  </option>
                ))}
              </ToolSelect>
            </ToolField>
          )}

          <ToolButton onClick={addStep}>Əlavə et</ToolButton>
        </div>
      </ToolPanel>

      {steps.length > 0 && (
        <ToolPanel>
          <ToolPanelHeader title="Sıra" hint={`${steps.length} addım`} />
          <ol className="space-y-2 p-4">
            {steps.map((step, index) => (
              <li key={index} className="flex items-center justify-between gap-3 text-ios-subhead">
                <span>
                  <span className="tabular-nums text-muted">{index + 1}.</span>{" "}
                  {describeStep(step)}
                </span>
                <ToolButton size="chip" onClick={() => removeStep(index)}>
                  sil
                </ToolButton>
              </li>
            ))}
          </ol>
        </ToolPanel>
      )}

      <ToolResultPanel
        title="Nəticə"
        hint={`${result.items.length} sətir`}
        action={<CopyButton value={result.text} label="kopyala" />}
      >
        <div className="p-3">
          <ToolOutput>{result.text === "" ? "—" : result.text}</ToolOutput>
        </div>
      </ToolResultPanel>
    </div>
  );
}

function IntersectionTab() {
  const [textA, setTextA] = useState(SAMPLE_LIST_A);
  const [textB, setTextB] = useState(SAMPLE_LIST_B);
  const idA = useId();
  const idB = useId();

  const listA = useMemo(() => parseListText(textA), [textA]);
  const listB = useMemo(() => parseListText(textB), [textB]);
  const intersection = useMemo(() => intersectLists(listA, listB), [listA, listB]);
  const difference = useMemo(() => differenceLists(listA, listB), [listA, listB]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <ToolField label="Siyahı A" htmlFor={idA} hint={`${listA.length} sətir`}>
          <ToolTextArea
            id={idA}
            value={textA}
            onChange={(event) => setTextA(event.target.value)}
            rows={6}
            spellCheck={false}
          />
        </ToolField>
        <ToolField label="Siyahı B" htmlFor={idB} hint={`${listB.length} sətir`}>
          <ToolTextArea
            id={idB}
            value={textB}
            onChange={(event) => setTextB(event.target.value)}
            rows={6}
            spellCheck={false}
          />
        </ToolField>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ToolStat label="Kəsişmə" value={intersection.length} />
        <ToolStat label="Yalnız A-da" value={difference.length} />
      </div>

      <ToolResultPanel title="Kəsişmə (hər ikisində)">
        <div className="p-3">
          <ToolOutput>{intersection.length === 0 ? "—" : intersection.join("\n")}</ToolOutput>
        </div>
      </ToolResultPanel>

      <ToolResultPanel title="Fərq (yalnız A-da)">
        <div className="p-3">
          <ToolOutput>{difference.length === 0 ? "—" : difference.join("\n")}</ToolOutput>
        </div>
      </ToolResultPanel>
    </div>
  );
}

export function SiyahiTool() {
  return (
    <div className="mt-8">
      <ToolPanel>
        <ToolPanelHeader title="Siyahı emalı" />
        <div className="p-4">
          <ToolLabel className="mb-3">Əməliyyatlar əlavə etdiyin sırada tətbiq olunur.</ToolLabel>
          <ToolTabs
            idPrefix="siyahi-tool"
            items={[
              { id: "pipeline", label: "Əməliyyatlar", content: <PipelineTab /> },
              { id: "compare", label: "Kəsişmə və fərq", content: <IntersectionTab /> },
            ]}
          />
        </div>
      </ToolPanel>
    </div>
  );
}
