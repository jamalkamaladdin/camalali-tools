"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolNote, ToolOutput, ToolPanel, ToolPanelHeader, ToolTextArea } from "./ui";
import { ToolSegmented, ToolTabs, type ToolTabItem } from "./tabs";
import {
  curlFromRequest,
  parseCurl,
  parseFetchCode,
  toAxios,
  toCSharpHttpClient,
  toFetch,
  toGoNetHttp,
  toPhpCurl,
  toPythonHttpx,
  toPythonRequests,
  type ParsedRequest,
} from "../lib/curl-kod";

const SAMPLE_CURL = `curl -X POST 'https://api.example.az/istifadeciler' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer <token>' \\
  -d '{"ad": "Kamran", "yas": 30}'`;

const SAMPLE_FETCH = `fetch("https://api.example.az/istifadeciler", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ad: "Kamran", yas: 30 }),
});`;

type Direction = "curl-to-code" | "code-to-curl";

function codeTabs(request: ParsedRequest): ToolTabItem[] {
  const outputs: { id: string; label: string; code: string }[] = [
    { id: "fetch", label: "fetch", code: toFetch(request) },
    { id: "axios", label: "axios", code: toAxios(request) },
    { id: "py-requests", label: "Python requests", code: toPythonRequests(request) },
    { id: "py-httpx", label: "Python httpx", code: toPythonHttpx(request) },
    { id: "go", label: "Go", code: toGoNetHttp(request) },
    { id: "php", label: "PHP cURL", code: toPhpCurl(request) },
    { id: "csharp", label: "C# HttpClient", code: toCSharpHttpClient(request) },
  ];
  return outputs.map((o) => ({
    id: o.id,
    label: o.label,
    content: (
      <div className="space-y-2">
        <div className="flex justify-end">
          <CopyButton value={o.code} label="kodu kopyala" />
        </div>
        <ToolOutput>{o.code}</ToolOutput>
      </div>
    ),
  }));
}

export function CurlKodTool() {
  const [direction, setDirection] = useState<Direction>("curl-to-code");
  const [curlText, setCurlText] = useState(SAMPLE_CURL);
  const [fetchText, setFetchText] = useState(SAMPLE_FETCH);

  const curlParsed = useMemo(() => parseCurl(curlText), [curlText]);
  const fetchParsed = useMemo(() => parseFetchCode(fetchText), [fetchText]);

  const curlToShellCommand = useMemo(() => (fetchParsed.ok ? curlFromRequest(fetchParsed.request) : null), [fetchParsed]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="İstiqamət"
          action={
            <ToolSegmented
              label="Çevirmə istiqaməti"
              value={direction}
              onChange={setDirection}
              options={[
                { value: "curl-to-code", label: "curl → kod" },
                { value: "code-to-curl", label: "fetch → curl" },
              ]}
            />
          }
        />
        <div className="p-4">
          {direction === "curl-to-code" ? (
            <ToolTextArea value={curlText} onChange={(event) => setCurlText(event.target.value)} rows={6} spellCheck={false} />
          ) : (
            <ToolTextArea value={fetchText} onChange={(event) => setFetchText(event.target.value)} rows={8} spellCheck={false} />
          )}
        </div>
      </ToolPanel>

      {direction === "curl-to-code" &&
        (curlParsed.ok ? (
          <ToolPanel>
            <ToolPanelHeader title="Kod" hint={`${curlParsed.request.method} ${curlParsed.request.url}`} />
            <div className="p-4">
              <ToolTabs idPrefix="curl-kod" items={codeTabs(curlParsed.request)} />
            </div>
          </ToolPanel>
        ) : (
          <ToolNote tone="accent">{curlParsed.error}</ToolNote>
        ))}

      {direction === "code-to-curl" &&
        (fetchParsed.ok && curlToShellCommand !== null ? (
          <ToolPanel>
            <ToolPanelHeader title="curl əmri" action={<CopyButton value={curlToShellCommand} label="əmri kopyala" />} />
            <div className="p-4">
              <ToolOutput>{curlToShellCommand}</ToolOutput>
            </div>
          </ToolPanel>
        ) : (
          <ToolNote tone="accent">{fetchParsed.ok ? "curl əmri qurula bilmədi." : fetchParsed.error}</ToolNote>
        ))}
    </div>
  );
}
