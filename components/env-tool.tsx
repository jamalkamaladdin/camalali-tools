"use client";

import { useId, useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolField,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { ToolSegmented, ToolTabs } from "./tabs";
import {
  buildEnvExample,
  diffEnv,
  envToJson,
  jsonToEnv,
} from "../lib/env";

/*
 * Written to demonstrate all four quoting behaviours at once: a full-line
 * comment, `export ` stripped, a double-quoted value with a trailing inline
 * comment (kept because it is outside the quotes), a single-quoted literal
 * value, and a key set twice so the "last one wins, and it is flagged"
 * behaviour has something to show.
 */
const SAMPLE_ENV = `# Server üçün əsas dəyişənlər
export APP_NAME=Camalali
APP_ENV="staging" # ilkin mühit
API_KEY='sirr-1234'
PORT=3000
DEBUG=false
APP_ENV=production`;

const SAMPLE_JSON = `{
  "APP_NAME": "Camalali",
  "PORT": "3000",
  "DEBUG": "false"
}`;

type JsonDirection = "env-to-json" | "json-to-env";

function JsonTab() {
  const [direction, setDirection] = useState<JsonDirection>("env-to-json");
  const [envText, setEnvText] = useState(SAMPLE_ENV);
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);
  const envId = useId();
  const jsonId = useId();

  const envResult = useMemo(() => envToJson(envText), [envText]);
  const jsonResult = useMemo(() => jsonToEnv(jsonText), [jsonText]);

  return (
    <div className="space-y-4">
      <ToolSegmented
        label="İstiqamət"
        value={direction}
        onChange={setDirection}
        options={[
          { value: "env-to-json", label: ".env → JSON" },
          { value: "json-to-env", label: "JSON → .env" },
        ]}
      />

      {direction === "env-to-json" ? (
        <>
          <ToolField label=".env mətni" htmlFor={envId}>
            <ToolTextArea
              id={envId}
              value={envText}
              onChange={(event) => setEnvText(event.target.value)}
              rows={9}
              spellCheck={false}
            />
          </ToolField>

          {envResult.duplicateKeys.length > 0 && (
            <ToolNote tone="accent">
              Təkrarlanan açar: {envResult.duplicateKeys.join(", ")} — sonuncu dəyər qalıb.
            </ToolNote>
          )}
          {envResult.unsupportedLines.length > 0 && (
            <ToolNote tone="accent">
              {envResult.unsupportedLines.map((line) => (
                <div key={line.lineNumber}>
                  Sətir {line.lineNumber}: {line.reason}.
                </div>
              ))}
            </ToolNote>
          )}

          <ToolResultPanel
            title="JSON"
            hint={`${envResult.entries.length} açar`}
            action={<CopyButton value={envResult.json} label="JSON kopyala" />}
          >
            <div className="p-3">
              <ToolOutput>{envResult.json}</ToolOutput>
            </div>
          </ToolResultPanel>
        </>
      ) : (
        <>
          <ToolField label="JSON mətni" htmlFor={jsonId}>
            <ToolTextArea
              id={jsonId}
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              rows={9}
              spellCheck={false}
            />
          </ToolField>

          {jsonResult.ok ? (
            <ToolResultPanel
              title=".env"
              action={<CopyButton value={jsonResult.text} label=".env kopyala" />}
            >
              <div className="p-3">
                <ToolOutput>{jsonResult.text}</ToolOutput>
              </div>
            </ToolResultPanel>
          ) : (
            <ToolNote tone="accent">{jsonResult.error}</ToolNote>
          )}
        </>
      )}
    </div>
  );
}

