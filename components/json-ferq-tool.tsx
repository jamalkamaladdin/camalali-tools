"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
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
import { ToolSegmented } from "./tabs";
import {
  diffJson,
  parseJsonSafe,
  toJsonPatch,
  type ArrayMatchMode,
  type DiffEntry,
  type DiffOp,
} from "../lib/json-ferq";

const SAMPLE_A = `{
  "user": {
    "name": "Kamran",
    "roles": ["editor", "viewer"],
    "address": [{ "id": 1, "city": "Bakı" }]
  }
}`;

const SAMPLE_B = `{
  "user": {
    "name": "Kamran Əliyev",
    "roles": ["editor", "admin"],
    "address": [{ "id": 1, "city": "Gəncə" }]
  }
}`;

const OP_LABEL: Record<DiffOp, string> = {
  add: "əlavə olundu",
  remove: "silindi",
  replace: "dəyişdi",
  "type-change": "tip dəyişdi",
};

function formatValue(value: DiffEntry["before"]): string {
  return value === undefined ? "—" : JSON.stringify(value);
}

export function JsonFerqTool() {
  const [textA, setTextA] = useState(SAMPLE_A);
  const [textB, setTextB] = useState(SAMPLE_B);
  const [arrayMode, setArrayMode] = useState<ArrayMatchMode>("key");
  const [arrayKey, setArrayKey] = useState("id");
  const [orderSensitive, setOrderSensitive] = useState(true);

  const parsedA = useMemo(() => parseJsonSafe(textA), [textA]);
  const parsedB = useMemo(() => parseJsonSafe(textB), [textB]);

  const entries = useMemo(() => {
    if (!parsedA.ok || !parsedB.ok) return null;
    return diffJson(parsedA.value, parsedB.value, { arrayMode, arrayKey: arrayKey.trim() || "id", orderSensitive });
  }, [parsedA, parsedB, arrayMode, arrayKey, orderSensitive]);

  const patchText = useMemo(() => {
    if (entries === null) return null;
    return JSON.stringify(toJsonPatch(entries), null, 2);
  }, [entries]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Massiv qaydası"
          hint={`${entries?.length ?? 0} fərq`}
          action={
            <>
              <ToolSegmented
                label="Massiv uyğunlaşdırma rejimi"
                value={arrayMode}
                onChange={setArrayMode}
                options={[
                  { value: "index", label: "mövqeyə görə" },
                  { value: "key", label: "açara görə" },
                ]}
              />
              <ToolButton size="chip" onClick={() => { setTextA(SAMPLE_A); setTextB(SAMPLE_B); }}>
                Nümunə
              </ToolButton>
            </>
          }
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 p-4">
          {arrayMode === "key" ? (
            <ToolField label="Uyğunlaşdırma açarı" htmlFor="json-ferq-key" note="Massiv elementləri bu sahənin dəyəri ilə tanınır.">
              <ToolInput
                id="json-ferq-key"
                value={arrayKey}
                onChange={(event) => setArrayKey(event.target.value)}
                className="font-mono"
                placeholder="id"
              />
            </ToolField>
          ) : (
            <label className="flex items-start gap-2 font-ui text-ios-footnote text-muted">
              <input
                type="checkbox"
                checked={orderSensitive}
                onChange={(event) => setOrderSensitive(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span>Sıra dəyişikliyinə həssas — söndürülsə yalnız qarşılığı olmayan dəyərlər fərq sayılır.</span>
            </label>
          )}
        </div>
      </ToolPanel>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <ToolPanel>
          <ToolPanelHeader title="Birinci JSON (A)" />
          <div className="p-4">
            <ToolTextArea value={textA} onChange={(event) => setTextA(event.target.value)} rows={10} spellCheck={false} />
            {!parsedA.ok && <p className="mt-2 text-ios-footnote text-accent-text">{parsedA.error}</p>}
          </div>
        </ToolPanel>
        <ToolPanel>
          <ToolPanelHeader title="İkinci JSON (B)" />
          <div className="p-4">
            <ToolTextArea value={textB} onChange={(event) => setTextB(event.target.value)} rows={10} spellCheck={false} />
            {!parsedB.ok && <p className="mt-2 text-ios-footnote text-accent-text">{parsedB.error}</p>}
          </div>
        </ToolPanel>
      </div>

      {entries !== null && (
        <ToolResultPanel title="Fərqlər" hint={`${entries.length} nəticə`}>
          {entries.length === 0 ? (
            <p className="p-4 text-ios-subhead text-muted">İki sənəd struktur baxımından eynidir.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-ui text-xs">
                <thead>
                  <tr className="border-b border-result-rule text-left text-muted">
                    <th scope="col" className="p-2 font-normal">Yol</th>
                    <th scope="col" className="p-2 font-normal">Əməliyyat</th>
                    <th scope="col" className="p-2 font-normal">Əvvəl</th>
                    <th scope="col" className="p-2 font-normal">Sonra</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, index) => (
                    <tr key={index} className="border-b border-result-rule align-top last:border-0">
                      <td className="max-w-56 p-2 font-mono break-all">{entry.path || "(kök)"}</td>
                      <td className="p-2 tabular-nums">{OP_LABEL[entry.op]}</td>
                      <td className="max-w-40 p-2 font-mono break-all text-muted">{formatValue(entry.before)}</td>
                      <td className="max-w-40 p-2 font-mono break-all">{formatValue(entry.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ToolResultPanel>
      )}

      {patchText !== null && entries !== null && entries.length > 0 && (
        <ToolPanel>
          <ToolPanelHeader title="JSON Patch (RFC 6902)" action={<CopyButton value={patchText} label="patch kopyala" />} />
          <div className="p-4">
            <ToolOutput>{patchText}</ToolOutput>
          </div>
        </ToolPanel>
      )}

      {(!parsedA.ok || !parsedB.ok) && <ToolNote tone="accent">Hər iki JSON düzgün olmalıdır ki, fərq hesablansın.</ToolNote>}
    </div>
  );
}
