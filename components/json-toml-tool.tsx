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
  ToolTextArea,
} from "./ui";
import { jsonToToml, tomlToJson } from "../lib/json-toml";

type Direction = "to-toml" | "to-json";

const DIRECTION_OPTIONS = [
  { value: "to-toml" as const, label: "JSON → TOML" },
  { value: "to-json" as const, label: "TOML → JSON" },
];

const SAMPLE_JSON = JSON.stringify(
  {
    ad: "Ana server",
    server: { host: "localhost", port: 8080 },
    fruits: [{ name: "alma" }, { name: "banan" }],
  },
  null,
  2,
);

const SAMPLE_TOML = `ad = "Ana server"

[server]
host = "localhost"
port = 8080

[[fruits]]
name = "alma"

[[fruits]]
name = "banan"
`;

export function JsonTomlTool() {
  const [direction, setDirection] = useState<Direction>("to-toml");
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);
  const [tomlText, setTomlText] = useState(SAMPLE_TOML);

  const isToToml = direction === "to-toml";
  const toTomlResult = useMemo(() => jsonToToml(jsonText), [jsonText]);
  const toJsonResult = useMemo(() => tomlToJson(tomlText), [tomlText]);
  const result = isToToml ? toTomlResult : toJsonResult;

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
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title={isToToml ? "JSON" : "TOML"}
          action={
            <ToolButton
              size="chip"
              onClick={() => (isToToml ? setJsonText(SAMPLE_JSON) : setTomlText(SAMPLE_TOML))}
            >
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label={isToToml ? "JSON" : "TOML"} htmlFor="json-toml-input">
            {isToToml ? (
              <ToolTextArea
                id="json-toml-input"
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                rows={12}
                spellCheck={false}
              />
            ) : (
              <ToolTextArea
                id="json-toml-input"
                value={tomlText}
                onChange={(event) => setTomlText(event.target.value)}
                rows={12}
                spellCheck={false}
              />
            )}
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok ? (
        <ToolNote tone="accent" title="Çevrilmədi">
          {result.error}
          {"line" in result && result.line !== undefined ? ` (${result.line}-ci sətir)` : ""}
        </ToolNote>
      ) : (
        <ToolResultPanel
          title={isToToml ? "TOML" : "JSON"}
          action={<CopyButton value={result.output} label="Nəticəni kopyala" />}
        >
          <div className="p-4">
            <ToolOutput>{result.output || "—"}</ToolOutput>
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}
