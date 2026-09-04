"use client";

import { useState, type FormEvent } from "react";
import { azLongDate, formatAzStamp } from "../shared/az-date";
import { parseDomainName, type WhoisReport } from "../lib/whois";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

/* Three domains that read differently: a household name with a full status
   list, a ccTLD that has RDAP, and this site's own domain. */
const EXAMPLES = ["google.com", "wikipedia.org", "camalali.com"];

type State =
  | { phase: "idle" }
  | { phase: "loading"; domain: string }
  | { phase: "done"; report: WhoisReport }
  | { phase: "error"; message: string };

export function WhoisTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(raw: string) {
    /* The route validates again; this copy only saves a doomed round trip
       and the rate-limit slot that goes with it. */
    const checked = parseDomainName(raw);
    if (!checked.ok) {
      setState({ phase: "error", message: checked.error });
      return;
    }

    setState({ phase: "loading", domain: checked.domain });
    try {
      const response = await fetch(`/api/alet/whois?domen=${encodeURIComponent(checked.domain)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: WhoisReport; message?: string };
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
        Yazdığın domen adı əvvəlcə IANA-nın rdap.org bootstrap xidmətinə, oradan da domenin TLD-sinə
        uyğun reyestrin öz RDAP serverinə gedir. Nəticə 30 dəqiqə saxlanılır.
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
              htmlFor="whois-domain"
              className="min-w-56 flex-1"
              note="Sxem və yol yazmadan — yalnız «example.com» formatında."
            >
              <ToolInput
                id="whois-domain"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Sorğulanır…" : "Yoxla"}
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
          «{state.domain}» üçün RDAP qeydi sorğulanır…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function dateLine(iso: string | null): string {
  if (iso === null) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return azLongDate(date);
}

function daysLabel(days: number): string {
  const abs = Math.abs(days);
  return `${abs} gün`;
}

function Report({ report }: { report: WhoisReport }) {
  const expiryTone =
    report.daysToExpiry === null ? "default" : report.daysToExpiry <= 30 ? "warning" : "accent";

  return (
    <div className="space-y-5">
      <ToolNote title="Sahib məlumatı niyə göstərilmir">
        Ad, ünvan, e-poçt və telefon burada qəsdən yoxdur. 2018-dən (GDPR) bəri demək olar bütün
        reyestrlər bu sahələri RDAP cavabında qaralayır — boş bir «sahib» sətri göstərmək heç nə
        öyrətmir, ona görə bu alət ümumiyyətlə göstərmir.
      </ToolNote>

      <div className="@container">
        <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          <ToolStat
            label="Yaş"
            value={report.ageDays === null ? "—" : daysLabel(report.ageDays)}
            note={report.dates.registration === null ? "qeydiyyat tarixi yoxdur" : undefined}
          />
          <ToolStat
            label={report.daysToExpiry !== null && report.daysToExpiry < 0 ? "Bitməsindən keçib" : "Bitməyə qalıb"}
            value={report.daysToExpiry === null ? "—" : daysLabel(report.daysToExpiry)}
            tone={expiryTone}
            note={report.dates.expiration === null ? "bitmə tarixi yoxdur" : undefined}
          />
          <ToolStat
            label="DNSSEC"
            value={report.dnssec.signed ? "imzalanıb" : "imzalanmayıb"}
          />
          <ToolStat label="Nameserver" value={String(report.nameservers.length)} />
        </div>
      </div>

      <p className="text-[11px] text-muted">{formatAzStamp(new Date(report.checkedAt))}</p>

      <ToolResultPanel title={report.domain ?? "Domen"} hint="tarixlər">
        <div className="grid gap-3 p-3 @min-[30rem]:grid-cols-2">
          <DateRow label="Qeydiyyat" value={dateLine(report.dates.registration)} />
          <DateRow label="Son dəyişiklik" value={dateLine(report.dates.lastChanged)} />
          <DateRow label="Bitmə tarixi" value={dateLine(report.dates.expiration)} />
          <DateRow label="Son transfer" value={dateLine(report.dates.transfer)} />
        </div>
      </ToolResultPanel>

      <ToolResultPanel title="Reyestrator">
        <div className="space-y-1 p-3 text-sm/6">
          <p>{report.registrar.name ?? "Reyestin cavabında adı yoxdur."}</p>
          {report.registrar.ianaId !== null && (
            <p className="text-[11px] text-muted">
              IANA reyestrator ID: <span className="font-mono">{report.registrar.ianaId}</span>
            </p>
          )}
        </div>
      </ToolResultPanel>

      <ToolResultPanel
        title="Nameserver-lər"
        hint={report.nameservers.length === 0 ? "yoxdur" : `${report.nameservers.length} ədəd`}
      >
        {report.nameservers.length === 0 ? (
          <p className="p-3 text-sm/6 text-muted">Reyestin cavabında nameserver siyahısı yoxdur.</p>
        ) : (
          <ul className="space-y-1 p-3">
            {report.nameservers.map((ns) => (
              <li key={ns} className="font-mono text-sm break-all">
                {ns}
              </li>
            ))}
          </ul>
        )}
      </ToolResultPanel>

      <ToolResultPanel
        title="Status kodları"
        hint={report.statuses.length === 0 ? "yoxdur" : `${report.statuses.length} kod`}
      >
        {report.statuses.length === 0 ? (
          <p className="p-3 text-sm/6 text-muted">Reyestin cavabında status kodu yoxdur.</p>
        ) : (
          <ul className="space-y-3 p-3">
            {report.statuses.map((status, index) => (
              <li key={`${status.code}-${index}`} className="border-l-2 border-rule pl-3">
                <p className="font-mono text-xs">{status.code}</p>
                <p className="mt-1 text-sm/6 text-muted">{status.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </ToolResultPanel>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-ios-footnote text-muted">{label}</p>
      <p className="tabular-nums">{value}</p>
    </div>
  );
}
