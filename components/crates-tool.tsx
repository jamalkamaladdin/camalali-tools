"use client";

import { useState, type FormEvent } from "react";
import { formatAzDate } from "../shared/az-date";
import { formatCompact } from "../shared/format";
import { parseCratesName, type CratesPackageInfo, type CratesVersionInfo } from "../lib/crates";
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

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: CratesPackageInfo };

const linkClass = "underline decoration-rule underline-offset-4 hover:text-accent-text";

export function CratesTool() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = parseCratesName(query);
    if (!parsed.ok) {
      setState({ status: "error", message: parsed.error });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/alet/crates?ad=${encodeURIComponent(parsed.name)}`);
      const body = (await response.json()) as
        | { ok: true; data: CratesPackageInfo }
        | { ok: false; message: string };
      setState(body.ok ? { status: "success", data: body.data } : { status: "error", message: body.message });
    } catch {
      setState({ status: "error", message: "Sorğu göndərilmədi. İnternet bağlantısını yoxla." });
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolNote>
        Ad crates.io-nun öz reyestrinə göndərilir — başqa heç yerə. Nəticə 10 dəqiqə keşlənir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="crates.io" />
        <form onSubmit={onSubmit} className="p-4">
          <ToolField label="Crate adı" htmlFor="crates-name-input">
            <div className="flex items-center gap-2">
              <ToolInput
                id="crates-name-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="serde"
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

      {state.status === "success" && <CratesResult info={state.data} />}
    </div>
  );
}

function CratesResult({ info }: { info: CratesPackageInfo }) {
  return (
    <ToolResultPanel title={info.name} hint={<span className="tabular-nums">v{info.version}</span>}>
      <div className="space-y-4 p-4">
        {info.description && <p className="text-sm/6">{info.description}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ToolStat label="Lisenziya" value={info.license ?? "—"} />
          <ToolStat label="Yükləmə (cəmi)" value={formatCompact(info.downloadsTotal)} />
          <ToolStat
            label="Son 90 gün"
            value={info.downloadsRecent90d !== null ? formatCompact(info.downloadsRecent90d) : "—"}
          />
        </div>

        {(info.documentation || info.repository || info.homepage) && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-ui text-xs text-muted">
            {info.documentation && (
              <a href={info.documentation} target="_blank" rel="noopener noreferrer" className={linkClass}>
                sənəd
              </a>
            )}
            {info.repository && (
              <a href={info.repository} target="_blank" rel="noopener noreferrer" className={linkClass}>
                repo
              </a>
            )}
            {info.homepage && (
              <a href={info.homepage} target="_blank" rel="noopener noreferrer" className={linkClass}>
                homepage
              </a>
            )}
          </p>
        )}

        {info.recentVersions.length > 0 && (
          <ToolAccordion>
            <ToolAccordionItem summary="Son buraxılışlar" hint={`${info.recentVersions.length} versiya`}>
              <ul className="space-y-1">
                {info.recentVersions.map((version) => (
                  <VersionRow key={version.version} version={version} />
                ))}
              </ul>
            </ToolAccordionItem>
          </ToolAccordion>
        )}
      </div>
    </ToolResultPanel>
  );
}

function VersionRow({ version }: { version: CratesVersionInfo }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
      <span className="flex items-center gap-2">
        <span className="font-mono">{version.version}</span>
        {version.yanked && (
          <span
            className="rounded-[2px] px-1.5 text-[11px] text-ink"
            style={{ backgroundColor: accentWash }}
          >
            yanked
          </span>
        )}
      </span>
      <span className="text-ios-footnote text-muted">{formatAzDate(version.releasedAt.slice(0, 10))}</span>
    </li>
  );
}
