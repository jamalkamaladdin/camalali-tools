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
  auditLlmsTxt,
  buildLlmsTxt,
  EMPTY_LLMS_DOC,
  type LlmsDoc,
  type LlmsLink,
} from "../lib/llms-txt";

type Mode = "qur" | "yoxla";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "qur", label: "Qurucu" },
  { value: "yoxla", label: "Yoxlayıcı" },
];

const EMPTY_LINK: LlmsLink = { title: "", url: "", note: "" };

function initialDoc(): LlmsDoc {
  return { ...EMPTY_LLMS_DOC, sections: [{ heading: "", optional: false, links: [{ ...EMPTY_LINK }] }] };
}

const SAMPLE_DOC: LlmsDoc = {
  name: "camalali.com",
  summary: "Full-stack development və texniki SEO xidmətləri göstərən sayt.",
  details:
    "Sayt xidmətlər, bloq və pulsuz veb-developer alətləri bölmələrindən ibarətdir. Bütün kontent azərbaycan dilindədir.",
  sections: [
    {
      heading: "Xidmətlər",
      optional: false,
      links: [
        {
          title: "Proqram təminatının hazırlanması",
          url: "https://camalali.com/xidmetler/proqram-teminatinin-hazirlanmasi",
          note: "Full-stack veb tətbiq inkişafı",
        },
        {
          title: "SEO texniki auditi",
          url: "https://camalali.com/alt-xidmetler/seo-texniki-audit",
          note: "Texniki SEO problemlərinin tapılması",
        },
      ],
    },
    {
      heading: "Alətlər",
      optional: false,
      links: [
        {
          title: "Alətlər siyahısı",
          url: "https://camalali.com/alet",
          note: "Pulsuz veb-developer alətləri",
        },
      ],
    },
    {
      heading: "Arxiv",
      optional: true,
      links: [{ title: "Bloq arxivi", url: "https://camalali.com/arxiv", note: "Köhnə yazılar" }],
    },
  ],
};

/*
 * A worked example with one deliberate defect (a relative URL) rather than a
 * clean file — pasting nothing tells a visitor nothing about what the
 * checker actually catches. Built from concatenated single-line strings
 * rather than a multiline template literal, purely so no line of this
 * source file happens to start with the "#" this sample's own markdown
 * heading needs.
 */
const SAMPLE_CHECK_TEXT =
  "# camalali.com\n" +
  "\n" +
  "> Full-stack development və texniki SEO xidmətləri göstərən sayt.\n" +
  "\n" +
  "## Xidmətlər\n" +
  "- [Proqram təminatının hazırlanması](https://camalali.com/xidmetler/proqram-teminatinin-hazirlanmasi): Full-stack veb tətbiq inkişafı\n" +
  "- [SEO texniki auditi](/alt-xidmetler/seo-texniki-audit): Texniki SEO problemlərinin tapılması\n" +
  "\n" +
  "## Optional\n" +
  "- [Bloq arxivi](https://camalali.com/arxiv): Köhnə yazılar\n";

