"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { minifyXml, prettyPrintXml, validateXml, type XmlIndent } from "../lib/xml";

type Mode = "format" | "minify" | "validate";

const MODE_OPTIONS = [
  { value: "format" as const, label: "Formatla" },
  { value: "minify" as const, label: "Minifikasiya" },
  { value: "validate" as const, label: "Yoxla" },
];

const INDENT_OPTIONS = [
  { value: "2" as const, label: "2 boşluq" },
  { value: "4" as const, label: "4 boşluq" },
  { value: "tab" as const, label: "tab" },
];

const SAMPLE_XML = '<mehsullar>\n<mehsul id="1"><ad>Telefon</ad><qiymet>399</qiymet></mehsul>\n<!-- ikinci mehsul --><mehsul id="2"><ad>Qulaqlıq</ad><qiymet>59</qiymet></mehsul>\n</mehsullar>';

export function XmlTool() {
  const [mode, setMode] = useState<Mode>("format");
  const [indent, setIndent] = useState<XmlIndent>("2");
  const [text, setText] = useState(SAMPLE_XML);

  const formatted = useMemo(() => prettyPrintXml(text, indent), [text, indent]);
  const minified = useMemo(() => minifyXml(text), [text]);
  const validated = useMemo(() => validateXml(text), [text]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Əməliyyat"
          action={
            <>
              <ToolSegmented label="Əməliyyat" options={MODE_OPTIONS} value={mode} onChange={setMode} />
              {mode === "format" && (
                <ToolSegmented label="Girinti" options={INDENT_OPTIONS} value={indent} onChange={setIndent} />
              )}
            </>
          }
        />
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="XML"
          action={
            <ToolButton size="chip" onClick={() => setText(SAMPLE_XML)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="XML sənədi" htmlFor="xml-input">
            <ToolTextArea
              id="xml-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={12}
              spellCheck={false}
            />
          </ToolField>
        </div>
      </ToolPanel>

      {mode === "validate" ? (
        validated.ok ? (
          <ToolResultPanel title="Nəticə">
            <div className="grid grid-cols-2 gap-2 p-4">
              <ToolStat label="Kök element" value={validated.rootTag} />
              <ToolStat label="Element sayı" value={validated.elementCount} />
            </div>
          </ToolResultPanel>
        ) : (
          <ToolNote tone="accent" title="Quruluş pozğundur">
            {validated.error} ({validated.line}-ci sətir, {validated.column}-ci sütun)
          </ToolNote>
        )
      ) : (
        (() => {
          const result = mode === "format" ? formatted : minified;
          return !result.ok ? (
            <ToolNote tone="accent" title="Formatlanmadı">
              {result.error} ({result.line}-ci sətir, {result.column}-ci sütun)
            </ToolNote>
          ) : (
            <ToolResultPanel
              title={mode === "format" ? "Formatlanmış XML" : "Minifikasiya edilmiş XML"}
              action={<CopyButton value={result.output} label="Nəticəni kopyala" />}
            >
              <div className="p-4">
                <ToolOutput>{result.output}</ToolOutput>
              </div>
            </ToolResultPanel>
          );
        })()
      )}
    </div>
  );
}
