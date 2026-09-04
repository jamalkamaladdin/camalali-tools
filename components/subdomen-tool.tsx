"use client";

import { useRef, useState, type FormEvent } from "react";
import { formatAzDate } from "../shared/az-date";
import { formatNumber } from "../shared/format";
import { readDomain, SUBDOMAIN_LIMIT, type SubdomainResult } from "../lib/subdomen";
import { CopyButton } from "../shared/copy-button";
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

type Status = "idle" | "loading" | "done" | "error";

type Payload = { ok: true; data: SubdomainResult } | { ok: false; message: string };

export function SubdomainTool() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubdomainResult | null>(null);

  /* crt.sh answers in anything from half a second to eight, so two searches
     are easily in flight at once; the older one must not overwrite the newer. */
  const ticket = useRef(0);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "loading") return;

    /* Validated here as well as in the route. The route has to, because it is
       a door onto an outside service; the widget does it to say why without
       spending a request — and both read the same rule from `subdomen.ts`. */
    const checked = readDomain(input);
    if (!checked.ok) {
      setError(checked.error);
      setStatus("error");
      return;
    }

    const mine = ticket.current + 1;
    ticket.current = mine;
    setStatus("loading");
    setError("");

    try {
      const response = await fetch(
        `/api/alet/subdomen?domen=${encodeURIComponent(checked.domain)}`,
      );
      const payload = (await response.json()) as Payload;
      if (mine !== ticket.current) return;

      if (!payload.ok) {
        setError(payload.message);
        setStatus("error");
        return;
      }

      setResult(payload.data);
      setStatus("done");
    } catch {
      if (mine !== ticket.current) return;
      setError("Sorğu göndərilmədi. İnternet bağlantını yoxla və yenidən cəhd et.");
      setStatus("error");
    }
  };

  const list = result?.entries.map((entry) => entry.name).join("\n") ?? "";

  return (
    <div className="mt-8 space-y-5">
      {/* The disclosure comes before the field: this tool asks somebody else a
          question on the visitor's behalf, and that is not the default promise
          the rest of the site's tools make. */}
      <ToolNote tone="accent" title="Bu alət kənar xidmətə sorğu göndərir">
        Yazdığın domen adı <strong>crt.sh</strong> sertifikat şəffaflıq loquna göndərilir:
        başqa heç nə. Loq ictimai qeydiyyatdır: hər buraxılmış TLS sertifikatı ora yazılır,
        ona görə buradakı adlar «sızma» deyil, açıq məlumatdır. Alət öz infrastrukturunda
        unudulmuş test və staging ünvanlarını tapmaq üçündür.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="Domen" hint="mənbə: crt.sh" />

        <form onSubmit={search} className="space-y-4 p-4">
          <ToolField
            label="Domen adı"
            htmlFor="subdomen-input"
            note="Tam ünvan da yapışdıra bilərsən: sxem, port və yol özü kəsilir. «www.» hissəsi atılır, çünki axtarış bütün domen üzrədir."
          >
            <ToolInput
              id="subdomen-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="camalali.com"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </ToolField>

          <div className="flex flex-wrap items-center gap-3">
            <ToolButton type="submit" disabled={input.trim() === "" || status === "loading"}>
              {status === "loading" ? "Axtarılır…" : "Axtar"}
            </ToolButton>
            <span className="font-ui text-[11px] text-muted">
              crt.sh yavaş cavab verə bilər: gözləmə həddi 8 saniyədir.
            </span>
          </div>
        </form>
      </ToolPanel>

      {status === "error" && (
        <ToolNote tone="accent" title="Axtarış alınmadı">
          {error}
        </ToolNote>
      )}

      {result && status !== "error" && (
        <ToolResultPanel
          title={result.domain}
          hint={`${formatNumber(result.total)} ad`}
          action={
            <CopyButton
              value={list}
              label="siyahını kopyala"
              disabled={result.entries.length === 0}
            />
          }
        >
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ToolStat
                label="Tapılan ad"
                value={formatNumber(result.total)}
                note={
                  result.hidden > 0
                    ? `İlk ${SUBDOMAIN_LIMIT} ad göstərilir, ${formatNumber(result.hidden)} ad siyahıdan kənarda qaldı.`
                    : "Təkrarlar və joker qeydlər təmizləndikdən sonra."
                }
              />
              <ToolStat
                label="Joker sertifikat qeydi"
                value={formatNumber(result.wildcards)}
                note={
                  result.wildcards > 0
                    ? "*.domen formasında qeyd var: onun arxasındakı hostlar loqda görünmür."
                    : "Joker sertifikat qeydə alınmayıb."
                }
              />
            </div>

            {result.entries.length === 0 ? (
              <ToolNote tone="info" title="Heç nə tapılmadı">
                Bu domen üçün sertifikat şəffaflıq loqunda qeyd yoxdur. Ən çox rast gəlinən
                səbəblər: domen yenidir və hələ sertifikat buraxılmayıb, ya da bütün
                subdomenlər tək joker sertifikatla işləyir.
              </ToolNote>
            ) : (
              <ul className="divide-y divide-result-rule rounded border border-result-rule">
                {result.entries.map((entry) => (
                  <li
                    key={entry.name}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2"
                  >
                    <span className="min-w-0 font-mono text-sm break-all">{entry.name}</span>
                    <span className="shrink-0 font-ui text-[11px] text-muted tabular-nums">
                      {entry.firstSeen ? `ilk sertifikat: ${formatAzDate(entry.firstSeen)}` : "tarix yoxdur"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <ToolNote tone="info" title="Siyahı tam deyil">
              Burada yalnız TLS sertifikatı buraxılmış adlar var. Joker sertifikat
              arxasındakı hostlar, daxili şəbəkədəki xidmətlər və sertifikatsız işləyən
              subdomenlər bu loqa düşmür.
            </ToolNote>
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}
