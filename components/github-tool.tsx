"use client";

import { useState, type FormEvent } from "react";
import { formatAzDate } from "../shared/az-date";
import { formatCompact } from "../shared/format";
import { parseGithubInput, type GithubRateLimit, type GithubResult } from "../lib/github";
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
  | { status: "success"; result: GithubResult; rateLimit: GithubRateLimit };

const linkClass = "underline decoration-rule underline-offset-4 hover:text-accent-text";

export function GithubTool() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Same reasoning as the npm widget: the route validates independently,
    // this is only so a plainly wrong input never leaves the browser.
    const parsed = parseGithubInput(query);
    if (!parsed.ok) {
      setState({ status: "error", message: parsed.error });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/alet/github?q=${encodeURIComponent(query.trim())}`);
      const body = (await response.json()) as
        | { ok: true; data: { result: GithubResult; rateLimit: GithubRateLimit } }
        | { ok: false; message: string };
      setState(
        body.ok
          ? { status: "success", result: body.data.result, rateLimit: body.data.rateLimit }
          : { status: "error", message: body.message },
      );
    } catch {
      setState({ status: "error", message: "Sorğu göndərilmədi. İnternet bağlantısını yoxla." });
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolNote>
        İstifadəçi adı və ya owner/repo GitHub-un açıq API-sinə (api.github.com) göndərilir:
        açarsız, saatda 60 sorğuluq ortaq kota ilə. Nəticə 15 dəqiqə keşlənir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="github" />
        <form onSubmit={onSubmit} className="p-4">
          <ToolField label="İstifadəçi və ya owner/repo" htmlFor="github-query-input">
            <div className="flex items-center gap-2">
              <ToolInput
                id="github-query-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="torvalds və ya vercel/next.js"
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

      {state.status === "success" && (
        <div className="space-y-3">
          {state.result.kind === "user" ? (
            <ProfileCard profile={state.result} />
          ) : (
            <RepoCard repo={state.result} />
          )}
          <RateLimitNote rateLimit={state.rateLimit} />
        </div>
      )}
    </div>
  );
}

function RateLimitNote({ rateLimit }: { rateLimit: GithubRateLimit }) {
  if (rateLimit.remaining === null || rateLimit.limit === null) return null;
  return (
    <p className="font-ui text-[11px] text-muted">
      Qalan sorğu (saatlıq, ortaq kota):{" "}
      <span className="tabular-nums">
        {rateLimit.remaining}/{rateLimit.limit}
      </span>
    </p>
  );
}

function ProfileCard({ profile }: { profile: Extract<GithubResult, { kind: "user" }> }) {
  return (
    <ToolResultPanel
      title={profile.name ?? profile.login}
      hint={
        <a href={profile.htmlUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          @{profile.login}
        </a>
      }
    >
      <div className="space-y-4 p-4">
        {profile.bio && <p className="text-sm/6">{profile.bio}</p>}
        <div className="grid grid-cols-3 gap-3">
          <ToolStat label="Repo" value={formatCompact(profile.publicRepos)} />
          <ToolStat label="İzləyici" value={formatCompact(profile.followers)} />
          <ToolStat
            label="Qeydiyyat"
            value={profile.createdAt ? formatAzDate(profile.createdAt.slice(0, 10)) : ""}
          />
        </div>
      </div>
    </ToolResultPanel>
  );
}

function RepoCard({ repo }: { repo: Extract<GithubResult, { kind: "repo" }> }) {
  return (
    <ToolResultPanel
      title={repo.fullName}
      hint={
        <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          github.com/{repo.fullName}
        </a>
      }
    >
      <div className="space-y-4 p-4">
        {repo.archived && (
          <ToolNote tone="accent" title="Arxivləşdirilib">
            Bu repo salt-oxunan rejimə keçirilib: yeni commit qəbul etmir.
          </ToolNote>
        )}
        {repo.description && <p className="text-sm/6">{repo.description}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <ToolStat label="Ulduz" value={formatCompact(repo.stars)} />
          <ToolStat label="Fork" value={formatCompact(repo.forks)} />
          <ToolStat label="Dil" value={repo.language ?? ""} />
          <ToolStat label="Açıq issue" value={formatCompact(repo.openIssues)} />
          <ToolStat label="Lisenziya" value={repo.licenseName ?? ""} />
        </div>
        <ToolStat
          label="Son yenilənmə (push)"
          value={repo.pushedAt ? formatAzDate(repo.pushedAt.slice(0, 10)) : ""}
        />
      </div>
    </ToolResultPanel>
  );
}
