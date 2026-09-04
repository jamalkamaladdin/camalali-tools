"use client";

import { useState, type FormEvent } from "react";
import { formatAzDate } from "../shared/az-date";
import { parseNpmName, type NpmPackageInfo } from "../lib/npm";
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
 * The three shapes a lookup can be in, kept as one tagged value rather than
 * three separate booleans — a lookup cannot be both loading and holding a
 * stale error at once, and a union makes that impossible to represent instead
 * of merely unlikely.
 */
type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: NpmPackageInfo };

const linkClass = "underline decoration-rule underline-offset-4 hover:text-accent-text";

export function NpmTool() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Validated here first so an obviously malformed name never turns into a
    // request — the same check the route repeats server-side, since a widget
    // check alone would not stop a direct call to the endpoint.
    const parsed = parseNpmName(query);
    if (!parsed.ok) {
      setState({ status: "error", message: parsed.error });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/alet/npm?pkg=${encodeURIComponent(parsed.parsed.full)}`);
      const body = (await response.json()) as
        | { ok: true; data: NpmPackageInfo }
        | { ok: false; message: string };
      setState(body.ok ? { status: "success", data: body.data } : { status: "error", message: body.message });
    } catch {
      // A network-level failure (offline, DNS, CORS) never reaches the route
      // at all, so there is no server message to show — this is the one case
      // the widget has to word itself.
      setState({ status: "error", message: "Sorğu göndərilmədi. İnternet bağlantısını yoxla." });
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolNote>
        Paket adı npm-in öz reyestrinə (registry.npmjs.org) göndərilir: başqa heç yerə. Nəticə 10
        dəqiqə keşlənir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="npm" />
        <form onSubmit={onSubmit} className="p-4">
          <ToolField label="Paket adı" htmlFor="npm-package-input">
            <div className="flex items-center gap-2">
              <ToolInput
                id="npm-package-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="react və ya @types/node"
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

      {state.status === "success" && <NpmResult info={state.data} />}
    </div>
  );
}

function NpmResult({ info }: { info: NpmPackageInfo }) {
  const releaseDate = info.releasedAt ? formatAzDate(info.releasedAt.slice(0, 10)) : null;

  return (
    <ToolResultPanel title={info.name} hint={<span className="tabular-nums">v{info.version}</span>}>
      <div className="space-y-4 p-4">
        {info.deprecated && (
          <ToolNote tone="accent" title="Deprecated">
            {info.deprecated}
          </ToolNote>
        )}

        {info.description && <p className="text-sm/6">{info.description}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ToolStat label="Lisenziya" value={info.license ?? ""} />
          <ToolStat
            label="Asılılıq"
            value={info.dependencyNames.length}
            tone={info.dependencyNames.length > 20 ? "warning" : "default"}
          />
          <ToolStat label="Son buraxılış" value={releaseDate ?? ""} />
        </div>

        {(info.repositoryUrl || info.homepage) && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-ui text-xs text-muted">
            {info.repositoryUrl && (
              <a href={info.repositoryUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
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

        {info.dependencyNames.length > 0 && (
          <ToolAccordion>
            <ToolAccordionItem
              summary="Birbaşa asılılıqlar"
              hint={`${info.dependencyNames.length} paket`}
            >
              <ToolOutput className="max-h-64 overflow-y-auto">
                {info.dependencyNames.join("\n")}
              </ToolOutput>
            </ToolAccordionItem>
          </ToolAccordion>
        )}
      </div>
    </ToolResultPanel>
  );
}
