"use client";

import { useState, type FormEvent } from "react";
import { formatAzDate } from "../shared/az-date";
import { formatCompact } from "../shared/format";
import { parsePackagistName, type PackagistPackageInfo } from "../lib/packagist";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: PackagistPackageInfo };

export function PackagistTool() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = parsePackagistName(query);
    if (!parsed.ok) {
      setState({ status: "error", message: parsed.error });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/alet/packagist?paket=${encodeURIComponent(parsed.fullName)}`);
      const body = (await response.json()) as
        | { ok: true; data: PackagistPackageInfo }
        | { ok: false; message: string };
      setState(body.ok ? { status: "success", data: body.data } : { status: "error", message: body.message });
    } catch {
      setState({ status: "error", message: "Sorğu göndərilmədi. İnternet bağlantısını yoxla." });
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolNote>
        Ad Packagist-in öz reyestrinə (packagist.org) göndərilir — başqa heç yerə. Nəticə 10 dəqiqə
        keşlənir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="Packagist" />
        <form onSubmit={onSubmit} className="p-4">
          <ToolField label="vendor/paket" htmlFor="packagist-package-input">
            <div className="flex items-center gap-2">
              <ToolInput
                id="packagist-package-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="guzzlehttp/guzzle"
                spellCheck={false}
                autoCapitalize="off"
              />
              <ToolButton type="submit" disabled={state.status === "loading"}>
                {state.status === "loading" ? "Axtarılır…" : "Axtar"}
              </ToolButton>
            </div>
          </ToolField>
        </form>
      </ToolPanel>

      {state.status === "error" && (
        <ToolNote tone="accent" title="Tapılmadı">
          {state.message}
        </ToolNote>
      )}

      {state.status === "success" && <PackagistResult info={state.data} />}
    </div>
  );
}

function PackagistResult({ info }: { info: PackagistPackageInfo }) {
  const releaseDate = info.releasedAt ? formatAzDate(info.releasedAt.slice(0, 10)) : null;

  return (
    <ToolResultPanel title={info.name} hint={<span className="tabular-nums">v{info.latestVersion}</span>}>
      <div className="space-y-4 p-4">
        {info.abandoned === true && (
          <ToolNote tone="accent" title="Tərk edilib">
            {info.abandonedReplacement
              ? `Müəllif bu paketi tərk edilmiş elan edib. Tövsiyə olunan əvəzedici: ${info.abandonedReplacement}.`
              : "Müəllif bu paketi tərk edilmiş elan edib — əvəzedici göstərilməyib."}
          </ToolNote>
        )}
        {info.abandoned === null && (
          <ToolNote title="Tərk statusu naməlum">
            Yükləmə və tərk statusu ayrı bir uc nöqtədən gəlir, o cavab vermədi.
          </ToolNote>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ToolStat label="Tələb olunan PHP" value={info.requiresPhp ?? "—"} />
          <ToolStat label="Lisenziya" value={info.license.length > 0 ? info.license.join(" / ") : "—"} />
          <ToolStat
            label="Yükləmə"
            value={info.downloadsTotal !== null ? formatCompact(info.downloadsTotal) : "—"}
          />
          <ToolStat label="Buraxılış" value={releaseDate ?? "—"} />
        </div>

        {info.dependencies.length > 0 && (
          <ToolAccordion>
            <ToolAccordionItem summary="Asılılıqlar" hint={`${info.dependencies.length} paket`}>
              <ToolOutput className="max-h-64 overflow-y-auto">{info.dependencies.join("\n")}</ToolOutput>
            </ToolAccordionItem>
          </ToolAccordion>
        )}
      </div>
    </ToolResultPanel>
  );
}
