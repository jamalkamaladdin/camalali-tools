"use client";

import { useMemo, useState } from "react";
import { ToolSegmented } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolLabel,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  auditRows,
  ISSUE_LABELS,
  MAX_ROWS,
  META_ISSUES,
  parseDelimited,
  toCsv,
  toMetaRows,
  type MetaAudit,
} from "../lib/toplu-meta";
import {
  descriptionBudgetPx,
  SERP_DEVICE_LABELS,
  SERP_DEVICES,
  SERP_LIMITS,
  type SerpDevice,
} from "../lib/serp-onizleme";

/**
 * How many audited rows are drawn.
 *
 * The cap is on the table, not on the audit: all 2000 rows are measured, all
 * of them reach the summary and all of them go into the downloaded file. Only
 * the DOM is spared — two thousand rows of six cells is twelve thousand nodes
 * re-rendered on every keystroke in the textarea, which is what turns a paste
 * into a frozen tab.
 */
const VISIBLE_ROWS = 200;

const SAMPLE = [
  "url,title,description",
  "https://sayt.com/,Ana səhifə: sayt adı,Şirkət haqqında qısa məlumat və xidmətlərin siyahısı.",
  'https://sayt.com/xidmetler,Xidmətlər | Sayt adı,"Backend, verilənlər bazası və sistem dizaynı üzrə xidmətlər."',
  "https://sayt.com/xidmetler/backend,Xidmətlər | Sayt adı,Backend xidmətləri haqqında ətraflı məlumat.",
  "https://sayt.com/haqqimizda,Haqqımızda,",
  "https://sayt.com/elaqe,,Bizimlə əlaqə saxlamaq üçün telefon nömrəsi və ünvan.",
].join("\n");

const DEVICE_OPTIONS = SERP_DEVICES.map((device) => ({
  value: device,
  label: SERP_DEVICE_LABELS[device],
}));

/**
 * The file is built in the tab and handed to the browser's own download path —
 * nothing is uploaded to produce it. The byte-order mark is not decoration:
 * without it Excel opens a UTF-8 CSV in the local code page and every `ə` in
 * the visitor's own titles arrives as a question mark.
 */
