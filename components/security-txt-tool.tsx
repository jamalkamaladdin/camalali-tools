"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { normalizeTargetUrl } from "../lib/safe-url";
import type { SecurityTxtLiveReport } from "../lib/security-txt";
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

const EXAMPLES = ["github.com", "google.com", "cloudflare.com"];

type State =
  | { phase: "idle" }
  | { phase: "loading"; host: string }
  | { phase: "done"; report: SecurityTxtLiveReport }
  | { phase: "error"; message: string };

export function SecurityTxtTool() {
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
      const response = await fetch(`/api/alet/security-txt?domen=${encodeURIComponent(target.url)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: SecurityTxtLiveReport; message?: string };
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
        Yazdığın domenin <span className="font-mono text-xs">/.well-known/security.txt</span> və
        lazım gələrsə <span className="font-mono text-xs">/security.txt</span> ünvanını sənin
        brauzerin yox, bu saytın serveri açır: başqa heç bir səhifəyə toxunulmur.
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
            <ToolField label="Domen adı" htmlFor="security-txt-domen" className="min-w-56 flex-1">
              <ToolInput
                id="security-txt-domen"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Gətirilir…" : "Gətir"}
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

function Report({ report }: { report: SecurityTxtLiveReport }) {
  if (report.foundAt === null || report.doc === null || report.evaluation === null) {
    return (
      <div className="space-y-5">
        <ToolNote tone="accent" title="security.txt tapılmadı">
          Nə <span className="font-mono text-xs">/.well-known/security.txt</span>, nə də köhnə{" "}
          <span className="font-mono text-xs">/security.txt</span> ünvanında fayl var. Bir zəiflik
          tapan araşdırmaçı bunu bilmirsə, ünvanı özü axtarmalı olur: bir çoxu bu axtarışa vaxt
          sərf etmədən problemi ictimai edir.
        </ToolNote>
        <ul className="space-y-1 text-[11px] text-muted">
          {report.tried.map((attempt) => (
            <li key={attempt.url} className="font-mono break-all">
              {attempt.status ?? ""} · {attempt.url}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { doc, evaluation } = report;

  return (
    <div className="space-y-5">
      <ToolResultPanel
        title="Nəticə"
        hint={
          evaluation.completeness === "tam"
            ? "tam"
            : evaluation.completeness === "yarimciq"
              ? "yarımçıq"
              : "boş"
        }
      >
        <div className="@container p-4">
          <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
            <ToolStat
              label="Tapıldığı yer"
              value={report.foundAt === "well-known" ? "/.well-known/" : "kök (köhnə)"}
              tone={report.foundAt === "root" ? "warning" : "default"}
              note={report.foundAt === "root" ? "RFC 9116 bu yeri köhnəlmiş sayır" : undefined}
            />
            <ToolStat
              label="Expires"
              value={
                evaluation.expiresInDays === null
                  ? "oxunmadı"
                  : evaluation.expired
                    ? "keçib"
                    : `${evaluation.expiresInDays} gün qalıb`
              }
              tone={evaluation.expired ? "warning" : "default"}
            />
            <ToolStat label="İmza" value={doc.signed ? "PGP ilə imzalanıb" : "imzasız"} />
            <ToolStat label="Sətir sayı" value={String(doc.lineCount)} />
          </div>
        </div>
      </ToolResultPanel>

      {evaluation.missingRequired.length > 0 && (
        <ToolNote tone="accent" title="Məcburi sahə çatmır">
          {evaluation.missingRequired.join(", ")} sahəsi faylda yoxdur: RFC 9116-ya görə bu, faylı
          tam saymır.
        </ToolNote>
      )}

      <ToolPanel>
        <ToolPanelHeader title="Sahələr" hint={`${evaluation.findings.filter((f) => f.present).length}/${evaluation.findings.length} dolu`} />
        <ul className="space-y-3 p-3">
          {evaluation.findings.map((finding) => (
            <li key={finding.field} className={`border-l-2 pl-3 ${finding.present ? "border-l-rule" : "border-l-accent"}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-sm font-semibold">{finding.field}</span>
                {finding.required && !finding.present && (
                  <span
                    className="rounded-sm px-1.5 text-[11px] text-ink"
                    style={{ backgroundColor: accentWash }}
                  >
                    məcburi, çatmır
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted">{finding.purpose}</p>
              {finding.present && (
                <ul className="mt-1 space-y-0.5 font-mono text-xs break-all">
                  {finding.values.map((value, index) => (
                    <li key={index}>{value}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </ToolPanel>

      {doc.unknownLines.length > 0 && (
        <ToolNote tone="info" title="Tanınmayan sətirlər">
          {doc.unknownLines.map((line) => `${line.line}. sətir: ${line.text}`).join(" · ")}
        </ToolNote>
      )}

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">{report.url}</span> · {formatAzStamp(new Date(report.checkedAt))}
      </p>
    </div>
  );
}
