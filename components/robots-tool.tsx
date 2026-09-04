"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { ToolSegmented } from "./tabs";
import {
  buildRobotsTxt,
  buildTemplateConfig,
  checkUrl,
  parseRobotsTxt,
  ROBOTS_TEMPLATES,
  type RobotsBuilderConfig,
  type RobotsTemplateId,
  type RuleType,
} from "../lib/robots";

type Mode = "qur" | "yoxla";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "qur", label: "Qurucu" },
  { value: "yoxla", label: "Yoxlayıcı" },
];

const RULE_TYPE_OPTIONS: { value: RuleType; label: string }[] = [
  { value: "allow", label: "Allow" },
  { value: "disallow", label: "Disallow" },
];

/*
 * The three fields a rule row needs are the same three `RobotsRule` carries
 * plus a React key; kept as a distinct local type so removing or editing one
 * rule is an array splice on plain UI state, never a reach into the parsed
 * `RobotsGroup` shape the lib module owns.
 */
type RuleRow = { type: RuleType; path: string };
type GroupRow = { userAgents: string; rules: RuleRow[]; crawlDelay: string };

function groupRowsFromConfig(config: RobotsBuilderConfig): GroupRow[] {
  return config.groups.map((group) => ({
    userAgents: group.userAgents.join(", "),
    rules: group.rules.map((rule) => ({ type: rule.type, path: rule.path })),
    crawlDelay: group.crawlDelay === null ? "" : String(group.crawlDelay),
  }));
}

function configFromGroupRows(groups: GroupRow[], sitemapUrl: string): RobotsBuilderConfig {
  return {
    groups: groups.map((group) => ({
      userAgents: group.userAgents
        .split(",")
        .map((agent) => agent.trim())
        .filter((agent) => agent !== ""),
      rules: group.rules.filter((rule) => rule.path.trim() !== ""),
      crawlDelay: group.crawlDelay.trim() === "" ? null : Number(group.crawlDelay),
    })),
    sitemaps: sitemapUrl.trim() === "" ? [] : [sitemapUrl.trim()],
  };
}

const INITIAL_TEMPLATE: RobotsTemplateId = "acig";

/*
 * A worked example, not a blank box: pasting nothing tells a visitor nothing
 * about what the tool does. This is the textbook longest-match case (RFC 9309
 * §2.2.2) — "/p" beats "/" for "/page" purely on pattern length, which is the
 * one fact this whole tool exists to make visible.
 */
const SAMPLE_ROBOTS_TXT = `User-agent: *
Allow: /p
Disallow: /

Sitemap: https://sayt.com/sitemap.xml`;

