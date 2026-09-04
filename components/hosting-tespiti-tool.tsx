"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { normalizeTargetUrl } from "../lib/safe-url";
import type { Detection, DetectionCategory, HostingReport } from "../lib/hosting-tespiti";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";

const EXAMPLES = ["camalali.com", "github.com", "wikipedia.org"];

const CATEGORY_LABELS: Record<DetectionCategory, string> = {
  "proksi-cdn": "Proksi / CDN",
  "server-proqrami": "Server proqramı",
  cercive: "Çərçivə (framework)",
  cms: "CMS",
  "bulud-provayder": "Bulud provayderi",
};

type HostingApiReport = HostingReport & { url: string; status: number; checkedAt: string };

type State =
  | { phase: "idle" }
  | { phase: "loading"; url: string }
  | { phase: "done"; report: HostingApiReport }
  | { phase: "error"; message: string };

export function HostingTespitiTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(raw: string) {
    /* The route validates again; this copy only saves a doomed round trip and
       the rate-limit slot that goes with it. */
    const target = normalizeTargetUrl(raw);
    if (!target.ok) {
      setState({ phase: "error", message: target.error });
      return;
    }

    setState({ phase: "loading", url: target.url });
    try {
      const response = await fetch(`/api/alet/hosting-tespiti?unvan=${encodeURIComponent(target.url)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: HostingApiReport; message?: string };
      if (payload.ok && payload.data) {
        setState({ phase: "done", report: payload.data });
      } else {
        setState({ phase: "error", message: payload.message ?? "Sorğu alınmadı." });
      }
    } catch {
      setState({ phase: "error", message: "Serverlə əlaqə qurulmadı. Bir azdan yenidən yoxla." });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(input);
  }

  const busy = state.phase === "loading";

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Bu alət sorğunu serverə göndərir">
        Yazdığın domenə serverin özü HTTP sorğusu göndərir, sonra eyni domenin DNS qeydlərini və IP-nin
        RDAP qeydini soruşur — sənin brauzerin heç nəyə toxunmur.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="Ünvan"
          action={
            <>
              {EXAMPLES.map((example) => (
                <ToolButton
                  key={example}
                  size="chip"
                  disabled={busy}
                  onClick={() => {
                    setInput(example);
                    void run(example);
                  }}
                >
                  {example}
                </ToolButton>
              ))}
            </>
          }
        />

        <form onSubmit={onSubmit} className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <ToolField label="Domen adı" htmlFor="hosting-tespiti-unvan" className="min-w-56 flex-1">
              <ToolInput
                id="hosting-tespiti-unvan"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Yoxlanılır…" : "Tap"}
            </ToolButton>
          </div>
        </form>
      </ToolPanel>

      {state.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {state.message}
        </ToolNote>
      )}

      {state.phase === "loading" && (
        <p className="text-sm text-muted">
          <span className="font-mono">{state.url}</span> yoxlanılır…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: HostingApiReport }) {
  return (
    <div className="space-y-5">
      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">{report.url}</span> · HTTP {report.status} ·{" "}
        {formatAzStamp(new Date(report.checkedAt))}
      </p>

      <ToolResultPanel
        title="Tapılan əlamətlər"
        hint={report.detections.length === 0 ? "yoxdur" : `${report.detections.length} ədəd`}
      >
        <div className="space-y-3 p-3">
          {report.detections.length === 0 ? (
            <p className="text-sm/6 text-muted">Heç bir tanınan əlamət tapılmadı.</p>
          ) : (
            report.detections.map((detection, index) => <DetectionRow key={index} detection={detection} />)
          )}
        </div>
      </ToolResultPanel>

      <ToolPanel>
        <ToolPanelHeader title="Xam məlumat" />
        <div className="space-y-3 p-4">
          <div>
            <ToolLabel>IP ünvanı</ToolLabel>
            <p className="mt-1 font-mono text-sm">{report.address ?? "tapılmadı"}</p>
          </div>
          <div>
            <ToolLabel>RDAP təşkilatı</ToolLabel>
            <p className="mt-1 text-sm">{report.rdapOrg ?? "tapılmadı"}</p>
          </div>
          <div>
            <ToolLabel>ASN adı</ToolLabel>
            <p className="mt-1 text-sm">{report.asnName ?? "tapılmadı"}</p>
          </div>
          <div>
            <ToolLabel>generator meta teqi</ToolLabel>
            <p className="mt-1 font-mono text-sm break-all">{report.generator ?? "tapılmadı"}</p>
          </div>
          <div>
            <ToolLabel>CNAME zənciri</ToolLabel>
            {report.cnameChain.length === 0 ? (
              <p className="mt-1 text-sm text-muted">yoxdur</p>
            ) : (
              <p className="mt-1 font-mono text-sm break-all">{report.cnameChain.join(" → ")}</p>
            )}
          </div>
        </div>

        <ToolAccordion>
          <ToolAccordionItem
            summary="Cavab başlıqları"
            hint={report.relevantHeaders.length === 0 ? "yoxdur" : `${report.relevantHeaders.length} ədəd`}
            group="hosting-tespiti"
          >
            {report.relevantHeaders.length === 0 ? (
              <p className="text-sm/6 text-muted">Tanınan başlıqlardan heç biri gəlmədi.</p>
            ) : (
              <ul className="space-y-1">
                {report.relevantHeaders.map((header) => (
                  <li key={header.name} className="font-mono text-xs break-all">
                    <span className="text-muted">{header.name}:</span> {header.value}
                  </li>
                ))}
              </ul>
            )}
          </ToolAccordionItem>
        </ToolAccordion>
      </ToolPanel>
    </div>
  );
}

function DetectionRow({ detection }: { detection: Detection }) {
  return (
    <div className="border-l-2 border-l-accent pl-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-ios-subhead font-medium">{detection.name}</span>
        <span className="text-[11px] text-muted">{CATEGORY_LABELS[detection.category]}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {detection.reason} — <span className="font-mono">{detection.evidence}</span>
      </p>
    </div>
  );
}
