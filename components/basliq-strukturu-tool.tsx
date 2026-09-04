"use client";

import { useMemo, useState } from "react";
import {
  auditOutline,
  buildOutlineTree,
  extractHeadings,
  type Heading,
  type OutlineIssue,
  type OutlineNode,
} from "../lib/basliq-strukturu";
import {
  ToolButton,
  ToolField,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";

/*
 * Shows every problem this tool looks for at once: a skipped level (H2 to H4
 * with no H3 in between), a single-word heading, a heading text repeated
 * twice, an empty heading, and an image-only heading with no `alt`.
 */
const SAMPLE_HTML = [
  "<h1>Kod incəlikləri jurnalı</h1>",
  "<p>Backend, verilənlər bazası və sistem dizaynı haqqında yazılar.</p>",
  "<h2>Backend</h2>",
  "<h3>Verilənlər bazası</h3>",
  "<h2>Frontend</h2>",
  "<h4>Performans</h4>",
  "<h2>Alət</h2>",
  "<h2></h2>",
  '<h2><img src="/kart.png" width="64" height="64"></h2>',
  "<h2>Backend</h2>",
].join("\n");

const SEVERITY_LABEL: Record<OutlineIssue["severity"], string> = {
  xeta: "xəta",
  xeberdarliq: "xəbərdarlıq",
};

export function BasliqStrukturuTool() {
  const [html, setHtml] = useState("");

  const headings = useMemo(() => extractHeadings(html), [html]);
  const issues = useMemo(() => auditOutline(headings), [headings]);
  const tree = useMemo(() => buildOutlineTree(headings), [headings]);

  const errorCount = issues.filter((issue) => issue.severity === "xeta").length;
  const warningCount = issues.filter((issue) => issue.severity === "xeberdarliq").length;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Səhifənin HTML-i"
          action={
            <ToolButton size="chip" onClick={() => setHtml(SAMPLE_HTML)}>
              Nümunə ilə doldur
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="HTML" htmlFor="basliq-html">
            <ToolTextArea
              id="basliq-html"
              value={html}
              onChange={(event) => setHtml(event.target.value)}
              placeholder="Səhifənin HTML mənbəyini bura yapışdır (view-source və ya sağ klik → Səhifə mənbəyi)"
              spellCheck={false}
              className="min-h-56 font-mono text-sm"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {headings.length === 0 ? (
        <p className="font-ui text-sm text-muted">
          {html.trim() === ""
            ? "HTML yapışdırılınca başlıq ağacı burada görünəcək."
            : "Bu HTML-də H1-H6 başlığı tapılmadı."}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <ToolStat label="Başlıq sayı" value={String(headings.length)} />
            <ToolStat
              label="Xəta"
              value={String(errorCount)}
              tone={errorCount > 0 ? "warning" : "default"}
            />
            <ToolStat
              label="Xəbərdarlıq"
              value={String(warningCount)}
              tone={warningCount > 0 ? "accent" : "default"}
            />
          </div>

          <ToolResultPanel title="Ağac" hint={`${headings.length} başlıq`}>
            <div className="space-y-1 p-3">
              {tree.map((node, index) => (
                <OutlineNodeRow key={index} node={node} />
              ))}
            </div>
          </ToolResultPanel>

          <ToolResultPanel title="Problemlər" hint={`${issues.length} tapıntı`}>
            <div className="space-y-3 p-3">
              {issues.length === 0 ? (
                <ToolNote>Bu başlıq strukturunda heç bir problem tapılmadı.</ToolNote>
              ) : (
                issues.map((issue, index) => <IssueRow key={index} issue={issue} />)
              )}
            </div>
          </ToolResultPanel>
        </>
      )}

      <ToolNote title="Piksel həddi deyil, quruluş">
        Bu alət yalnız H1-H6 quruluşunu oxuyur — vizual ölçünü (CSS-lə böyük yazılmış paraqraf da
        başlıq kimi görünə bilər) yoxlamır. Yoxlanılan həmişə HTML tag-larının özüdür.
      </ToolNote>
    </div>
  );
}

function OutlineNodeRow({ node }: { node: OutlineNode }) {
  return (
    <div>
      <HeadingRow heading={node.heading} />
      {node.children.length > 0 && (
        <div className="border-l border-rule pl-3">
          {node.children.map((child, index) => (
            <OutlineNodeRow key={index} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function HeadingRow({ heading }: { heading: Heading }) {
  return (
    <div
      className="flex items-baseline gap-2 py-1"
      style={{ marginLeft: `${(heading.level - 1) * 1}rem` }}
    >
      <span className="shrink-0 font-ui text-[11px] text-muted">H{heading.level}</span>
      <span className={`min-w-0 text-sm/6 break-words ${heading.empty ? "text-muted italic" : ""}`}>
        {heading.empty ? "(boş)" : heading.text}
      </span>
    </div>
  );
}

function IssueRow({ issue }: { issue: OutlineIssue }) {
  return (
    <div className="border-l-2 border-rule pl-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-ui text-[11px] font-semibold text-accent-text">
          {SEVERITY_LABEL[issue.severity]}
        </span>
        {issue.heading !== null && (
          <span className="font-ui text-[11px] text-muted">
            H{issue.heading.level} · {issue.heading.empty ? "(boş)" : issue.heading.text}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm/6">{issue.message}</p>
    </div>
  );
}
