"use client";

import { useMemo, useState } from "react";
import { ToolField, ToolInput, ToolNote, ToolPanel, ToolPanelHeader, ToolResultPanel } from "./ui";
import { explain, findWarnings, parseRegex, type ExplainedNode, type Warning } from "../lib/regex-izahci";

const SAMPLE_PATTERN = "(?<year>\\d{4})-(\\d{2})-(\\d{2})";
const SAMPLE_FLAGS = "g";

const WARNING_TITLE: Record<Warning["kind"], string> = {
  backtracking: "Geriyə-izləmə riski",
  dot: "Qaçırılmamış nöqtə",
  "anchor-multiline": "Çoxsətirli lövbər gözləntisi",
};

function ExplainBranch({ node, depth }: { node: ExplainedNode; depth: number }) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <code className="rounded-sm bg-fill-3 px-1 py-px text-[0.9em]">{node.token || "∅"}</code>
        <span className="text-ios-subhead text-ink">{node.description}</span>
        {node.quantifier !== undefined && <span className="text-ios-footnote text-muted">— {node.quantifier}</span>}
      </div>
      {node.children !== undefined && node.children.length > 0 && (
        <ul className="mt-1 ml-3 space-y-1.5 border-l border-rule pl-3">
          {node.children.map((child, index) => (
            <ExplainBranch key={index} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function RegexIzahciTool() {
  const [pattern, setPattern] = useState(SAMPLE_PATTERN);
  const [flags, setFlags] = useState(SAMPLE_FLAGS);

  const parsed = useMemo(() => parseRegex(`/${pattern}/${flags}`), [pattern, flags]);

  const explained = useMemo(() => (parsed.ok ? explain(parsed.root) : null), [parsed]);
  const warnings = useMemo(() => (parsed.ok ? findWarnings(flags, parsed.root) : []), [parsed, flags]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Naxış" hint={parsed.ok ? `${parsed.groupCount} tutan qrup` : undefined} />
        <div className="grid grid-cols-[1fr_auto] gap-4 p-4">
          <ToolField label="Regex" htmlFor="regex-izahci-pattern">
            <ToolInput
              id="regex-izahci-pattern"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              className="font-mono"
              spellCheck={false}
              placeholder="\\d{4}-\\d{2}"
            />
          </ToolField>
          <ToolField label="Bayraqlar" htmlFor="regex-izahci-flags" hint="g, i, m, s, u">
            <ToolInput
              id="regex-izahci-flags"
              value={flags}
              onChange={(event) => setFlags(event.target.value.replace(/[^a-z]/gi, ""))}
              className="w-24 font-mono"
              spellCheck={false}
              placeholder="gim"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!parsed.ok && <ToolNote tone="accent">{parsed.error}</ToolNote>}

      {parsed.ok && explained !== null && (
        <ToolResultPanel title="İzah" hint={`${parsed.groupCount} qrup`}>
          <ul className="space-y-1.5 p-4">
            <ExplainBranch node={explained} depth={0} />
          </ul>
        </ToolResultPanel>
      )}

      {warnings.length > 0 && (
        <div className="space-y-3">
          {warnings.map((warning) => (
            <ToolNote key={warning.kind} tone="accent" title={WARNING_TITLE[warning.kind]}>
              {warning.message}
            </ToolNote>
          ))}
        </div>
      )}
    </div>
  );
}
