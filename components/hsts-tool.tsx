"use client";

import { useState, type FormEvent } from "react";
import { normalizeTargetUrl } from "../lib/safe-url";
import type { HstsReport } from "../lib/hsts";
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
  | { phase: "done"; host: string; report: HstsReport }
  | { phase: "error"; message: string };

export function HstsTool() {
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
      const response = await fetch(`/api/alet/hsts?unvan=${encodeURIComponent(target.url)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: HstsReport; message?: string };
      if (payload.ok && payload.data) {
        setState({ phase: "done", host: target.hostname, report: payload.data });
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
      <ToolNote tone="accent" title="Bu alət iki sorğu göndərir">
        Yazdığın domenə https və http üzərindən ayrı-ayrı bir HEAD sorğusu göndərilir: sənin
        brauzerin yox, bu saytın serveri. Səhifənin gövdəsi yüklənmir, yalnız başlıqlar oxunur.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="Domen"
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
            <ToolField label="Domen adı" htmlFor="hsts-domen" className="min-w-56 flex-1">
              <ToolInput
                id="hsts-domen"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Yoxlanır…" : "Yoxla"}
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
          <span className="font-mono">{state.host}</span> yoxlanır…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function StrengthLabel({ strength }: { strength: HstsReport["maxAgeStrength"] }) {
  if (strength === "yaxsi") return <>güclü</>;
  if (strength === "zeif") return <>zəif</>;
  return <>yoxdur</>;
}

function Report({ report }: { report: HstsReport }) {
  return (
    <div className="space-y-5">
      <ToolResultPanel title="Nəticə" hint={report.present ? "başlıq var" : "başlıq yoxdur"}>
        <div className="@container p-4">
          <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-3">
            <ToolStat
              label="max-age"
              value={report.humanMaxAge ?? ""}
              tone={report.maxAgeStrength === "yaxsi" ? "default" : "warning"}
              note={<StrengthLabel strength={report.maxAgeStrength} />}
            />
            <ToolStat
              label="includeSubDomains"
              value={report.directives?.includeSubDomains ? "var" : "yoxdur"}
            />
            <ToolStat label="preload" value={report.directives?.preload ? "var" : "yoxdur"} />
          </div>
        </div>
      </ToolResultPanel>

      <ToolNote tone="accent" title="Xülasə">
        {report.summary}
      </ToolNote>

      {report.httpLeaksHeader && (
        <ToolNote tone="accent" title="Http cavabında da başlıq var">
          Bu, plain http cavabında da göndərilir. RFC 6797-yə görə brauzer başlığı yalnız https
          cavabında qəbul edir: http üzərindəki nüsxə heç bir qorumaya təsir etmir, sadəcə lazımsız
          bir sətirdir.
        </ToolNote>
      )}

      <ToolPanel>
        <ToolPanelHeader
          title="Preload siyahısı üçün şərtlər"
          hint={report.preloadEligible ? "hamısı ödənir" : "çatmır"}
        />
        <ul className="space-y-2 p-3">
          {report.preloadRequirements.map((requirement, index) => (
            <li
              key={index}
              className={`border-l-2 pl-3 text-sm/6 ${requirement.met ? "border-l-rule text-muted" : "border-l-accent"}`}
            >
              <span
                className={requirement.met ? undefined : "-mx-1 rounded-sm px-1 text-ink"}
                style={requirement.met ? undefined : { backgroundColor: accentWash }}
              >
                {requirement.met ? "ödənir" : "çatmır"}
              </span>{" "}
              : {requirement.label}
            </li>
          ))}
        </ul>
      </ToolPanel>

      {report.httpRedirectsToHttps !== null && (
        <p className="text-[11px] text-muted">
          http → https yönləndirməsi:{" "}
          <span className="font-mono">{report.httpRedirectsToHttps ? "var" : "yoxdur"}</span>
        </p>
      )}
    </div>
  );
}
