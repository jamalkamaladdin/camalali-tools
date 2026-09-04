"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp, formatDuration } from "../shared/az-date";
import { CopyButton } from "../shared/copy-button";
import {
  RECORD_TYPES,
  RECORD_TYPE_LABELS,
  RESOLVER_KIND_LABELS,
  type PropagationReport,
  type PropagationVerdict,
  type RecordType,
  type ResolverResult,
} from "../lib/dns-propaqasiya";
import {
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

/* Three record types that answer differently, so the first click shows the
   point rather than a single A record everyone already expects: an apex A
   record, a mail exchange and a zone's own delegation. */
const EXAMPLES: { domain: string; type: RecordType }[] = [
  { domain: "camalali.com", type: "A" },
  { domain: "google.com", type: "MX" },
  { domain: "cloudflare.com", type: "NS" },
];

type State =
  | { phase: "idle" }
  | { phase: "loading"; domain: string; type: RecordType }
  | { phase: "done"; report: PropagationReport }
  | { phase: "error"; message: string };

const STATUS_LABELS: Record<ResolverResult["status"], string> = {
  ok: "cavab verdi",
  timeout: "vaxt bitdi",
  error: "xəta",
};

const VERDICT_TITLES: Record<PropagationVerdict["kind"], string> = {
  agree: "Hamısı razılaşır",
  disagree: "Fərq var",
  "not-synced": "Mötəbər serverlər sinxron deyil",
  "no-data": "Nəticə yoxdur",
};

const VERDICT_TONES: Record<PropagationVerdict["kind"], "info" | "accent"> = {
  agree: "info",
  disagree: "accent",
  "not-synced": "accent",
  "no-data": "accent",
};

export function DnsPropaqasiyaTool() {
  const [domain, setDomain] = useState("");
  const [type, setType] = useState<RecordType>("A");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(rawDomain: string, rawType: RecordType) {
    const trimmed = rawDomain.trim();
    /* Full shape validation happens on the server, which is the only side
       that can safely resolve the name — this only saves a doomed round trip
       and a rate-limit slot for the one input that is obviously nothing. */
    if (trimmed === "") {
      setState({ phase: "error", message: "Boş sahə, domen adı yaz." });
      return;
    }

    setState({ phase: "loading", domain: trimmed, type: rawType });
    try {
      const response = await fetch(
        `/api/alet/dns-propaqasiya?domen=${encodeURIComponent(trimmed)}&tip=${rawType}`,
      );
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: PropagationReport; message?: string };
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
    void run(domain, type);
  }

  const busy = state.phase === "loading";

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Bu alət sorğunu serverə göndərir">
        Yazdığın domen adı və seçdiyin qeyd tipi bu saytın serverinə gedir. Server sənin əvəzinə
        yeddi ayrı DNS sorğusu göndərir: altı ictimai server və domenin öz ad serverləri. Başqa
        heç bir ünvana toxunulmur; cavab 30 saniyə saxlanılır.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="Domen və qeyd tipi"
          action={
            <>
              {EXAMPLES.map((example) => (
                <ToolButton
                  key={`${example.domain}-${example.type}`}
                  size="chip"
                  disabled={busy}
                  onClick={() => {
                    setDomain(example.domain);
                    setType(example.type);
                    void run(example.domain, example.type);
                  }}
                >
                  {example.domain} · {example.type}
                </ToolButton>
              ))}
            </>
          }
        />

        <form onSubmit={onSubmit} className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <ToolField label="Domen adı" htmlFor="dns-propaqasiya-domen" className="min-w-56 flex-1">
              <ToolInput
                id="dns-propaqasiya-domen"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolField label="Qeyd tipi" htmlFor="dns-propaqasiya-tip" className="w-36">
              <ToolSelect
                id="dns-propaqasiya-tip"
                value={type}
                onChange={(event) => setType(event.target.value as RecordType)}
              >
                {RECORD_TYPES.map((recordType) => (
                  <option key={recordType} value={recordType}>
                    {recordType}
                  </option>
                ))}
              </ToolSelect>
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Soruşulur…" : "Yoxla"}
            </ToolButton>
          </div>
          <p className="mt-2 text-ios-footnote text-muted">{RECORD_TYPE_LABELS[type]}</p>
        </form>
      </ToolPanel>

      {state.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {state.message}
        </ToolNote>
      )}

      {state.phase === "loading" && (
        <p className="font-ui text-sm text-muted">
          «{state.domain}» üçün {state.type} qeydi yeddi ad serverdən soruşulur…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: PropagationReport }) {
  const plain = report.resolvers
    .map((resolver) => {
      const answer =
        resolver.status === "ok"
          ? resolver.answers.length === 0
            ? "(boş)"
            : resolver.answers.join(", ")
          : STATUS_LABELS[resolver.status];
      return `${resolver.label}\t${resolver.address || ""}\t${answer}\t${
        resolver.ttlSeconds === null ? "-" : resolver.ttlSeconds
      }\t${resolver.ms === null ? "-" : resolver.ms}`;
    })
    .join("\n");

  return (
    <div className="space-y-5">
      <ToolNote tone={VERDICT_TONES[report.verdict.kind]} title={VERDICT_TITLES[report.verdict.kind]}>
        {report.verdict.message}
      </ToolNote>

      <div className="@container">
        <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          <ToolStat label="Cavab verdi" value={String(report.summary.ok)} />
          <ToolStat
            label="Vaxt bitdi"
            value={String(report.summary.timeout)}
            tone={report.summary.timeout > 0 ? "warning" : "default"}
          />
          <ToolStat
            label="Xəta"
            value={String(report.summary.error)}
            tone={report.summary.error > 0 ? "warning" : "default"}
          />
          <ToolStat label="Qeyd tipi" value={report.recordType} />
        </div>
      </div>

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">{report.domain}</span> ·{" "}
        {formatAzStamp(new Date(report.checkedAt))}
      </p>

      <ToolResultPanel
        title="Ad serverləri"
        hint={`${report.resolvers.length} server`}
        action={<CopyButton value={plain} label="cədvəli kopyala" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-ui text-xs">
            <thead>
              <tr className="border-b border-result-rule text-left text-muted">
                <th scope="col" className="p-2 font-normal">
                  Server
                </th>
                <th scope="col" className="p-2 font-normal">
                  Ünvan
                </th>
                <th scope="col" className="p-2 font-normal">
                  Cavab
                </th>
                <th scope="col" className="p-2 font-normal">
                  TTL
                </th>
                <th scope="col" className="p-2 font-normal">
                  ms
                </th>
              </tr>
            </thead>
            <tbody>
              {report.resolvers.map((resolver) => (
                <ResolverRow key={resolver.id} resolver={resolver} />
              ))}
            </tbody>
          </table>
        </div>
      </ToolResultPanel>
    </div>
  );
}

function ResolverRow({ resolver }: { resolver: ResolverResult }) {
  return (
    <tr
      className={`border-b border-result-rule align-top last:border-0 ${
        resolver.kind === "authoritative" ? "border-l-2 border-l-accent" : ""
      }`}
    >
      <td className="p-2">
        <div>{resolver.label}</div>
        <div className="text-[11px] text-muted">{RESOLVER_KIND_LABELS[resolver.kind]}</div>
      </td>
      <td className="p-2 font-mono break-all">{resolver.address || ""}</td>
      <td
        className={`max-w-64 p-2 font-mono break-all ${
          resolver.status === "error" ? "text-accent-text" : ""
        }`}
      >
        {resolver.status === "ok"
          ? resolver.answers.length === 0
            ? "(boş)"
            : resolver.answers.join(", ")
          : `${STATUS_LABELS[resolver.status]}${resolver.message ? `: ${resolver.message}` : ""}`}
      </td>
      <td className="p-2 tabular-nums">
        {resolver.ttlSeconds === null ? "" : formatDuration(resolver.ttlSeconds)}
      </td>
      <td className="p-2 tabular-nums">{resolver.ms === null ? "" : resolver.ms}</td>
    </tr>
  );
}