export function LlmsTxtTool() {
  const [mode, setMode] = useState<Mode>("qur");
  const [doc, setDoc] = useState<LlmsDoc>(initialDoc);

  const builtText = useMemo(() => buildLlmsTxt(doc), [doc]);

  const updateDoc = (patch: Partial<Pick<LlmsDoc, "name" | "summary" | "details">>) =>
    setDoc((prev) => ({ ...prev, ...patch }));

  const addSection = () =>
    setDoc((prev) => ({ ...prev, sections: [...prev.sections, { heading: "", optional: false, links: [] }] }));
  const removeSection = (sectionIndex: number) =>
    setDoc((prev) => ({ ...prev, sections: prev.sections.filter((_, i) => i !== sectionIndex) }));
  const updateSection = (sectionIndex: number, heading: string, optional: boolean) =>
    setDoc((prev) => ({
      ...prev,
      sections: prev.sections.map((section, i) =>
        i === sectionIndex ? { ...section, heading, optional } : section,
      ),
    }));
  const addLink = (sectionIndex: number) =>
    setDoc((prev) => ({
      ...prev,
      sections: prev.sections.map((section, i) =>
        i === sectionIndex ? { ...section, links: [...section.links, { ...EMPTY_LINK }] } : section,
      ),
    }));
  const removeLink = (sectionIndex: number, linkIndex: number) =>
    setDoc((prev) => ({
      ...prev,
      sections: prev.sections.map((section, i) =>
        i === sectionIndex
          ? { ...section, links: section.links.filter((_, l) => l !== linkIndex) }
          : section,
      ),
    }));
  const updateLink = (sectionIndex: number, linkIndex: number, patch: Partial<LlmsLink>) =>
    setDoc((prev) => ({
      ...prev,
      sections: prev.sections.map((section, i) =>
        i === sectionIndex
          ? {
              ...section,
              links: section.links.map((link, l) => (l === linkIndex ? { ...link, ...patch } : link)),
            }
          : section,
      ),
    }));

  const [checkerText, setCheckerText] = useState(SAMPLE_CHECK_TEXT);
  const auditResult = useMemo(
    () => (checkerText.trim() === "" ? null : auditLlmsTxt(checkerText)),
    [checkerText],
  );
  const errorCount = auditResult?.issues.filter((issue) => issue.severity === "xeta").length ?? 0;
  const warningCount = auditResult?.issues.filter((issue) => issue.severity === "xeberdarliq").length ?? 0;

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="info" title="Bunu bilmək vacibdir">
        llms.txt rəsmi standart deyil: 2024-də bir təşkilat tərəfindən irəli sürülmüş qeyri-rəsmi bir
        təklifdir, heç bir axtarış sistemi və ya AI model təminatçısı onu rəsmən qəbul etməyib. Fayl
        zərərsizdir və hazırlanması ucuzdur, amma hazırda əsas model təminatçılarının çoxu onu oxumur:
        «AI axtarışında birinci olacaqsan» kimi bir nəticə vəd etmir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="llms.txt"
          action={<ToolSegmented options={MODE_OPTIONS} value={mode} onChange={setMode} />}
        />

        {mode === "qur" ? (
          <div className="space-y-4 p-4">
            <div className="flex justify-end">
              <ToolButton size="chip" onClick={() => setDoc(SAMPLE_DOC)}>
                Nümunə
              </ToolButton>
            </div>

            <ToolField label="Sayt adı" htmlFor="llms-name" hint="# başlığı">
              <ToolInput
                id="llms-name"
                value={doc.name}
                onChange={(event) => updateDoc({ name: event.target.value })}
                placeholder="sayt.az"
              />
            </ToolField>

            <ToolField label="Bir cümləlik xülasə" htmlFor="llms-summary" hint="> sətri">
              <ToolInput
                id="llms-summary"
                value={doc.summary}
                onChange={(event) => updateDoc({ summary: event.target.value })}
                placeholder="Bu saytın nə etdiyini bir cümlə ilə de"
              />
            </ToolField>

            <ToolField label="İzah" htmlFor="llms-details" hint="sərbəst mətn">
              <ToolTextArea
                id="llms-details"
                value={doc.details}
                onChange={(event) => updateDoc({ details: event.target.value })}
                placeholder="Bir-iki abzasla saytın nədən ibarət olduğunu izah et…"
                rows={3}
              />
            </ToolField>

            <div className="space-y-3">
              {doc.sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="rounded border border-rule p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <ToolField label="Bölmə başlığı" className="flex-1">
                      <ToolInput
                        value={section.optional ? "Optional" : section.heading}
                        disabled={section.optional}
                        onChange={(event) => updateSection(sectionIndex, event.target.value, false)}
                        placeholder="Xidmətlər"
                      />
                    </ToolField>
                    <label className="flex items-center gap-1.5 pb-2 font-ui text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={section.optional}
                        onChange={(event) =>
                          updateSection(sectionIndex, section.heading, event.target.checked)
                        }
                        className="size-4 accent-[var(--color-accent)]"
                      />
                      Optional (az vacib)
                    </label>
                    <ToolButton size="chip" onClick={() => removeSection(sectionIndex)}>
                      Bölməni sil
                    </ToolButton>
                  </div>

                  <div className="mt-3 space-y-2">
                    {section.links.map((link, linkIndex) => (
                      <div key={linkIndex} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                        <ToolInput
                          value={link.title}
                          onChange={(event) =>
                            updateLink(sectionIndex, linkIndex, { title: event.target.value })
                          }
                          placeholder="Ad"
                          aria-label={`${sectionIndex + 1}-ci bölmə, ${linkIndex + 1}-ci linkin adı`}
                          className="h-8 text-xs"
                        />
                        <ToolInput
                          value={link.url}
                          onChange={(event) =>
                            updateLink(sectionIndex, linkIndex, { url: event.target.value })
                          }
                          placeholder="https://sayt.az/yol"
                          aria-label={`${sectionIndex + 1}-ci bölmə, ${linkIndex + 1}-ci linkin ünvanı`}
                          className="h-8 font-mono text-xs"
                        />
                        <ToolInput
                          value={link.note}
                          onChange={(event) =>
                            updateLink(sectionIndex, linkIndex, { note: event.target.value })
                          }
                          placeholder="qısa izah"
                          aria-label={`${sectionIndex + 1}-ci bölmə, ${linkIndex + 1}-ci linkin izahı`}
                          className="h-8 text-xs"
                        />
                        <ToolButton size="chip" onClick={() => removeLink(sectionIndex, linkIndex)}>
                          Sil
                        </ToolButton>
                      </div>
                    ))}
                    <ToolButton size="chip" onClick={() => addLink(sectionIndex)}>
                      Link əlavə et
                    </ToolButton>
                  </div>
                </div>
              ))}
              <ToolButton size="chip" onClick={addSection}>
                Yeni bölmə
              </ToolButton>
            </div>

            <ToolResultPanel title="llms.txt" action={<CopyButton value={builtText} label="kopyala" />}>
              <ToolOutput className="m-3">{builtText}</ToolOutput>
            </ToolResultPanel>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <ToolField label="llms.txt mətni" htmlFor="llms-paste">
              <ToolTextArea
                id="llms-paste"
                value={checkerText}
                onChange={(event) => setCheckerText(event.target.value)}
                rows={12}
                className="font-mono"
                spellCheck={false}
              />
            </ToolField>

            <div className="flex flex-wrap gap-2">
              <ToolButton size="chip" onClick={() => setCheckerText(SAMPLE_CHECK_TEXT)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setCheckerText(builtText)}>
                Qurucudan gətir
              </ToolButton>
            </div>

            {auditResult && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <ToolStat label="Başlıq" value={auditResult.doc?.name.trim() || ""} />
                  <ToolStat label="Xəta" value={errorCount} tone={errorCount > 0 ? "warning" : "default"} />
                  <ToolStat
                    label="Xəbərdarlıq"
                    value={warningCount}
                    tone={warningCount > 0 ? "accent" : "default"}
                  />
                </div>

                {auditResult.issues.length === 0 ? (
                  <ToolNote tone="info">Quruluş problemi tapılmadı.</ToolNote>
                ) : (
                  <div className="space-y-2">
                    {auditResult.issues.map((issue, index) => (
                      <ToolNote
                        key={index}
                        tone={issue.severity === "xeta" ? "accent" : "info"}
                        title={`${issue.severity === "xeta" ? "Xəta" : "Xəbərdarlıq"} (sətir ${issue.line})`}
                      >
                        {issue.message}
                      </ToolNote>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </ToolPanel>
    </div>
  );
}
