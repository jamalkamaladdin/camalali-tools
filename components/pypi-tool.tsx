"use client";

import { useState, type FormEvent } from "react";
import { formatAzDate } from "../shared/az-date";
import { parsePypiName, type PypiPackageInfo } from "../lib/pypi";
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

/* Three shapes a lookup can be in, kept as one tagged value rather than three
   separate booleans — see npm-tool.tsx, which this widget mirrors. */
type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: PypiPackageInfo };

const linkClass = "underline decoration-rule underline-offset-4 hover:text-accent-text";

export function PypiTool() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = parsePypiName(query);
    if (!parsed.ok) {
      setState({ status: "error", message: parsed.error });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/alet/pypi?pkg=${encodeURIComponent(parsed.name)}`);
      const body = (await response.json()) as
        | { ok: true; data: PypiPackageInfo }
        | { ok: false; message: string };
      setState(body.ok ? { status: "success", data: body.data } : { status: "error", message: body.message });
    } catch {
      setState({ status: "error", message: "Sorğu göndərilmədi. İnternet bağlantısını yoxla." });
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolNote>
        Paket adı PyPI-nin öz reyestrinə (pypi.org) göndərilir — başqa heç yerə. Nəticə 10 dəqiqə
        keşlənir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="PyPI" />
        <form onSubmit={onSubmit} className="p-4">
          <ToolField label="Paket adı" htmlFor="pypi-package-input">
            <div className="flex items-center gap-2">
              <ToolInput
                id="pypi-package-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="requests və ya django"
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

      {state.status === "success" && <PypiResult info={state.data} />}
    </div>
  );
}

function PypiResult({ info }: { info: PypiPackageInfo }) {
  const releaseDate = info.releasedAt ? formatAzDate(info.releasedAt.slice(0, 10)) : null;

  return (
    <ToolResultPanel title={info.name} hint={<span className="tabular-nums">v{info.version}</span>}>
      <div className="space-y-4 p-4">
        {info.summary && <p className="text-sm/6">{info.summary}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ToolStat label="Lisenziya" value={info.license ?? "—"} />
          <ToolStat label="Tələb olunan Python" value={info.requiresPython ?? "—"} />
          <ToolStat label="Son buraxılış" value={releaseDate ?? "—"} />
          <ToolStat
            label="Asılılıq"
            value={info.dependencies.length}
            tone={info.dependencies.length > 20 ? "warning" : "default"}
          />
        </div>

        {info.packageFormats.length > 0 && (
          <p className="text-ios-footnote text-muted">
            Təhvil formatı: <span className="font-mono text-ink">{info.packageFormats.join(", ")}</span>
          </p>
        )}

        {info.projectUrls.length > 0 && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-ui text-xs text-muted">
            {info.projectUrls.map((entry) => (
              <a key={entry.url} href={entry.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {entry.label}
              </a>
            ))}
          </p>
        )}

        <ToolAccordion>
          {info.dependencies.length > 0 && (
            <ToolAccordionItem
              summary="Asılılıqlar"
              hint={`${info.dependencies.length} qeyd`}
              group="pypi"
            >
              <ToolOutput className="max-h-64 overflow-y-auto">{info.dependencies.join("\n")}</ToolOutput>
            </ToolAccordionItem>
          )}

          {info.recentReleases.length > 0 && (
            <ToolAccordionItem
              summary="Son buraxılışlar"
              hint={`${info.recentReleases.length} versiya`}
              group="pypi"
            >
              <ul className="space-y-1">
                {info.recentReleases.map((release) => (
                  <li key={release.version} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-mono">{release.version}</span>
                    <span className="text-ios-footnote text-muted">
                      {formatAzDate(release.releasedAt.slice(0, 10))}
                    </span>
                  </li>
                ))}
              </ul>
            </ToolAccordionItem>
          )}
        </ToolAccordion>
      </div>
    </ToolResultPanel>
  );
}
