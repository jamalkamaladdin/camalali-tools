"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp, formatDuration } from "../shared/az-date";
import {
  DNS_TYPE_NOTES,
  normalizeDomain,
  TXT_KIND_LABELS,
  type DnsReport,
  type DnsSection,
  type TxtInsight,
} from "../lib/dns";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";

/* Three domains that answer differently, so the first click is worth making:
   a Google domain has a full mail policy, this site has none, and a bare
   registrar parking page has neither MX nor CAA. */
const EXAMPLES = ["camalali.com", "google.com", "github.com"];

type State =
  | { phase: "idle" }
  | { phase: "loading"; domain: string }
  | { phase: "done"; report: DnsReport }
  | { phase: "error"; message: string };

export function DnsTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(raw: string) {
    /* The same validator the route uses, run here first so a typo costs a
       keystroke rather than a round trip and a slot in the rate limiter. */
    const checked = normalizeDomain(raw);
    if (!checked.ok) {
      setState({ phase: "error", message: checked.error });
      return;
    }

    setState({ phase: "loading", domain: checked.domain });
    try {
      const response = await fetch(`/api/alet/dns?domen=${encodeURIComponent(checked.domain)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: DnsReport; message?: string };
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
      {/* The promise this tool makes is the opposite of the other tools' — it
          has to be readable before the visitor types, not after. */}
      <ToolNote tone="accent" title="Bu alət sorğunu serverə göndərir">
        Yazdığın domen adı bu saytın serverinə, oradan da həmin domenin ad serverlərinə gedir.
        Başqa heç bir xidmətə müraciət olunmur; cavab 60 saniyə saxlanılır.
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
            <ToolField
              label="Domen adı"
              htmlFor="dns-domain"
              className="min-w-56 flex-1"
              note="Sxem, yol və başındakı «www» yazıla bilər: alət onları özü təmizləyir."
            >
              <ToolInput
                id="dns-domain"
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
        <p className="font-ui text-sm text-muted">
          «{state.domain}» üçün səkkiz qeyd tipi soruşulur…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: DnsReport }) {
  const plain = report.sections
    .filter((section) => section.records.length > 0)
    .flatMap((section) =>
      section.records.map(
        (record) =>
          `${report.domain}\t${section.type}\t${record.priority !== undefined ? `${record.priority} ` : ""}${record.value}`,
      ),
    )
    .join("\n");

  return (
    <div className="space-y-5">
      {report.findings.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {report.findings.map((finding) => (
            <ToolNote key={finding.title} tone={finding.tone} title={finding.title}>
              {finding.text}
            </ToolNote>
          ))}
        </div>
      ) : (
        /* An empty findings list is a result, not an absence: a domain with
           A, AAAA, MX, SPF, DMARC and CAA all in order produces nothing to
           warn about, and silence there reads as a broken tool. */
        <ToolNote title="Diqqət çəkən qüsur tapılmadı">
          Ünvan, poçt və sertifikat qeydləri yerindədir.
        </ToolNote>
      )}

      <ToolResultPanel
        title={report.domain}
        hint={<span>{formatAzStamp(new Date(report.checkedAt))}</span>}
        action={<CopyButton value={plain} label="qeydləri kopyala" />}
      >
        <div className="space-y-4 p-3">
          {report.sections.map((section) => (
            <Section key={section.type} section={section} />
          ))}
        </div>
      </ToolResultPanel>

      {(report.txt.length > 0 || report.dmarc) && (
        <ToolResultPanel title="Siyasət qeydləri" hint="SPF · DMARC · DKIM">
          <div className="space-y-3 p-3">
            {report.dmarc && (
              <InsightRow
                insight={report.dmarc.insight}
                source={report.dmarc.name}
                value={report.dmarc.value}
              />
            )}
            {report.txt.map((insight, index) => (
              <InsightRow
                key={`${insight.kind}-${index}`}
                insight={insight}
                source={report.domain}
                value={insight.value}
              />
            ))}
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}

function Section({ section }: { section: DnsSection }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-mono text-xs font-semibold">{section.type}</h3>
        <p className="min-w-0 flex-1 font-ui text-[11px] text-muted">
          {DNS_TYPE_NOTES[section.type]}
        </p>
      </div>

      {section.records.length === 0 ? (
        <p className="mt-1.5 font-ui text-xs text-muted">{section.message}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {section.records.map((record, index) => (
            <li
              key={`${record.value}-${index}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-rule pl-3"
            >
              {record.priority !== undefined && (
                <span className="font-ui text-xs tabular-nums text-muted">
                  {record.priority}
                </span>
              )}
              <span className="min-w-0 flex-1 font-mono text-sm break-all">{record.value}</span>
              <span className="font-ui text-[11px] text-muted">
                {/* A dash is the honest reading here: Node's resolver simply
                    does not report TTL outside A and AAAA. */}
                {record.ttl === null ? "TTL —" : `TTL ${formatDuration(record.ttl)}`}
              </span>
              {record.note !== undefined && (
                <p className="w-full font-ui text-[11px] text-muted">{record.note}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InsightRow({
  insight,
  source,
  value,
}: {
  insight: TxtInsight;
  source: string;
  value: string;
}) {
  /* A note rather than a `ToolStat`: the interesting part is a sentence, and
     `ToolStat` sets its value in 18px semibold for a number. */
  return (
    <ToolNote
      tone={insight.weak ? "accent" : "info"}
      title={`${TXT_KIND_LABELS[insight.kind]} · ${source}`}
    >
      <p>{insight.note}</p>
      <p className="mt-1.5 font-mono text-[11px] break-all text-muted">{value}</p>
    </ToolNote>
  );
}
