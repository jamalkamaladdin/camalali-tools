"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { normalizeDomain } from "../lib/dns";
import type { DnssecReport } from "../lib/dnssec";
import { ToolButton, ToolField, ToolInput, ToolNote, ToolPanel, ToolPanelHeader, ToolResultPanel } from "./ui";

const EXAMPLES = ["camalali.com", "cloudflare.com", "github.com"];

type State =
  | { phase: "idle" }
  | { phase: "loading"; domain: string }
  | { phase: "done"; report: DnssecReport }
  | { phase: "error"; message: string };

export function DnssecTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(raw: string) {
    const checked = normalizeDomain(raw);
    if (!checked.ok) {
      setState({ phase: "error", message: checked.error });
      return;
    }

    setState({ phase: "loading", domain: checked.domain });
    try {
      const response = await fetch(`/api/alet/dnssec?domen=${encodeURIComponent(checked.domain)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: DnssecReport; message?: string };
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
      <ToolNote tone="accent" title="Bu alət DS/DNSKEY/RRSIG-i oxuya bilmir">
        Node-un DNS modulu bu üç tipi sorğulaya bilmir: modulun özü xəta atır, şəbəkəyə çıxmır. Alət
        əvəzinə valideyn zonanın domenə göstərdiyi ad serverlərini domenin öz elan etdiyi siyahı ilə
        tutuşdurur. Aşağıda niyə izah olunur.
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
            <ToolField label="Domen adı" htmlFor="dnssec-domen" className="min-w-56 flex-1">
              <ToolInput
                id="dnssec-domen"
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

      {state.phase === "loading" && <p className="font-ui text-sm text-muted">«{state.domain}» üçün delegasiya yoxlanır…</p>}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: DnssecReport }) {
  const { delegation } = report;

  return (
    <div className="space-y-5">
      {delegation.ok ? (
        <ToolNote tone={delegation.consistent ? "info" : "accent"} title="Delegasiya">
          {delegation.consistent
            ? "Valideyn zona ilə domenin öz elan etdiyi ad serverləri üst-üstə düşür."
            : "Uyğunsuzluq tapıldı: aşağıda hansı ad serverinin harada olduğuna bax."}
        </ToolNote>
      ) : (
        <ToolNote tone="accent" title="Delegasiya yoxlanmadı">
          {delegation.message}
        </ToolNote>
      )}

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">{report.domain}</span> · {formatAzStamp(new Date(report.checkedAt))}
      </p>

      {delegation.ok && (
        <ToolResultPanel title="Ad serverləri" hint={`valideyn zona: ${delegation.parentZone}`}>
          <div className="grid gap-4 p-3 md:grid-cols-2">
            <NsList title="Domenin özü elan edir" names={delegation.childNs} highlight={delegation.onlyChild} />
            <NsList title={`Valideyn (${delegation.parentZone}) göstərir`} names={delegation.parentNs} highlight={delegation.onlyParent} />
          </div>
          {delegation.matches.length > 0 && (
            <p className="border-t border-rule p-3 font-ui text-[11px] text-muted">
              Üst-üstə düşən {delegation.matches.length} ad: {delegation.matches.join(", ")}
            </p>
          )}
        </ToolResultPanel>
      )}

      <ToolNote title={`Ölçülə bilmədi: ${report.unmeasurable.join(", ")}`}>{report.explanation}</ToolNote>
    </div>
  );
}

function NsList({ title, names, highlight }: { title: string; names: string[]; highlight: string[] }) {
  const highlighted = new Set(highlight);
  return (
    <div>
      <p className="font-ui text-[11px] text-muted">{title}</p>
      {names.length === 0 ? (
        <p className="mt-1 text-sm text-muted">tapılmadı</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {names.map((name) => (
            <li key={name} className={`font-mono text-xs break-all ${highlighted.has(name) ? "text-accent-text" : ""}`}>
              {name}
              {highlighted.has(name) && ": tək tərəfdə"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