function ExampleTab() {
  const [text, setText] = useState(SAMPLE_ENV);
  const inputId = useId();
  const result = useMemo(() => buildEnvExample(text), [text]);

  return (
    <div className="space-y-4">
      <ToolField label=".env mətni" htmlFor={inputId}>
        <ToolTextArea
          id={inputId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={9}
          spellCheck={false}
        />
      </ToolField>

      {result.unsupportedLines.length > 0 && (
        <ToolNote tone="accent">
          {result.unsupportedLines.map((line) => (
            <div key={line.lineNumber}>
              Sətir {line.lineNumber}: {line.reason} — bu sətir dəyəri təmizlənmədən olduğu kimi
              köçürülüb, əl ilə yoxla.
            </div>
          ))}
        </ToolNote>
      )}

      <ToolResultPanel
        title=".env.example"
        hint={`${result.entryCount} açar`}
        action={<CopyButton value={result.text} label="kopyala" />}
      >
        <div className="p-3">
          <ToolOutput>{result.text}</ToolOutput>
        </div>
      </ToolResultPanel>
    </div>
  );
}

function DiffTab() {
  const [textA, setTextA] = useState(SAMPLE_ENV);
  const [textB, setTextB] = useState(
    `APP_NAME=Camalali\nPORT=3000\nDEBUG=true\nSENTRY_DSN=https://example`,
  );
  const idA = useId();
  const idB = useId();

  const diff = useMemo(() => diffEnv(textA, textB), [textA, textB]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <ToolField label="A faylı" htmlFor={idA}>
          <ToolTextArea
            id={idA}
            value={textA}
            onChange={(event) => setTextA(event.target.value)}
            rows={8}
            spellCheck={false}
          />
        </ToolField>
        <ToolField label="B faylı" htmlFor={idB}>
          <ToolTextArea
            id={idB}
            value={textB}
            onChange={(event) => setTextB(event.target.value)}
            rows={8}
            spellCheck={false}
          />
        </ToolField>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ToolStat label="Yalnız A-da" value={diff.onlyInA.length} />
        <ToolStat label="Yalnız B-da" value={diff.onlyInB.length} />
        <ToolStat label="Eyni dəyər" value={diff.sameValue.length} />
        <ToolStat
          label="Fərqli dəyər"
          value={diff.differentValue.length}
          tone={diff.differentValue.length > 0 ? "warning" : "default"}
        />
      </div>

      {diff.onlyInA.length > 0 && (
        <ToolResultPanel title="Yalnız A faylında olan açarlar">
          <p className="p-3 font-mono text-sm break-words">{diff.onlyInA.join(", ")}</p>
        </ToolResultPanel>
      )}
      {diff.onlyInB.length > 0 && (
        <ToolResultPanel title="Yalnız B faylında olan açarlar">
          <p className="p-3 font-mono text-sm break-words">{diff.onlyInB.join(", ")}</p>
        </ToolResultPanel>
      )}
      {diff.differentValue.length > 0 && (
        <ToolPanel>
          <ToolPanelHeader title="Hər ikisində var, dəyəri fərqlidir" />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-ui text-xs">
              <thead>
                <tr className="border-b border-rule text-left text-muted">
                  <th scope="col" className="p-2 font-normal">
                    Açar
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    A
                  </th>
                  <th scope="col" className="p-2 font-normal">
                    B
                  </th>
                </tr>
              </thead>
              <tbody>
                {diff.differentValue.map((row) => (
                  <tr key={row.key} className="border-b border-rule last:border-0">
                    <td className="p-2 font-mono break-all">{row.key}</td>
                    <td className="p-2 font-mono break-all">{row.valueA}</td>
                    <td className="p-2 font-mono break-all">{row.valueB}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>
      )}
    </div>
  );
}

export function EnvTool() {
  return (
    <div className="mt-8">
      <ToolPanel>
        <ToolPanelHeader title=".env alətləri" />
        <div className="p-4">
          <ToolTabs
            idPrefix="env-tool"
            items={[
              { id: "json", label: "JSON çevir", content: <JsonTab /> },
              { id: "example", label: ".env.example", content: <ExampleTab /> },
              { id: "diff", label: "Müqayisə et", content: <DiffTab /> },
            ]}
          />
        </div>
      </ToolPanel>
    </div>
  );
}
