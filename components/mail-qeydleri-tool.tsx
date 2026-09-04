"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import {
  DMARC_POLICY_LABELS,
  MAIL_RECORD_NOTES,
  SPF_ALL_EXPLANATIONS,
  spfAllQualifier,
  type DkimSelectorResult,
  type MailFinding,
  type MailReport,
} from "../lib/mail-qeydleri";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";

/* Three domains that answer differently: a large provider with a full mail
   stack, this site, and a mailbox provider whose DMARC is strict. */
const EXAMPLES = ["google.com", "camalali.com", "protonmail.com"];

type State =
  | { phase: "idle" }
  | { phase: "loading"; domain: string }
  | { phase: "done"; report: MailReport }
  | { phase: "error"; message: string };

export function MailQeydleriTool() {
  const [input, setInput] = useState("");
  const [selectorInput, setSelectorInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(domain: string, selector?: string) {
    const trimmed = domain.trim();
    if (trimmed === "") {
      setState({ phase: "error", message: "Boş sahə: domen adı yaz." });
      return;
    }

    setState({ phase: "loading", domain: trimmed });
    try {
      const params = new URLSearchParams({ domen: trimmed });
      if (selector && selector.trim() !== "") params.set("selector", selector.trim());
      const response = await fetch(`/api/alet/mail-qeydleri?${params.toString()}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: MailReport; message?: string };
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

  function onAddSelector(event: FormEvent) {
    event.preventDefault();
    const domain = state.phase === "done" ? state.report.domain : input;
    void run(domain, selectorInput);
  }

  const busy = state.phase === "loading";

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Bu alət sorğunu serverə göndərir">
        Yazdığın domen adı bu saytın serverinə, oradan da həmin domenin öz ad serverlərinə gedir:
        iyirmiyə yaxın DNS sorğusu ilə. Başqa heç bir xidmətə, o cümlədən heç bir HTTP ünvanına
        müraciət olunmur; cavab 5 dəqiqə saxlanılır.
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
              htmlFor="mail-qeydleri-domen"
              className="min-w-56 flex-1"
              note="Sxem və başındakı «www» yazıla bilər: server onları özü təmizləyir."
            >
              <ToolInput
                id="mail-qeydleri-domen"
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
        <p className="font-ui text-sm text-muted">«{state.domain}» üçün poçt qeydləri soruşulur…</p>
      )}

      {state.phase === "done" && (
        <Report report={state.report} selectorInput={selectorInput} setSelectorInput={setSelectorInput} onAddSelector={onAddSelector} busy={busy} />
      )}
    </div>
  );
}

function Report({
  report,
  selectorInput,
  setSelectorInput,
  onAddSelector,
  busy,
}: {
  report: MailReport;
  selectorInput: string;
  setSelectorInput: (value: string) => void;
  onAddSelector: (event: FormEvent) => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-5">
      <FindingsList findings={report.findings} />

      <p className="font-ui text-[11px] text-muted">
        <span className="font-mono">{report.domain}</span> · {formatAzStamp(new Date(report.checkedAt))}
      </p>

      <MxSection report={report} />
      <SpfSection report={report} />
      <DmarcSection report={report} />
      <DkimSection report={report} selectorInput={selectorInput} setSelectorInput={setSelectorInput} onAddSelector={onAddSelector} busy={busy} />
      <MiscSection report={report} />
    </div>
  );
}

function FindingsList({ findings }: { findings: MailFinding[] }) {
  if (findings.length === 0) {
    return (
      <ToolNote title="Diqqət çəkən qüsur tapılmadı">
        MX, SPF və DMARC qeydləri yerindədir.
      </ToolNote>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {findings.map((finding) => (
        <ToolNote key={finding.title} tone={finding.tone} title={finding.title}>
          {finding.text}
        </ToolNote>
      ))}
    </div>
  );
}

function MxSection({ report }: { report: MailReport }) {
  const { mx } = report;
  return (
    <ToolResultPanel title="MX" hint={`${mx.records.length} qeyd`}>
      <div className="space-y-2 p-3">
        <p className="font-ui text-[11px] text-muted">{MAIL_RECORD_NOTES.mx}</p>
        {mx.nullMx ? (
          <p className="text-sm/6">
            Tək qeyd tapıldı və hədəfi <span className="font-mono text-xs">.</span>: RFC 7505-ə görə
            bu domen heç vaxt məktub qəbul etməyəcək, bilərəkdən elan olunub.
          </p>
        ) : mx.records.length === 0 ? (
          <p className="text-sm/6 text-muted">MX qeydi yoxdur.</p>
        ) : (
          <ul className="space-y-1.5">
            {mx.records.map((record, index) => (
              <li
                key={`${record.host}-${index}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-rule pl-3"
              >
                <span className="font-ui text-xs tabular-nums text-muted">{record.priority}</span>
                <span className="min-w-0 flex-1 font-mono text-sm break-all">{record.host}</span>
                {index === 0 && (
                  <span className="font-ui text-[11px] text-muted">ən kiçik prioritet (əvvəl sınanır)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </ToolResultPanel>
  );
}

function SpfSection({ report }: { report: MailReport }) {
  const { records } = report.spf;
  return (
    <ToolResultPanel title="SPF" hint={`${records.length} qeyd`}>
      <div className="space-y-3 p-3">
        <p className="font-ui text-[11px] text-muted">{MAIL_RECORD_NOTES.spf}</p>
        {records.length === 0 ? (
          <p className="text-sm/6 text-muted">SPF qeydi tapılmadı.</p>
        ) : (
          records.map((value, index) => {
            const qualifier = spfAllQualifier(value);
            return (
              <div key={index} className="space-y-1 border-l-2 border-rule pl-3">
                <p className="font-mono text-xs break-all">{value}</p>
                <p className="font-ui text-[11px] text-muted">
                  {qualifier ? SPF_ALL_EXPLANATIONS[qualifier] : "«all» mexanizmi yoxdur."}
                </p>
              </div>
            );
          })
        )}
      </div>
    </ToolResultPanel>
  );
}

function DmarcSection({ report }: { report: MailReport }) {
  const { dmarc } = report;
  return (
    <ToolResultPanel title="DMARC" hint={dmarc ? "tapıldı" : "yoxdur"}>
      <div className="space-y-2 p-3">
        <p className="font-ui text-[11px] text-muted">{MAIL_RECORD_NOTES.dmarc}</p>
        {!dmarc ? (
          <p className="text-sm/6 text-muted">DMARC qeydi (<span className="font-mono text-xs">_dmarc</span>) tapılmadı.</p>
        ) : (
          <>
            <p className="font-mono text-xs break-all">{dmarc.raw}</p>
            <ul className="mt-1 space-y-1 font-ui text-[11px] text-muted">
              <li>
                <span className="font-mono">p=</span>{" "}
                {dmarc.policy ? `${dmarc.policy}: ${DMARC_POLICY_LABELS[dmarc.policy]}` : "yoxdur: qeyd etibarsızdır"}
              </li>
              <li>
                <span className="font-mono">sp=</span>{" "}
                {dmarc.subdomainPolicy ? `${dmarc.subdomainPolicy}: ${DMARC_POLICY_LABELS[dmarc.subdomainPolicy]}` : "yoxdur: sub-domenlərə də p= tətbiq olunur"}
              </li>
              <li>
                <span className="font-mono">pct=</span> {dmarc.percent}% məktuba tətbiq olunur
              </li>
              <li>
                <span className="font-mono">rua=</span>{" "}
                {dmarc.rua.length > 0 ? dmarc.rua.join(", ") : "hesabat ünvanı yoxdur"}
              </li>
            </ul>
          </>
        )}
      </div>
    </ToolResultPanel>
  );
}

function DkimSection({
  report,
  selectorInput,
  setSelectorInput,
  onAddSelector,
  busy,
}: {
  report: MailReport;
  selectorInput: string;
  setSelectorInput: (value: string) => void;
  onAddSelector: (event: FormEvent) => void;
  busy: boolean;
}) {
  const found = report.dkim.filter((entry) => entry.found);

  return (
    <ToolResultPanel title="DKIM" hint={`${found.length}/${report.dkim.length} seçici tapıldı`}>
      <div className="space-y-3 p-3">
        <ToolNote>
          Seçici (selector) adı DNS-dən oxuna bilmir: bu, {report.dkim.length} tanınan adı sınayır.
          Heç biri tapılmasa da DKIM işləyə bilər; bu, yalnız «bu adlarla tapılmadı» deməkdir.
        </ToolNote>

        {found.length > 0 && (
          <ul className="space-y-1.5">
            {found.map((entry) => (
              <DkimRow key={entry.selector} entry={entry} />
            ))}
          </ul>
        )}

        <form onSubmit={onAddSelector} className="flex flex-wrap items-end gap-3">
          <ToolField label="Seçici adını bilirsənsə əlavə et" htmlFor="mail-qeydleri-selector" className="min-w-40 flex-1">
            <ToolInput
              id="mail-qeydleri-selector"
              value={selectorInput}
              onChange={(event) => setSelectorInput(event.target.value)}
              placeholder="məs. s2048"
              spellCheck={false}
              autoComplete="off"
            />
          </ToolField>
          <ToolButton type="submit" size="chip" disabled={busy || selectorInput.trim() === ""}>
            Əlavə et və yenidən yoxla
          </ToolButton>
        </form>
      </div>
    </ToolResultPanel>
  );
}

function DkimRow({ entry }: { entry: DkimSelectorResult }) {
  return (
    <li className="border-l-2 border-rule pl-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs">{entry.selector}</span>
        <span className="font-ui text-[11px] text-muted">
          açar tipi {entry.keyType}
          {entry.revoked && " · açar geri götürülüb (p= boşdur)"}
        </span>
      </div>
      {entry.value && <p className="mt-1 font-mono text-[11px] break-all text-muted">{entry.value}</p>}
    </li>
  );
}

function MiscSection({ report }: { report: MailReport }) {
  const { misc } = report;
  const rows: { label: string; note: string; record: { present: boolean; value: string | null } }[] = [
    { label: "_mta-sts", note: MAIL_RECORD_NOTES.mtaSts, record: misc.mtaSts },
    { label: "_smtp._tls", note: MAIL_RECORD_NOTES.tlsRpt, record: misc.tlsRpt },
    { label: "default._bimi", note: MAIL_RECORD_NOTES.bimi, record: misc.bimi },
    { label: "_domainkey", note: MAIL_RECORD_NOTES.domainkey, record: misc.domainkey },
  ];

  return (
    <ToolResultPanel title="Digər qeydlər" hint="MTA-STS · TLS-RPT · BIMI">
      <div className="space-y-3 p-3">
        <div className="border-l-2 border-rule pl-3">
          <p className="font-mono text-xs">mta-sts.{report.domain}</p>
          <p className="font-ui text-[11px] text-muted">
            {misc.mtaStsPolicyHost ? "Siyasət hostu DNS-də mövcuddur." : "Siyasət hostu tapılmadı."}
          </p>
        </div>
        {rows.map((row) => (
          <div key={row.label} className="border-l-2 border-rule pl-3">
            <p className="font-mono text-xs">
              {row.label}.{report.domain}
            </p>
            <p className="font-ui text-[11px] text-muted">{row.note}</p>
            {row.record.present ? (
              <p className="mt-1 font-mono text-[11px] break-all">{row.record.value}</p>
            ) : (
              <p className="mt-1 font-ui text-[11px] text-muted">Tapılmadı.</p>
            )}
          </div>
        ))}
      </div>
    </ToolResultPanel>
  );
}
