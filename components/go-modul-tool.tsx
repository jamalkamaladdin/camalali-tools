"use client";

import { useState, type FormEvent } from "react";
import { formatAzDate } from "../shared/az-date";
import { CopyButton } from "../shared/copy-button";
import { escapeModulePath, parseGoModulePath, type GoModuleReport } from "../lib/go-modul";
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

/*
 * The npm tool's shape, one field for one field: a name in, a result out, a
 * client-side validation pass that saves a doomed round trip. The one field
 * that has no npm counterpart is the escaped path shown under the input —
 * proving to a visitor, in one glance, that the trap the FAQ describes is
 * real and already handled.
 */

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: GoModuleReport };

export function GoModulTool() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const parsed = parseGoModulePath(query);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!parsed.ok) {
      setState({ status: "error", message: parsed.error });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/alet/go-modul?modul=${encodeURIComponent(parsed.path)}`);
      const body = (await response.json()) as
        | { ok: true; data: GoModuleReport }
        | { ok: false; message: string };
      setState(body.ok ? { status: "success", data: body.data } : { status: "error", message: body.message });
    } catch {
      setState({ status: "error", message: "Sorğu göndərilmədi. İnternet bağlantısını yoxla." });
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolNote>
        Modul yolu Go-nun öz açıq proxy-sinə (proxy.golang.org) göndərilir — başqa heç yerə. Nəticə 10
        dəqiqə keşlənir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="Go modul" />
        <form onSubmit={onSubmit} className="space-y-2 p-4">
          <ToolField label="Modul yolu" htmlFor="go-modul-input">
            <div className="flex items-center gap-2">
              <ToolInput
                id="go-modul-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="github.com/BurntSushi/toml"
                spellCheck={false}
                autoCapitalize="off"
              />
              <ToolButton type="submit" disabled={state.status === "loading"}>
                {state.status === "loading" ? "Axtarılır…" : "Axtar"}
              </ToolButton>
            </div>
          </ToolField>
          {query.trim() !== "" && parsed.ok && (
            <p className="font-ui text-[11px] text-muted">
              Proxy sorğusu: <span className="font-mono">{escapeModulePath(parsed.path)}</span>
            </p>
          )}
        </form>
      </ToolPanel>

      {state.status === "error" && (
        <ToolNote tone="accent" title="Tapılmadı">
          {state.message}
        </ToolNote>
      )}

      {state.status === "success" && <GoModulResult report={state.data} />}
    </div>
  );
}

function GoModulResult({ report }: { report: GoModuleReport }) {
  const releaseDate = formatAzDate(report.latestReleasedAt.slice(0, 10));

  return (
    <ToolResultPanel
      title={report.modulePath}
      hint={<span className="tabular-nums">{report.latestVersion}</span>}
    >
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ToolStat label="Son versiya" value={report.latestVersion} />
          <ToolStat label="Buraxılış tarixi" value={releaseDate} />
          <ToolStat label="Major şəkilçi" value={report.majorSuffix ?? "yoxdur"} />
        </div>

        <ToolField label="go get əmri" hint={<CopyButton value={report.goGetCommand} label="kopyala" />}>
          <ToolOutput>{report.goGetCommand}</ToolOutput>
        </ToolField>

        {report.recentVersions.length > 0 && (
          <ToolAccordion>
            <ToolAccordionItem summary="Son versiyalar" hint={`${report.recentVersions.length} ədəd`}>
              <ToolOutput className="max-h-64 overflow-y-auto">
                {report.recentVersions.join("\n")}
              </ToolOutput>
            </ToolAccordionItem>
          </ToolAccordion>
        )}
      </div>
    </ToolResultPanel>
  );
}
