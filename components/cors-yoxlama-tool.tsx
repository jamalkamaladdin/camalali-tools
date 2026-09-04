"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { normalizeTargetUrl } from "../lib/safe-url";
import {
  normalizeOriginInput,
  parseRequestHeadersInput,
  type CorsFinding,
  type CorsPhaseReport,
  type CorsReport,
} from "../lib/cors-yoxlama";
import {
  accentWash,
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolStat,
} from "./ui";

const METHODS = ["POST", "PUT", "PATCH", "DELETE", "GET"] as const;

const EXAMPLE = { unvan: "api.github.com", menbe: "https://camalali.com" };

const SEVERITY_WORDS: Record<CorsFinding["severity"], string> = {
  xeta: "xəta",
  xeberdarliq: "xəbərdarlıq",
  melumat: "məlumat",
};

type CorsApiReport = CorsReport & { url: string; checkedAt: string };

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; report: CorsApiReport }
  | { phase: "error"; message: string };

export function CorsYoxlamaTool() {
  const [target, setTarget] = useState("");
  const [origin, setOrigin] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("POST");
  const [headersInput, setHeadersInput] = useState("Content-Type, Authorization");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(rawTarget: string, rawOrigin: string, rawMethod: string, rawHeaders: string) {
    /* The route validates again; this copy only saves a doomed round trip and
       the rate-limit slot that goes with it. */
    const targetCheck = normalizeTargetUrl(rawTarget);
    if (!targetCheck.ok) {
      setState({ phase: "error", message: targetCheck.error });
      return;
    }
    const originCheck = normalizeOriginInput(rawOrigin);
    if (!originCheck.ok) {
      setState({ phase: "error", message: originCheck.error });
      return;
    }
    const headersCheck = parseRequestHeadersInput(rawHeaders);
    if (!headersCheck.ok) {
      setState({ phase: "error", message: headersCheck.error });
      return;
    }

    setState({ phase: "loading" });
    try {
      const params = new URLSearchParams({
        unvan: targetCheck.url,
        menbe: originCheck.origin,
        metod: rawMethod,
        basliqlar: headersCheck.headers.join(","),
      });
      const response = await fetch(`/api/alet/cors-yoxlama?${params.toString()}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: CorsApiReport; message?: string };
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
    void run(target, origin, method, headersInput);
  }

  const busy = state.phase === "loading";

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Bu alət iki sorğu göndərir">
        Yazdığın hədəfə serverin özü Origin başlıqlı sadə GET və OPTIONS preflight göndərir — sənin
        brauzerin heç nəyə toxunmur. Sınadığın mənbə (Origin) yalnız bu iki sorğunun başlığında gedir,
        başqa heç bir xidmətə ötürülmür.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="Sınaq"
          action={
            <ToolButton
              size="chip"
              disabled={busy}
              onClick={() => {
                setTarget(EXAMPLE.unvan);
                setOrigin(EXAMPLE.menbe);
                void run(EXAMPLE.unvan, EXAMPLE.menbe, method, headersInput);
              }}
            >
              Nümunə
            </ToolButton>
          }
        />

        <form onSubmit={onSubmit} className="@container">
          <div className="grid gap-4 p-4 @min-[34rem]:grid-cols-2">
            <ToolField label="Hədəf ünvan" htmlFor="cors-target">
              <ToolInput
                id="cors-target"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="api.example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>

            <ToolField label="Mənbə (Origin)" htmlFor="cors-origin" note="Brauzerdə açıq olduğunu düşündüyün sayt.">
              <ToolInput
                id="cors-origin"
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                placeholder="https://sayt.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>

            <ToolField label="Metod" htmlFor="cors-method">
              <ToolSelect
                id="cors-method"
                value={method}
                onChange={(event) => setMethod(event.target.value as (typeof METHODS)[number])}
              >
                {METHODS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </ToolSelect>
            </ToolField>

            <ToolField
              label="Başlıqlar"
              htmlFor="cors-headers"
              hint="vergüllə"
              note="Preflight-ın Access-Control-Request-Headers başlığına yazılacaq siyahı."
            >
              <ToolInput
                id="cors-headers"
                value={headersInput}
                onChange={(event) => setHeadersInput(event.target.value)}
                placeholder="Content-Type, Authorization"
                spellCheck={false}
                autoComplete="off"
              />
            </ToolField>
          </div>

          <div className="flex justify-end px-4 pb-4">
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

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: CorsApiReport }) {
  return (
    <div className="space-y-5">
      <div className="@container">
        <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          <ToolStat
            label="Sadə GET"
            value={report.simple.originVerdict.allowed ? "oxuna bilər" : "gizlədilir"}
            tone={report.simple.originVerdict.allowed ? "accent" : "warning"}
          />
          <ToolStat
            label={`Preflight (${report.method})`}
            value={report.overallAllowed ? "icazəlidir" : "icazəsizdir"}
            tone={report.overallAllowed ? "accent" : "warning"}
          />
          <ToolStat label="Metod" value={report.preflight.methodVerdict.allowed ? "uyğundur" : "yoxdur"} />
          <ToolStat label="Başlıqlar" value={report.preflight.headersVerdict.allowed ? "hamısı var" : "çatışmır"} />
        </div>
      </div>

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">{report.url}</span> · {formatAzStamp(new Date(report.checkedAt))}
      </p>

      {report.findings.length > 0 && (
        <ToolResultPanel title="Tapılanlar" hint={`${report.findings.length} bənd`}>
          <div className="space-y-3 p-3">
            {report.findings.map((finding) => (
              <div key={finding.id} className="border-l-2 border-l-accent pl-3">
                <p className="font-ui text-[11px] text-muted">{SEVERITY_WORDS[finding.severity]}</p>
                <p className="mt-1 text-sm/6">{finding.message}</p>
              </div>
            ))}
          </div>
        </ToolResultPanel>
      )}

      <PhasePanel title="Sadə GET (Origin başlığı ilə)" phase={report.simple} />
      <PreflightPanel report={report} />
    </div>
  );
}

function PhasePanel({ title, phase }: { title: string; phase: CorsPhaseReport }) {
  return (
    <ToolPanel>
      <ToolPanelHeader title={title} hint={`HTTP ${phase.status}`} />
      <div className="space-y-2 p-4">
        <VerdictLine label="Mənbə (Origin)" verdict={phase.originVerdict} />
        <HeaderTable headers={phase.headers} />
      </div>
    </ToolPanel>
  );
}

function PreflightPanel({ report }: { report: CorsApiReport }) {
  const phase = report.preflight;
  return (
    <ToolPanel>
      <ToolPanelHeader title="OPTIONS preflight" hint={`HTTP ${phase.status}`} />
      <div className="space-y-2 p-4">
        <VerdictLine label="Mənbə (Origin)" verdict={phase.originVerdict} />
        <VerdictLine label={`Metod (${report.method})`} verdict={phase.methodVerdict} />
        <VerdictLine
          label="Başlıqlar"
          verdict={{ allowed: phase.headersVerdict.allowed, reason: phase.headersVerdict.reason }}
        />
        <HeaderTable headers={phase.headers} />
      </div>
    </ToolPanel>
  );
}

function VerdictLine({ label, verdict }: { label: string; verdict: { allowed: boolean; reason: string } }) {
  return (
    <div className={`border-l-2 pl-3 ${verdict.allowed ? "border-l-rule" : "border-l-accent"}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-ios-subhead font-medium">{label}</span>
        <span
          className={`text-[11px] ${verdict.allowed ? "text-muted" : "rounded-[2px] px-1.5 text-ink"}`}
          style={verdict.allowed ? undefined : { backgroundColor: accentWash }}
        >
          {verdict.allowed ? "icazəli" : "icazəsiz"}
        </span>
      </div>
      <p className="mt-1 text-[11px] break-words text-muted">{verdict.reason}</p>
    </div>
  );
}

function HeaderTable({ headers }: { headers: CorsPhaseReport["headers"] }) {
  const rows: { name: string; value: string | null }[] = [
    { name: "Access-Control-Allow-Origin", value: headers.allowOrigin },
    { name: "Access-Control-Allow-Methods", value: headers.allowMethods },
    { name: "Access-Control-Allow-Headers", value: headers.allowHeaders },
    { name: "Access-Control-Allow-Credentials", value: headers.allowCredentials },
    { name: "Access-Control-Max-Age", value: headers.maxAge },
    { name: "Access-Control-Expose-Headers", value: headers.exposeHeaders },
  ];

  return (
    <ToolAccordion>
      <ToolAccordionItem summary="Xam CORS başlıqları" group="cors-yoxlama">
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.name} className="font-mono text-xs break-all">
              <span className="text-muted">{row.name}:</span>{" "}
              {row.value === null ? <span className="text-muted">(yoxdur)</span> : row.value}
            </li>
          ))}
        </ul>
      </ToolAccordionItem>
    </ToolAccordion>
  );
}
