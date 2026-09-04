"use client";

import { useState, type FormEvent } from "react";
import { formatAzDate } from "../shared/az-date";
import { formatBytes, formatCompact } from "../shared/format";
import { parseDockerHubName, type DockerHubImageInfo, type DockerHubTag } from "../lib/docker-hub";
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

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: DockerHubImageInfo };

export function DockerHubTool() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = parseDockerHubName(query);
    if (!parsed.ok) {
      setState({ status: "error", message: parsed.error });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/alet/docker-hub?image=${encodeURIComponent(parsed.fullName)}`);
      const body = (await response.json()) as
        | { ok: true; data: DockerHubImageInfo }
        | { ok: false; message: string };
      setState(body.ok ? { status: "success", data: body.data } : { status: "error", message: body.message });
    } catch {
      setState({ status: "error", message: "Sorğu göndərilmədi. İnternet bağlantısını yoxla." });
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolNote>
        Ad Docker Hub-ın öz API-sinə (hub.docker.com) göndərilir — başqa heç yerə. Sahib yazmasan
        rəsmi image sahibi (`library`) əvəzinə əlavə olunur. Nəticə 10 dəqiqə keşlənir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="Docker Hub" />
        <form onSubmit={onSubmit} className="p-4">
          <ToolField label="Image adı" htmlFor="docker-hub-image-input">
            <div className="flex items-center gap-2">
              <ToolInput
                id="docker-hub-image-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="nginx və ya grafana/grafana"
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

      {state.status === "success" && <DockerHubResult info={state.data} />}
    </div>
  );
}

function DockerHubResult({ info }: { info: DockerHubImageInfo }) {
  const lastUpdated = info.lastUpdated ? formatAzDate(info.lastUpdated.slice(0, 10)) : null;

  return (
    <ToolResultPanel
      title={info.fullName}
      hint={info.isOfficial ? "rəsmi image" : `sahib: ${info.namespace}`}
    >
      <div className="space-y-4 p-4">
        {info.description && <p className="text-sm/6">{info.description}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ToolStat label="Ulduz" value={formatCompact(info.starCount)} />
          <ToolStat label="Yükləmə" value={formatCompact(info.pullCount)} />
          <ToolStat label="Son yenilənmə" value={lastUpdated ?? "—"} />
        </div>

        {info.tags.length > 0 && (
          <div>
            <p className="mb-2 text-ios-footnote text-muted">Son {info.tags.length} teq</p>
            <div className="space-y-2">
              {info.tags.map((tag) => (
                <TagRow key={tag.name} tag={tag} />
              ))}
            </div>
          </div>
        )}
      </div>
    </ToolResultPanel>
  );
}

function TagRow({ tag }: { tag: DockerHubTag }) {
  return (
    <div className="rounded border border-result-rule p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-sm break-all">{tag.name}</span>
        <span className="text-ios-footnote text-muted tabular-nums">
          {tag.fullSizeBytes !== null ? formatBytes(tag.fullSizeBytes) : "—"}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {tag.architectures.length > 0 ? tag.architectures.join(", ") : "arxitektur bilinmir"}
        {tag.lastPushed && <> · {formatAzDate(tag.lastPushed.slice(0, 10))}</>}
      </p>
    </div>
  );
}
