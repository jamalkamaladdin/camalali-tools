"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { checkIpAddress } from "../lib/ptr";
import type { PtrReport } from "../lib/ptr";
import { accentWash, ToolButton, ToolField, ToolInput, ToolNote, ToolPanel, ToolPanelHeader, ToolResultPanel } from "./ui";

const EXAMPLES = ["8.8.8.8", "1.1.1.1"];

type State =
  | { phase: "idle" }
  | { phase: "loading"; ip: string }
  | { phase: "done"; report: PtrReport }
  | { phase: "error"; message: string };

export function PtrTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(raw: string) {
    const checked = checkIpAddress(raw);
    if (!checked.ok) {
      setState({ phase: "error", message: checked.error });
      return;
    }

    setState({ phase: "loading", ip: checked.ip });
    try {
      const response = await fetch(`/api/alet/ptr?ip=${encodeURIComponent(checked.ip)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: PtrReport; message?: string };
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
        Yazdığın IP ünvanı bu saytın serverinə gedir, server tərs DNS və irəli təsdiq sorğusunu özü
        göndərir — sənin brauzerin heç bir DNS sorğusu göndərmir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="IP ünvanı"
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
            <ToolField label="IPv4 və ya IPv6" htmlFor="ptr-ip" className="min-w-56 flex-1">
              <ToolInput
                id="ptr-ip"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="93.184.216.34"
                spellCheck={false}
                autoComplete="off"
                inputMode="text"
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

      {state.phase === "loading" && <p className="font-ui text-sm text-muted">«{state.ip}» üçün PTR qeydi axtarılır…</p>}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: PtrReport }) {
  return (
    <div className="space-y-5">
      <ToolNote tone={report.consistent ? "info" : "accent"} title={report.ptrNames.length === 0 ? "PTR qeydi yoxdur" : "Nəticə"}>
        {report.ptrNames.length === 0
          ? "Bu ünvana bağlı heç bir tərs DNS qeydi tapılmadı. Bu, xəta deyil — PTR qeydi könüllüdür."
          : report.consistent
            ? "Ən azı bir PTR adı irəli istiqamətdə eyni ünvana qayıdır — irəli-geri uyğunluq var."
            : "Heç bir PTR adı irəli istiqamətdə eyni ünvana qayıtmır — irəli-geri uyğunsuzluq var."}
      </ToolNote>

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">
          {report.ip} · IPv{report.family}
        </span>{" "}
        · {formatAzStamp(new Date(report.checkedAt))}
      </p>

      {report.checks.length > 0 && (
        <ToolResultPanel title="PTR adları" hint={`${report.checks.length} ədəd`}>
          <div className="space-y-2 p-3">
            {report.checks.map((item) => (
              <div key={item.hostname} className={`border-l-2 pl-3 ${item.matchesOriginal ? "border-l-rule" : "border-l-accent"}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm break-all">{item.hostname}</span>
                  <span
                    className={`text-[11px] ${item.matchesOriginal ? "rounded-[2px] px-1.5 text-ink" : "text-muted"}`}
                    style={item.matchesOriginal ? { backgroundColor: accentWash } : undefined}
                  >
                    {item.matchesOriginal ? "geri qayıdır" : "qayıtmır"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] break-all text-muted">
                  {item.forwardError
                    ? `İrəli sorğu alınmadı: ${item.forwardError}`
                    : item.forwardAddresses.length > 0
                      ? `İrəli həll: ${item.forwardAddresses.join(", ")}`
                      : "İrəli sorğu heç bir ünvan qaytarmadı."}
                </p>
              </div>
            ))}
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}
