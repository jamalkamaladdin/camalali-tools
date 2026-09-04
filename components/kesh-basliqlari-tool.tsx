"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { normalizeTargetUrl } from "../lib/safe-url";
import type { CacheHeadersReport } from "../lib/kesh-basliqlari";
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

type State =
  | { phase: "idle" }
  | { phase: "loading"; host: string }
  | { phase: "done"; report: CacheHeadersReport }
  | { phase: "error"; message: string };

function formatFreshness(seconds: number | null): string {
  if (seconds === null) return "təzəlik göstəricisi yoxdur";
  if (seconds === 0) return "0 saniyə: dərhal köhnəlmiş sayılır";
  if (seconds < 60) return `${seconds} saniyə`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} dəqiqə`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} saat`;
  return `${Math.round(seconds / 86_400)} gün`;
}

export function KeshBasliqlariTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(raw: string) {
    const target = normalizeTargetUrl(raw);
    if (!target.ok) {
      setState({ phase: "error", message: target.error });
      return;
    }

    setState({ phase: "loading", host: target.hostname });
    try {
      const response = await fetch(`/api/alet/kesh-basliqlari?unvan=${encodeURIComponent(target.url)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: CacheHeadersReport; message?: string };
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
        Yazdığın ünvana sənin brauzerin yox, bu saytın serveri bir HEAD sorğusu göndərir:
        səhifənin gövdəsi ümumiyyətlə yüklənmir, yalnız başlıqlar oxunur.
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
            <ToolField label="Ünvan" htmlFor="kesh-basliqlari-unvan" className="min-w-56 flex-1">
              <ToolInput
                id="kesh-basliqlari-unvan"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="example.com/sehife"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Oxunur…" : "Oxu"}
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
          <span className="font-mono">{state.host}</span> oxunur…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: CacheHeadersReport }) {
  const { directives } = report;

  return (
    <div className="space-y-5">
      <ToolResultPanel title="Nəticə" hint={String(report.status)}>
        <div className="@container p-4">
          <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
            <ToolStat
              label="Saxlanır?"
              value={report.storable ? "bəli" : "xeyr"}
              tone={report.storable ? "default" : "warning"}
              note={report.storable ? undefined : "no-store"}
            />
            <ToolStat label="Təzəlik müddəti" value={formatFreshness(report.freshForSeconds)} />
            <ToolStat
              label="CDN saxlaya bilər?"
              value={report.cacheableByCdn ? "bəli" : "xeyr"}
            />
            <ToolStat
              label="Şərti sorğu mümkündür?"
              value={report.conditionalRequestReady ? "bəli" : "xeyr"}
              note={report.etag.weak ? "ETag zəifdir (W/)" : undefined}
            />
          </div>
        </div>
      </ToolResultPanel>

      {report.conflicts.length > 0 && (
        <ToolResultPanel title="Ziddiyyətlər" hint={`${report.conflicts.length} bənd`}>
          <ul className="space-y-3 p-3">
            {report.conflicts.map((conflict, index) => (
              <li key={index} className="border-l-2 border-l-accent pl-3 text-sm/6">
                {conflict.message}
              </li>
            ))}
          </ul>
        </ToolResultPanel>
      )}

      <ToolPanel>
        <ToolPanelHeader title="Xam başlıqlar" />
        <dl className="space-y-2 p-3 font-mono text-xs">
          <HeaderRow name="Cache-Control" value={directives.raw} />
          <HeaderRow name="ETag" value={report.etag.value} />
          <HeaderRow name="Last-Modified" value={report.lastModified} />
          <HeaderRow name="Vary" value={report.vary.length > 0 ? report.vary.join(", ") : null} />
          <HeaderRow name="Age" value={report.ageSeconds !== null ? `${report.ageSeconds}` : null} />
        </dl>
      </ToolPanel>

      {report.varyIsWildcard && (
        <p className="text-[11px]">
          <span className="rounded-sm px-1.5 text-ink" style={{ backgroundColor: accentWash }}>
            Vary: *
          </span>
        </p>
      )}

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">{report.url}</span> · {formatAzStamp(new Date(report.checkedAt))}
      </p>
    </div>
  );
}

function HeaderRow({ name, value }: { name: string; value: string | null }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-rule pb-2 last:border-0 last:pb-0">
      <dt className="w-40 shrink-0 text-muted">{name}</dt>
      <dd className="min-w-0 flex-1 break-all">{value ?? ""}</dd>
    </div>
  );
}
