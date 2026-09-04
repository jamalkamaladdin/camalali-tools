"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { normalizeTargetUrl } from "../lib/safe-url";
import type { MixedContentFinding, MixedContentReport } from "../lib/qarisiq-mezmun";
import {
  accentWash,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

const EXAMPLES = ["camalali.com", "github.com", "wikipedia.org"];

const KIND_LABELS: Record<MixedContentFinding["kind"], string> = {
  img: "Şəkil",
  script: "Skript",
  link: "Link (stil/icon)",
  iframe: "iframe",
  video: "Video",
  audio: "Audio",
  source: "Mənbə (source)",
  form: "Forma hədəfi",
  "inline-style": "CSS url()",
};

type MixedContentApiReport = MixedContentReport & { url: string; status: number; truncated: boolean; checkedAt: string };

type State =
  | { phase: "idle" }
  | { phase: "loading"; url: string }
  | { phase: "done"; report: MixedContentApiReport }
  | { phase: "error"; message: string };

export function QarisiqMezmunTool() {
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
      const response = await fetch(`/api/alet/qarisiq-mezmun?unvan=${encodeURIComponent(target.url)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: MixedContentApiReport; message?: string };
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
      <ToolNote tone="accent" title="Bu alət yalnız HTML mətnini oxuyur">
        Server yazdığın səhifənin HTML mətnini bir dəfə gətirir — tapılan şəkil, skript, iframe kimi
        resursların özü heç vaxt yüklənmir, yalnız HTML-dəki ünvanlar oxunur.
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
            <ToolField label="Səhifə ünvanı" htmlFor="qarisiq-mezmun-unvan" className="min-w-56 flex-1">
              <ToolInput
                id="qarisiq-mezmun-unvan"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://sayt.com/sehife"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Yoxlanılır…" : "Yoxla"}
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
          <span className="font-mono">{state.url}</span> gətirilir…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: MixedContentApiReport }) {
  if (!report.applicable) {
    return (
      <ToolNote tone="info" title="Bu ünvan https deyil">
        Qarışıq məzmun anlayışı yalnız https səhifəyə aiddir — bu ünvan artıq https ilə açılmır, ona görə
        müqayisə üçün əsas yoxdur.
      </ToolNote>
    );
  }

  return (
    <div className="space-y-5">
      <div className="@container">
        <div className="grid gap-3 @min-[30rem]:grid-cols-3">
          <ToolStat label="Tapılan" value={String(report.findings.length)} />
          <ToolStat
            label="Bloklanır"
            value={String(report.blockedCount)}
            tone={report.blockedCount > 0 ? "warning" : "default"}
          />
          <ToolStat label="Passiv" value={String(report.passiveCount)} />
        </div>
      </div>

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">{report.url}</span> · {formatAzStamp(new Date(report.checkedAt))}
      </p>

      {report.upgradeInsecureRequests && (
        <ToolNote tone="info" title="upgrade-insecure-requests aktivdir">
          Bu səhifənin CSP-si brauzerə bütün http:// istinadları özü https-ə çevirməyi əmr edir — tapılan
          resurslar aşağıda yenə göstərilir, amma server https cavab versə heç biri həqiqətən http ilə
          yüklənmir.
        </ToolNote>
      )}

      <ToolResultPanel
        title="Tapılan resurslar"
        hint={report.findings.length === 0 ? "yoxdur" : `${report.findings.length} ədəd`}
      >
        <div className="space-y-3 p-3">
          {report.findings.length === 0 ? (
            <p className="text-sm/6 text-muted">http:// ilə yüklənən resurs tapılmadı.</p>
          ) : (
            report.findings.map((finding, index) => <FindingRow key={index} finding={finding} />)
          )}
        </div>
      </ToolResultPanel>

      {report.truncated && (
        <ToolNote tone="info">
          Səhifə byte büdcəsindən uzun idi və oxunuşu kəsildi — nəticə səhifənin yalnız oxunmuş hissəsinə
          aiddir.
        </ToolNote>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: MixedContentFinding }) {
  return (
    <div className={`border-l-2 pl-3 ${finding.blocked ? "border-l-accent" : "border-l-rule"}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-ios-subhead font-medium">{KIND_LABELS[finding.kind]}</span>
        <span
          className={`text-[11px] ${finding.blocked ? "rounded-[2px] px-1.5 text-ink" : "text-muted"}`}
          style={finding.blocked ? { backgroundColor: accentWash } : undefined}
        >
          {finding.blocked ? "bloklanır" : "passiv"}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs break-all">{finding.url}</p>
      <p className="mt-1 text-[11px] text-muted">{finding.note}</p>
    </div>
  );
}
