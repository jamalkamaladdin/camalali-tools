"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  auditLinks,
  extractLinks,
  summariseLinks,
  type LinkIssue,
  type PageLink,
} from "../lib/link-analizi";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";

/*
 * Every problem this tool looks for, in one small page: a weak anchor, a
 * link to the same target under a different name, two links to different
 * targets under the same name, a missing `rel="noopener"`, a dead `href`
 * (both the empty and the `javascript:` kind), an empty anchor rescued by an
 * image `alt`, a fragment jump, a protocol-relative address, and a link back
 * to the page itself.
 */
const SAMPLE_BASE_URL = "https://camalali.com/meqale/websocket-nedir";
const SAMPLE_HTML = [
  '<p><a href="/bloq/websocket-nedir">WebSocket haqqında məqalə</a></p>',
  '<p><a href="/bloq/websocket-nedir">bura klikləyin</a></p>',
  '<p><a href="https://developer.mozilla.org/websocket" target="_blank">MDN sənədləşməsi</a></p>',
  '<p><a href="https://developer.mozilla.org/glossary/websocket" target="_blank" rel="noopener">MDN sənədləşməsi</a></p>',
  '<p><a href="#elaqe">Əlaqə bölməsinə keç</a></p>',
  '<p><a href="//cdn.camalali.com/media/kart.png"><img src="/kart.png" alt="Şəbəkə diaqramı"></a></p>',
  '<p><a href=""></a></p>',
  '<p><a href="javascript:void(0)">klik et</a></p>',
  '<p><a href="/meqale/websocket-nedir">Bu səhifə</a></p>',
].join("\n");

const SEVERITY_LABEL: Record<LinkIssue["severity"], string> = {
  xeta: "xəta",
  xeberdarliq: "xəbərdarlıq",
  melumat: "məlumat",
};

export function LinkAnaliziTool() {
  const [html, setHtml] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const links = useMemo(() => extractLinks(html, baseUrl), [html, baseUrl]);
  const issues = useMemo(() => auditLinks(links, baseUrl), [links, baseUrl]);
  const summary = useMemo(() => summariseLinks(links), [links]);

  const errorCount = issues.filter((issue) => issue.severity === "xeta").length;
  const warningCount = issues.filter((issue) => issue.severity === "xeberdarliq").length;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Səhifə"
          action={
            <ToolButton
              size="chip"
              onClick={() => {
                setHtml(SAMPLE_HTML);
                setBaseUrl(SAMPLE_BASE_URL);
              }}
            >
              Nümunə ilə doldur
            </ToolButton>
          }
        />
        <div className="space-y-4 p-4">
          <ToolField
            label="Səhifənin öz ünvanı"
            htmlFor="link-analizi-base"
            note="Nisbi linklərin (/haqqimizda) mütləq ünvana çevrilməsi və öz-səhifəsinə link yoxlaması üçün lazımdır."
          >
            <ToolInput
              id="link-analizi-base"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://sayt.com/sehife"
              spellCheck={false}
              autoComplete="off"
              inputMode="url"
            />
          </ToolField>

          <ToolField label="HTML" htmlFor="link-analizi-html">
            <ToolTextArea
              id="link-analizi-html"
              value={html}
              onChange={(event) => setHtml(event.target.value)}
              placeholder="Səhifənin HTML mənbəyini bura yapışdır (view-source və ya sağ klik → Səhifə mənbəyi)"
              spellCheck={false}
              className="min-h-56 font-mono text-sm"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {links.length === 0 ? (
        <p className="font-ui text-sm text-muted">
          {html.trim() === ""
            ? "HTML yapışdırılınca linklərin cədvəli burada görünəcək."
            : "Bu HTML-də <a> tag-ı tapılmadı."}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            <ToolStat label="Ümumi link" value={String(summary.total)} />
            <ToolStat label="Daxili" value={String(summary.internal)} />
            <ToolStat label="Xarici" value={String(summary.external)} />
            <ToolStat label="nofollow" value={String(summary.nofollow)} />
            <ToolStat label="Unikal hədəf" value={String(summary.uniqueTargets)} />
          </div>

          <ToolResultPanel title="Linklər" hint={`${links.length} ədəd`}>
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[720px] border-collapse font-ui text-xs">
                <thead>
                  <tr className="border-b border-result-rule text-left text-muted">
                    <th className="p-1.5 font-normal">Anchor mətni</th>
                    <th className="p-1.5 font-normal">Hədəf</th>
                    <th className="p-1.5 font-normal">Növ</th>
                    <th className="p-1.5 font-normal">rel</th>
                    <th className="p-1.5 font-normal">_blank</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <LinkRow key={link.index} link={link} />
                  ))}
                </tbody>
              </table>
            </div>
          </ToolResultPanel>

          {summary.anchors.length > 0 && (
            <ToolResultPanel title="Anchor mətn paylanması" hint={`${summary.anchors.length} unikal mətn`}>
              <ul className="space-y-1 p-3 font-ui text-xs">
                {summary.anchors.slice(0, 15).map((entry) => (
                  <li key={entry.text} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{entry.text}</span>
                    <span className="shrink-0 tabular-nums text-muted">{entry.count}×</span>
                  </li>
                ))}
              </ul>
            </ToolResultPanel>
          )}

          <ToolResultPanel
            title="Problemlər"
            hint={`${errorCount} xəta · ${warningCount} xəbərdarlıq`}
          >
            <div className="space-y-3 p-3">
              {issues.length === 0 ? (
                <ToolNote>Bu linklərdə heç bir problem tapılmadı.</ToolNote>
              ) : (
                issues.map((issue, index) => <IssueRow key={index} issue={issue} />)
              )}
            </div>
          </ToolResultPanel>
        </>
      )}

      <ToolNote title="Sorğu göndərilmir">
        Bu alət linklərin özlərinin haraya işarə etdiyini oxuyur, heç birinə sorğu göndərmir: hədəf
        ünvanın canlı olub-olmadığını, 404 qaytarıb-qaytarmadığını yoxlamır.
      </ToolNote>
    </div>
  );
}

function targetLabel(link: PageLink): ReactNode {
  if (link.resolved !== null) return link.resolved;
  if (link.href !== "") return link.href;
  return <span className="text-muted italic">(boş)</span>;
}

function LinkRow({ link }: { link: PageLink }) {
  return (
    <tr className="border-b border-result-rule/60 align-top">
      <td className="max-w-56 p-1.5 break-words">
        {link.anchor === "" ? <span className="text-muted italic">(boş)</span> : link.anchor}
      </td>
      <td className="max-w-72 p-1.5 break-all font-mono text-muted">
        {targetLabel(link)}
        {link.fragmentOnly && <span className="ml-1 font-ui">(fraqment)</span>}
      </td>
      <td className="p-1.5">{link.internal ? "daxili" : "xarici"}</td>
      <td className="p-1.5 font-mono text-muted">{link.rel.length > 0 ? link.rel.join(", ") : ""}</td>
      <td className="p-1.5 text-muted">{link.targetBlank ? "bəli" : ""}</td>
    </tr>
  );
}

function IssueRow({ issue }: { issue: LinkIssue }) {
  return (
    <div className="border-l-2 border-rule pl-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-ui text-[11px] font-semibold text-accent-text">
          {SEVERITY_LABEL[issue.severity]}
        </span>
        {issue.link !== null && (
          <span className="font-ui text-[11px] break-all text-muted">
            {issue.link.anchor === "" ? "(boş anchor)" : issue.link.anchor}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm/6">{issue.message}</p>
    </div>
  );
}
