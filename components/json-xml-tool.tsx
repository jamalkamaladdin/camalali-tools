"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import { jsonToXml, xmlToJson } from "../lib/json-xml";

type Direction = "to-xml" | "to-json";

const DIRECTION_OPTIONS = [
  { value: "to-xml" as const, label: "JSON → XML" },
  { value: "to-json" as const, label: "XML → JSON" },
];

const CONVENTION_ROWS: { xml: string; json: string }[] = [
  { xml: "<ad>Ali</ad>", json: '"ad": "Ali"' },
  { xml: "<tag>a</tag><tag>b</tag>", json: '"tag": ["a", "b"]' },
  { xml: '<mehsul id="5">', json: '"@id": "5"' },
  { xml: "<qeyd>mətn<a/></qeyd>", json: '"#text": "mətn"' },
];

const SAMPLE_JSON = JSON.stringify(
  { "@id": "5", ad: "Telefon", ölçü: ["qara", "ağ"] },
  null,
  2,
);

const SAMPLE_XML = '<mehsul id="5">\n  <ad>Telefon</ad>\n  <olcu>qara</olcu>\n  <olcu>ağ</olcu>\n</mehsul>';

export function JsonXmlTool() {
  const [direction, setDirection] = useState<Direction>("to-xml");
  const [rootTag, setRootTag] = useState("root");
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);
  const [xmlText, setXmlText] = useState(SAMPLE_XML);

  const isToXml = direction === "to-xml";
  const toXmlResult = useMemo(() => jsonToXml(jsonText, rootTag), [jsonText, rootTag]);
  const toJsonResult = useMemo(() => xmlToJson(xmlText), [xmlText]);
  const result = isToXml ? toXmlResult : toJsonResult;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="İstiqamət"
          action={
            <ToolSegmented
              label="Çevirmə istiqaməti"
              options={DIRECTION_OPTIONS}
              value={direction}
              onChange={setDirection}
            />
          }
        />
        <div className="p-4">
          {isToXml && (
            <ToolField label="Kök teqin adı" htmlFor="json-xml-root">
              <ToolInput
                id="json-xml-root"
                value={rootTag}
                onChange={(event) => setRootTag(event.target.value)}
                spellCheck={false}
              />
            </ToolField>
          )}
          {!isToXml && toJsonResult.ok && (
            <ToolField label="Fayldan oxunan kök teq">
              <p className="flex h-11 items-center font-mono text-sm text-ink">{toJsonResult.rootTag}</p>
            </ToolField>
          )}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title={isToXml ? "JSON" : "XML"}
          action={
            <ToolButton
              size="chip"
              onClick={() => (isToXml ? setJsonText(SAMPLE_JSON) : setXmlText(SAMPLE_XML))}
            >
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label={isToXml ? "JSON" : "XML"} htmlFor="json-xml-input">
            {isToXml ? (
              <ToolTextArea
                id="json-xml-input"
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                rows={10}
                spellCheck={false}
              />
            ) : (
              <ToolTextArea
                id="json-xml-input"
                value={xmlText}
                onChange={(event) => setXmlText(event.target.value)}
                rows={10}
                spellCheck={false}
              />
            )}
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok ? (
        <ToolNote tone="accent" title="Çevrilmədi">
          {result.error}
          {result.line !== undefined ? ` (${result.line}-ci sətir, ${result.column ?? "?"}-ci sütun)` : ""}
        </ToolNote>
      ) : (
        <ToolResultPanel
          title={isToXml ? "XML" : "JSON"}
          action={<CopyButton value={result.output} label="Nəticəni kopyala" />}
        >
          <div className="p-4">
            <ToolOutput>{result.output}</ToolOutput>
          </div>
        </ToolResultPanel>
      )}

      <ToolPanel>
        <ToolPanelHeader title="Qayda" hint="nə nəyə çevrilir" />
        <div className="overflow-x-auto p-4">
          <table className="w-full border-collapse font-ui text-xs">
            <thead>
              <tr className="border-b border-rule text-left text-muted">
                <th scope="col" className="p-2 font-normal">
                  XML
                </th>
                <th scope="col" className="p-2 font-normal">
                  JSON
                </th>
              </tr>
            </thead>
            <tbody>
              {CONVENTION_ROWS.map((row) => (
                <tr key={row.xml} className="border-b border-rule last:border-0">
                  <td className="p-2 font-mono">{row.xml}</td>
                  <td className="p-2 font-mono">{row.json}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ToolPanel>
    </div>
  );
}
