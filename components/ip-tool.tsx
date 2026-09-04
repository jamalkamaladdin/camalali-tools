"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import type { IpAddressResult, IpLookupReport } from "../lib/ip";
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

/*
 * One input, one request, a list of address cards — a domain answers with
 * several addresses, a bare IP answers with one, and the two cases share the
 * same card so the widget does not need a second layout for the common one.
 */

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: IpLookupReport };

export function IpTool() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (value === "") {
      setState({ status: "error", message: "Boş sahə — IP ünvanı və ya domen adı yaz." });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/alet/ip?hedef=${encodeURIComponent(value)}`);
      const body = (await response.json()) as
        | { ok: true; data: IpLookupReport }
        | { ok: false; message: string };
      setState(body.ok ? { status: "success", data: body.data } : { status: "error", message: body.message });
    } catch {
      setState({ status: "error", message: "Sorğu göndərilmədi. İnternet bağlantısını yoxla." });
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Şəhər səviyyəli yer göstərilmir">
        RDAP və ASN mənbələrindən yalnız ölkə kodu gəlir — şəhər və ya koordinat pulsuz mənbədə
        etibarlı olmadığı üçün heç vaxt uydurulmur.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="IP və ya domen" />
        <form onSubmit={onSubmit} className="p-4">
          <ToolField label="Ünvan" htmlFor="ip-tool-input">
            <div className="flex items-center gap-2">
              <ToolInput
                id="ip-tool-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="8.8.8.8 və ya example.com"
                spellCheck={false}
                autoCapitalize="off"
                inputMode="text"
              />
              <ToolButton type="submit" disabled={state.status === "loading"}>
                {state.status === "loading" ? "Axtarılır…" : "Axtar"}
              </ToolButton>
            </div>
          </ToolField>
        </form>
      </ToolPanel>

      {state.status === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {state.message}
        </ToolNote>
      )}

      {state.status === "success" && <ReportView report={state.data} />}
    </div>
  );
}

function ReportView({ report }: { report: IpLookupReport }) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted">
        {report.resolvedFrom === "domain" ? (
          <>
            <span className="font-mono">{report.domain}</span> {report.addresses.length} ünvana həll
            olundu ·{" "}
          </>
        ) : null}
        {formatAzStamp(new Date(report.checkedAt))}
      </p>

      {report.addresses.map((result) => (
        <AddressCard key={result.address} result={result} />
      ))}
    </div>
  );
}

function AddressCard({ result }: { result: IpAddressResult }) {
  const { classification } = result;
  const isPublic = classification.kind === "public";

  return (
    <ToolResultPanel title={result.address} hint={classification.version.toUpperCase()}>
      <div className="space-y-4 p-4">
        <ToolNote title="Tip">{classification.label}</ToolNote>

        {!isPublic && (
          <p className="text-sm/6 text-muted">
            Bu ünvan ictimai deyil — şəbəkə bloku, ASN və tərs DNS axtarışı yalnız ictimai ünvanlar
            üçün aparılır, bu ünvan üçün heç bir xarici sorğu göndərilmədi.
          </p>
        )}

        {isPublic && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ToolStat label="ASN" value={result.asn ? `AS${result.asn.asn}` : "—"} />
              <ToolStat label="Şəbəkə bloku" value={result.asn?.prefix ?? "—"} />
              <ToolStat label="Ölkə" value={result.rdap?.country ?? result.asn?.country ?? "—"} />
              <ToolStat
                label="Tərs DNS"
                value={result.ptr && result.ptr.length > 0 ? "var" : "yoxdur"}
                tone={result.forwardConfirmed ? "accent" : "default"}
              />
            </div>

            {(result.rdap?.organisation || result.rdap?.networkName || result.asnName) && (
              <p className="text-sm/6">
                <span className="text-muted">Təşkilat: </span>
                {result.rdap?.organisation ?? result.rdap?.networkName ?? result.asnName}
              </p>
            )}

            {result.ptr && result.ptr.length > 0 && (
              <div>
                <p className="font-ui text-[11px] text-muted">
                  Tərs DNS adları
                  {result.forwardConfirmed !== null && (
                    <span> · irəli-geri uyğunluq {result.forwardConfirmed ? "təsdiqləndi" : "tapılmadı"}</span>
                  )}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {result.ptr.map((name) => (
                    <li key={name} className="font-mono text-xs break-all">
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.asnError && <p className="text-[11px] text-muted">ASN: {result.asnError}</p>}
            {result.rdapError && <p className="text-[11px] text-muted">RDAP: {result.rdapError}</p>}
            {result.ptrError && <p className="text-[11px] text-muted">Tərs DNS: {result.ptrError}</p>}
          </>
        )}
      </div>
    </ToolResultPanel>
  );
}
