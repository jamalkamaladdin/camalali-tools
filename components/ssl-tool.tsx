"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { CopyButton } from "../shared/copy-button";
import { normalizeTargetUrl } from "../lib/safe-url";
import type { SslReport } from "../lib/ssl";
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
  ToolStat,
} from "./ui";

const EXAMPLES = ["camalali.com", "github.com", "wikipedia.org"];

type State =
  | { phase: "idle" }
  | { phase: "loading"; host: string }
  | { phase: "done"; report: SslReport }
  | { phase: "error"; message: string };

export function SslTool() {
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
      const response = await fetch(`/api/alet/ssl?domen=${encodeURIComponent(target.hostname)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: SslReport; message?: string };
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
        Yazdığın domenin 443 portuna bu saytın serveri özü TLS bağlantısı açır: sənin brauzerin heç
        bir sertifikat mərkəzinə müraciət etmir. Ünvan əvvəlcə DNS-də həll olunur, bağlantı yalnız
        çıxan ünvana qurulur.
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
            <ToolField label="Domen adı" htmlFor="ssl-domen" className="min-w-56 flex-1">
              <ToolInput
                id="ssl-domen"
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
        <p className="font-ui text-sm text-muted">«{state.host}» ilə TLS əlsıxması aparılır…</p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: SslReport }) {
  return (
    <div className="space-y-5">
      <div className="@container">
        <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          <ToolStat
            label="Müddət"
            value={`${report.expiry.daysLeft} gün`}
            tone={report.expiry.tone}
            note={report.expiry.tone === "warning" ? "diqqət" : undefined}
          />
          <ToolStat label="Protokol" value={report.protocol ?? ""} />
          <ToolStat label="Sertifikat sayı" value={String(report.chain.length)} />
          <ToolStat label="Əlsıxma vaxtı" value={`${report.ms} ms`} />
        </div>
      </div>

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">
          {report.hostname} → {report.address}:{report.port}
        </span>{" "}
        · {formatAzStamp(new Date(report.checkedAt))}
      </p>

      <div className="grid gap-3 @container md:grid-cols-2">
        <ToolNote tone={report.trusted ? "info" : "accent"} title="Etibar">
          {report.trustMessage}
        </ToolNote>
        <ToolNote tone={report.name.matches ? "info" : "accent"} title="Ad uyğunluğu">
          {report.name.message}
        </ToolNote>
        <ToolNote tone={report.chainInfo.hasIntermediate ? "info" : "accent"} title="Zəncir">
          {report.chainInfo.message}
        </ToolNote>
        <ToolNote tone={report.key.weak ? "accent" : "info"} title="Açar">
          {report.key.message}
        </ToolNote>
      </div>

      {report.cipher && (
        <p className="font-ui text-xs text-muted">
          Şifrə dəsti: <span className="font-mono">{report.cipher.name}</span> ({report.cipher.version})
        </p>
      )}

      <ToolResultPanel title="Sertifikat zənciri" hint={`${report.chain.length} ədəd`}>
        <ToolAccordion>
          {report.chain.map((cert, index) => (
            <ToolAccordionItem
              key={`${cert.fingerprint256}-${index}`}
              group="ssl-chain"
              defaultOpen={index === 0}
              summary={index === 0 ? "Leaf sertifikat" : cert.isCa ? `Aralıq/kök #${index}` : `#${index}`}
              hint={cert.subject}
            >
              <div className="space-y-1.5">
                <Row label="Sahib" value={cert.subject} />
                <Row label="Verən" value={cert.issuer} />
                <Row label="Etibarlı" value={`${cert.validFrom.slice(0, 10)} → ${cert.validTo.slice(0, 10)}`} />
                <Row label="SAN" value={cert.names.length > 0 ? cert.names.join(", ") : "yoxdur"} />
                <Row label="Seriya" value={cert.serialNumber} />
                <Row label="CA" value={cert.isCa ? "bəli" : "xeyr"} />
                {cert.signatureAlgorithm && <Row label="Əyri (EC)" value={cert.signatureAlgorithm} />}
                {cert.keyBits !== null && <Row label="Açar ölçüsü" value={`${cert.keyBits} bit`} />}
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-sm px-1.5 font-mono text-[11px] break-all"
                    style={{ backgroundColor: accentWash }}
                  >
                    {cert.fingerprint256}
                  </span>
                  <CopyButton value={cert.fingerprint256} label="fingerprint kopyala" />
                </div>
              </div>
            </ToolAccordionItem>
          ))}
        </ToolAccordion>
      </ToolResultPanel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs">
      <span className="text-muted">{label}:</span> <span className="break-all">{value}</span>
    </p>
  );
}