function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function TopluMetaTool() {
  const [text, setText] = useState("");
  const [device, setDevice] = useState<SerpDevice>("desktop");

  const parsed = useMemo(() => parseDelimited(text), [text]);
  const rows = useMemo(() => toMetaRows(parsed.rows), [parsed.rows]);
  const { audits, summary } = useMemo(() => auditRows(rows, device), [rows, device]);

  const problemCount = audits.filter((audit) => audit.issues.length > 0).length;
  const presentIssues = META_ISSUES.filter((issue) => summary[issue] > 0);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Cədvəl"
          hint={
            text.trim() === ""
              ? undefined
              : parsed.delimiter === "\t"
                ? "tab ayırıcı"
                : `«${parsed.delimiter}» ayırıcı`
          }
          action={
            <>
              <ToolSegmented
                label="Ölçmə hansı ekrana görə aparılsın"
                options={DEVICE_OPTIONS}
                value={device}
                onChange={setDevice}
              />
              <ToolButton size="chip" onClick={() => setText(SAMPLE)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setText("")} disabled={text === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="p-4">
          <ToolField
            label="url, başlıq, təsvir"
            htmlFor="toplu-meta-input"
            note={`Vergül, nöqtəli vergül və ya tab: ayırıcı özü tanınır. Başlıq sətri varsa atılır. Bir dəfəyə ${MAX_ROWS} sətir.`}
          >
            <ToolTextArea
              id="toplu-meta-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"https://sayt.com/,Başlıq,Təsvir"}
              rows={8}
              spellCheck={false}
            />
          </ToolField>
        </div>
      </ToolPanel>

      {parsed.error !== null && (
        <ToolNote tone="accent" title="Diqqət">
          {parsed.error}
        </ToolNote>
      )}

      {audits.length > 0 && (
        <>
          <div className="@container">
            <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
              <ToolStat label="Sətir" value={audits.length} note={`${SERP_DEVICE_LABELS[device]} ölçüsü ilə`} />
              <ToolStat
                label="Problemli sətir"
                value={problemCount}
                note={`${audits.length - problemCount} sətir təmizdir`}
                tone={problemCount > 0 ? "warning" : "default"}
              />
              <ToolStat
                label="Təkrar başlıq"
                value={summary["tekrar-basliq"]}
                note="fərqli ünvanda eyni başlıq"
                tone={summary["tekrar-basliq"] > 0 ? "warning" : "default"}
              />
              <ToolStat
                label="Təkrar təsvir"
                value={summary["tekrar-tesvir"]}
                note="fərqli ünvanda eyni təsvir"
                tone={summary["tekrar-tesvir"] > 0 ? "warning" : "default"}
              />
            </div>
          </div>

          {presentIssues.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <ToolLabel>Növ üzrə</ToolLabel>
              {presentIssues.map((issue) => (
                <span key={issue} className="font-ui text-xs text-muted">
                  {ISSUE_LABELS[issue]} <span className="tabular-nums text-ink">{summary[issue]}</span>
                </span>
              ))}
            </div>
          )}

          <ToolResultPanel
            title="Nəticə"
            hint={
              audits.length > VISIBLE_ROWS
                ? `ilk ${VISIBLE_ROWS} sətir göstərilir, hamısı CSV-dədir`
                : undefined
            }
            action={
              <ToolButton
                size="chip"
                onClick={() => downloadCsv(toCsv(audits), "toplu-meta.csv")}
              >
                CSV kimi endir
              </ToolButton>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-ui text-xs">
                <thead>
                  <tr className="border-b border-result-rule text-left text-muted">
                    <th scope="col" className="p-2 font-normal">
                      Ünvan
                    </th>
                    <th scope="col" className="p-2 font-normal">
                      Başlıq
                    </th>
                    <th scope="col" className="p-2 font-normal">
                      Təsvir
                    </th>
                    <th scope="col" className="p-2 font-normal">
                      Hökm
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {audits.slice(0, VISIBLE_ROWS).map((audit, index) => (
                    <AuditRow
                      key={`${audit.row.url}-${index}`}
                      audit={audit}
                      titleLimit={SERP_LIMITS[device].titlePx}
                      descriptionLimit={descriptionBudgetPx(device)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </ToolResultPanel>
        </>
      )}

      <ToolNote tone="accent" title="Piksel eni təxmindir">
        Hər sətrin eni hərflərin Arial cədvəlindəki enlərinin cəmidir: azərbaycan hərfləri də
        cədvəldədir, ona görə azərbaycanca başlıq düzgün ölçülür. Google öz şrifti ilə çəkdiyinə görə
        rəqəm bir neçə faiz fərqlə düşə bilər. «Boş» və «təkrar» hökmləri isə təxmin deyil: onlar
        yapışdırdığın cədvəldəki faktdır.
      </ToolNote>
    </div>
  );
}

/** One audited page. The two measurements are printed beside their own limit, so a number never has to be remembered from the panel above. */
function AuditRow({
  audit,
  titleLimit,
  descriptionLimit,
}: {
  audit: MetaAudit;
  titleLimit: number;
  descriptionLimit: number;
}) {
  return (
    <tr className="border-b border-result-rule align-top last:border-0">
      <td className="max-w-64 p-2 break-all font-mono">{audit.row.url || ""}</td>
      <td className="p-2">
        <span className="block max-w-80 truncate">{audit.row.title || ""}</span>
        <span className="mt-0.5 block text-muted tabular-nums">
          {Array.from(audit.row.title).length} simvol · {audit.titlePx} / {titleLimit} px
        </span>
      </td>
      <td className="p-2">
        <span className="block max-w-96 truncate">{audit.row.description || ""}</span>
        <span className="mt-0.5 block text-muted tabular-nums">
          {Array.from(audit.row.description).length} simvol · {audit.descriptionPx} /{" "}
          {descriptionLimit} px
        </span>
      </td>
      <td className="p-2">
        {audit.issues.length === 0 ? (
          <span className="text-muted">uyğun</span>
        ) : (
          <span className="flex flex-col gap-0.5">
            {audit.issues.map((issue) => (
              <span key={issue} className="text-accent-text">
                {ISSUE_LABELS[issue]}
              </span>
            ))}
          </span>
        )}
      </td>
    </tr>
  );
}