export function RobotsTool() {
  const [mode, setMode] = useState<Mode>("qur");

  const [sitemapUrl, setSitemapUrl] = useState("");
  const [groups, setGroups] = useState<GroupRow[]>(() =>
    groupRowsFromConfig(buildTemplateConfig(INITIAL_TEMPLATE, "")),
  );

  const config = useMemo(() => configFromGroupRows(groups, sitemapUrl), [groups, sitemapUrl]);
  const robotsTxt = useMemo(() => buildRobotsTxt(config), [config]);

  const applyTemplate = (id: RobotsTemplateId) => {
    setGroups(groupRowsFromConfig(buildTemplateConfig(id, sitemapUrl)));
  };

  const addGroup = () => setGroups((prev) => [...prev, { userAgents: "*", rules: [], crawlDelay: "" }]);
  const removeGroup = (index: number) =>
    setGroups((prev) => prev.filter((_, i) => i !== index));
  const updateGroup = (index: number, patch: Partial<GroupRow>) =>
    setGroups((prev) => prev.map((group, i) => (i === index ? { ...group, ...patch } : group)));
  const addRule = (groupIndex: number) =>
    setGroups((prev) =>
      prev.map((group, i) =>
        i === groupIndex ? { ...group, rules: [...group.rules, { type: "disallow", path: "/" }] } : group,
      ),
    );
  const updateRule = (groupIndex: number, ruleIndex: number, patch: Partial<RuleRow>) =>
    setGroups((prev) =>
      prev.map((group, i) =>
        i === groupIndex
          ? { ...group, rules: group.rules.map((rule, r) => (r === ruleIndex ? { ...rule, ...patch } : rule)) }
          : group,
      ),
    );
  const removeRule = (groupIndex: number, ruleIndex: number) =>
    setGroups((prev) =>
      prev.map((group, i) =>
        i === groupIndex ? { ...group, rules: group.rules.filter((_, r) => r !== ruleIndex) } : group,
      ),
    );

  const [checkerText, setCheckerText] = useState(SAMPLE_ROBOTS_TXT);
  const [checkerAgent, setCheckerAgent] = useState("*");
  const [checkerPath, setCheckerPath] = useState("/page");

  const checkerResult = useMemo(() => {
    if (checkerText.trim() === "" || checkerPath.trim() === "") return null;
    const parsed = parseRobotsTxt(checkerText);
    return checkUrl(parsed, checkerAgent.trim() === "" ? "*" : checkerAgent, checkerPath.trim());
  }, [checkerText, checkerAgent, checkerPath]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="robots.txt"
          action={<ToolSegmented options={MODE_OPTIONS} value={mode} onChange={setMode} />}
        />

        {mode === "qur" ? (
          <div className="space-y-4 p-4">
            <div>
              <p className="mb-1.5 font-ui text-[11px] text-muted">Hazır şablon</p>
              <div className="flex flex-wrap gap-1.5">
                {ROBOTS_TEMPLATES.map((template) => (
                  <ToolButton key={template.id} size="chip" onClick={() => applyTemplate(template.id)}>
                    {template.label}
                  </ToolButton>
                ))}
              </div>
            </div>

            <ToolField label="Sitemap ünvanı" htmlFor="robots-sitemap" hint="Sitemap:">
              <ToolInput
                id="robots-sitemap"
                value={sitemapUrl}
                onChange={(event) => setSitemapUrl(event.target.value)}
                placeholder="https://sayt.com/sitemap.xml"
              />
            </ToolField>

            <div className="space-y-3">
              {groups.map((group, groupIndex) => (
                <div key={groupIndex} className="rounded border border-rule p-3">
                  <div className="flex items-end gap-2">
                    <ToolField
                      label="User-agent"
                      hint="vergüllə ayır"
                      className="flex-1"
                    >
                      <ToolInput
                        value={group.userAgents}
                        onChange={(event) => updateGroup(groupIndex, { userAgents: event.target.value })}
                        placeholder="*"
                      />
                    </ToolField>
                    <ToolField label="Crawl-delay" hint="saniyə">
                      <ToolInput
                        type="number"
                        min={0}
                        className="w-24"
                        value={group.crawlDelay}
                        onChange={(event) => updateGroup(groupIndex, { crawlDelay: event.target.value })}
                      />
                    </ToolField>
                    <ToolButton size="chip" onClick={() => removeGroup(groupIndex)}>
                      Qrupu sil
                    </ToolButton>
                  </div>

                  <div className="mt-3 space-y-2">
                    {group.rules.map((rule, ruleIndex) => (
                      <div key={ruleIndex} className="flex items-center gap-2">
                        <ToolSegmented
                          label="Qayda növü"
                          options={RULE_TYPE_OPTIONS}
                          value={rule.type}
                          onChange={(value) => updateRule(groupIndex, ruleIndex, { type: value })}
                        />
                        <ToolInput
                          value={rule.path}
                          onChange={(event) => updateRule(groupIndex, ruleIndex, { path: event.target.value })}
                          placeholder="/yol"
                          className="flex-1 font-mono"
                        />
                        <ToolButton size="chip" onClick={() => removeRule(groupIndex, ruleIndex)}>
                          Sil
                        </ToolButton>
                      </div>
                    ))}
                    <ToolButton size="chip" onClick={() => addRule(groupIndex)}>
                      Qayda əlavə et
                    </ToolButton>
                  </div>
                </div>
              ))}
              <ToolButton size="chip" onClick={addGroup}>
                Yeni qrup
              </ToolButton>
            </div>

            <ToolResultPanel
              title="robots.txt"
              action={<CopyButton value={robotsTxt} label="kopyala" />}
            >
              <ToolOutput className="m-3">{robotsTxt}</ToolOutput>
            </ToolResultPanel>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <ToolField label="robots.txt mətni" htmlFor="robots-paste">
              <ToolTextArea
                id="robots-paste"
                value={checkerText}
                onChange={(event) => setCheckerText(event.target.value)}
                rows={8}
                className="font-mono"
                spellCheck={false}
              />
            </ToolField>

            <div className="flex items-end gap-3">
              <ToolField label="Bot (User-agent)" htmlFor="robots-agent" className="flex-1">
                <ToolInput
                  id="robots-agent"
                  value={checkerAgent}
                  onChange={(event) => setCheckerAgent(event.target.value)}
                  placeholder="Googlebot"
                />
              </ToolField>
              <ToolField label="Yol" htmlFor="robots-path" className="flex-1">
                <ToolInput
                  id="robots-path"
                  value={checkerPath}
                  onChange={(event) => setCheckerPath(event.target.value)}
                  placeholder="/sehife"
                  className="font-mono"
                />
              </ToolField>
              <ToolButton size="chip" onClick={() => setCheckerText(robotsTxt)}>
                Qurucudan gətir
              </ToolButton>
            </div>

            {checkerResult && (
              <div className="space-y-3">
                <ToolStat
                  label="Nəticə"
                  value={checkerResult.allowed ? "İcazə var" : "Bloklanıb"}
                  tone={checkerResult.allowed ? "default" : "warning"}
                />
                {checkerResult.matchedRule ? (
                  <ToolNote tone={checkerResult.allowed ? "info" : "accent"} title="Qalib gələn qayda">
                    <span className="font-mono text-sm">
                      {checkerResult.matchedRule.type === "allow" ? "Allow" : "Disallow"}:{" "}
                      {checkerResult.matchedRule.path}
                    </span>{" "}
                    — <span className="font-mono">{checkerResult.matchedRule.userAgents.join(", ")}</span> qrupundan
                    {checkerResult.usedWildcardFallback &&
                      " (bu bot üçün ayrıca qrup yoxdur, * qrupu işlədi)"}
                    .
                  </ToolNote>
                ) : (
                  <ToolNote tone="info">
                    Heç bir qayda bu yola uyğun gəlmədi — defolt olaraq icazə verilir.
                  </ToolNote>
                )}
              </div>
            )}
          </div>
        )}
      </ToolPanel>
    </div>
  );
}
