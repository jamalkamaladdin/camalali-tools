"use client";

import { useMemo, useState } from "react";
import { markdownToHtml } from "../lib/markdown";
import { CopyButton } from "../shared/copy-button";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";

/*
 * Demonstrates every construct `markdownToHtml` recognises, including the
 * two shapes a visitor most needs reassurance about: a fenced code block
 * (its asterisks must stay literal, not turn into <strong>) and a plain
 * link (proof the tool still renders ordinary markdown once the dangerous
 * schemes are gone). Built as a plain string, not a template literal, so
 * none of the backticks or dollar-brace pairs inside the sample need
 * escaping against the file's own syntax.
 */
const SAMPLE = [
  "# Nümunə sənəd",
  "",
  "Bu mətndə **qalın**, *kursiv*, ~~üstündən xətt~~ və `inline kod` var.",
  "",
  "## Kod bloku",
  "",
  "```ts",
  "function salam(ad) {",
  "  return `Salam, ${ad}!`;",
  "}",
  "```",
  "",
  "Kod blokunun içindəki `**ulduzlar**` formatlanmır — mətn olaraq qalır.",
  "",
  "## Siyahılar",
  "",
  "- Birinci maddə",
  "  - Alt maddə",
  "  - Digər alt maddə",
  "- İkinci maddə",
  "",
  "1. Addım bir",
  "2. Addım iki",
  "",
  "## Sitat və üfüqi xətt",
  "",
  "> Bu bir sitatdır.",
  "",
  "---",
  "",
  "## Link və şəkil",
  "",
  "[Camalali](https://camalali.com) və ![nümunə şəkil](https://picsum.photos/200)",
  "",
  "## Cədvəl",
  "",
  "| Ad | Dil |",
  "| --- | --- |",
  "| Cəmalı | Azərbaycan |",
  "",
  "Sətir sonu üçün iki boşluq qoyulur —  ",
  "bu sətir yenisinin üstündədir.",
].join("\n");

/*
 * Tailwind's arbitrary-descendant-selector syntax styles every tag
 * `markdownToHtml` can emit without a typography plugin — this project adds
 * no dependencies, and every other surface on the site is already
 * hand-styled with the same token classes these lines reuse (`border-rule`,
 * `bg-surface`, `text-muted`, `text-accent-text`).
 */
const PREVIEW_CLASS =
  "min-w-0 p-4 font-ui text-sm/6 text-ink " +
  "[&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:first:mt-0 " +
  "[&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:first:mt-0 " +
  "[&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold " +
  "[&_h4]:mt-3 [&_h4]:text-sm [&_h4]:font-semibold " +
  "[&_h5]:mt-2 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:text-muted " +
  "[&_h6]:mt-2 [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:text-muted " +
  "[&_p]:my-2 [&_strong]:font-semibold [&_em]:italic " +
  "[&_del]:text-muted [&_del]:line-through " +
  "[&_a]:text-accent-text [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:no-underline " +
  "[&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] " +
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-rule [&_pre]:bg-surface [&_pre]:p-3 " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:my-1 [&_li_ul]:mt-1 [&_li_ol]:mt-1 " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-rule [&_blockquote]:pl-3 [&_blockquote]:text-muted " +
  "[&_hr]:my-4 [&_hr]:border-rule " +
  "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse " +
  "[&_th]:border [&_th]:border-rule [&_th]:bg-surface [&_th]:p-1.5 [&_th]:text-left " +
  "[&_td]:border [&_td]:border-rule [&_td]:p-1.5 [&_img]:my-2 [&_img]:max-w-full";

export function MarkdownTool() {
  const [source, setSource] = useState("");

  /*
   * A deterministic function of visible state, unlike this folder's uuid and
   * numune-metn tools — there is no randomness or `crypto` call inside
   * `markdownToHtml`, so the server and the client compute the same string
   * for the same `source` and no browser gate is needed before calling it.
   */
  const html = useMemo(() => markdownToHtml(source), [source]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Markdown"
          action={
            <ToolButton size="chip" onClick={() => setSource(SAMPLE)}>
              Nümunə
            </ToolButton>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-2">
          <ToolField label="Markdown mətni" htmlFor="markdown-source">
            <ToolTextArea
              id="markdown-source"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="# Başlıq, **qalın**, [link](https://…)"
              spellCheck={false}
              className="min-h-80 font-mono text-sm"
            />
          </ToolField>

          <ToolResultPanel title="Canlı nəticə" className="min-w-0">
            {source.trim() === "" ? (
              <p className="p-4 font-ui text-sm text-muted">
                Solda markdown yazın — nəticə burada canlı görünəcək.
              </p>
            ) : (
              // The one dangerouslySetInnerHTML on this page, fed only by
              // `markdownToHtml` — a function whose entire contract (see the
              // header comment in lib/tools/markdown.ts) is that it never
              // emits a byte of HTML the visitor typed, only tags it builds
              // itself around already-escaped text.
              <div className={PREVIEW_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
            )}
          </ToolResultPanel>
        </div>

        <div className="border-t border-rule p-4">
          <ToolNote>
            Nəticə həmişə qaçırılmış (escaped) mətndən qurulur — yazdığın ham
            HTML heç vaxt işə düşmür, yalnız ekranda görünən mətnə çevrilir.
            javascript: və data: ünvanlı linklər saxlanmır.
          </ToolNote>
        </div>
      </ToolPanel>

      <ToolAccordion>
        <ToolAccordionItem summary="HTML mənbəyi" hint="kopyalana bilər">
          <ToolResultPanel
            title="HTML"
            action={<CopyButton value={html} label="html-i kopyala" />}
            className="min-w-0"
          >
            <ToolOutput className="m-3 max-h-96 overflow-y-auto">
              {html === "" ? <span className="text-muted">—</span> : html}
            </ToolOutput>
          </ToolResultPanel>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}
