"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  DESCRIPTION_FONT_PX,
  descriptionBudgetPx,
  displayUrl,
  judgeDescription,
  judgeTitle,
  PREVIEW_FONT_STACK,
  SERP_DEVICE_LABELS,
  SERP_DEVICES,
  SERP_LIMITS,
  TITLE_FONT_PX,
  truncateToWidth,
  VERDICT_LABELS,
  type LengthReading,
  type SerpDevice,
} from "../lib/serp-onizleme";
import { ToolSegmented } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";

type Fields = {
  title: string;
  description: string;
  url: string;
  siteName: string;
  date: string;
};

const EMPTY_FIELDS: Fields = { title: "", description: "", url: "", siteName: "", date: "" };

const SAMPLE: Fields = {
  title: "WebSocket nədir və nə vaxt HTTP-dən yaxşıdır: praktik izah",
  description:
    "WebSocket bağlantısının HTTP sorğusundan fərqi, əl sıxma mərhələsi, hansı hallarda long polling kifayət edir və hansı hallarda etmir, real layihə nümunələri ilə.",
  url: "https://camalali.com/bloq/websocket-nedir",
  siteName: "camalali",
  date: "12 avqust 2026",
};

const DEVICE_OPTIONS = SERP_DEVICES.map((device) => ({
  value: device,
  label: SERP_DEVICE_LABELS[device],
}));

/** A verdict decides the emphasis a stat is drawn with: over the limit is the loud one, under it is the quiet nudge. */
function toneFor(verdict: LengthReading["verdict"]): "default" | "accent" | "warning" {
  if (verdict === "uzun") return "warning";
  if (verdict === "qisa") return "accent";
  return "default";
}

export function SerpOnizlemeTool() {
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [device, setDevice] = useState<SerpDevice>("desktop");

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const title = useMemo(() => judgeTitle(fields.title, device), [fields.title, device]);
  const description = useMemo(
    () => judgeDescription(fields.description, device),
    [fields.description, device],
  );

  /* What the estimate says would survive the cut. The preview beside it makes
     the real cut; this line is here so the visitor can copy the shortened text
     rather than count backwards from a highlighted box. */
  const trimmedTitle = useMemo(
    () => truncateToWidth(fields.title, SERP_LIMITS[device].titlePx, TITLE_FONT_PX),
    [fields.title, device],
  );

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Sahələr"
          action={
            <ToolButton size="chip" onClick={() => setFields(SAMPLE)}>
              Nümunə ilə doldur
            </ToolButton>
          }
        />

        {/* The container, not the viewport: this widget is opened inside a
            window whose width has nothing to do with the screen's. */}
        <div className="@container">
          <div className="grid gap-4 p-4 @min-[34rem]:grid-cols-2">
            <ToolField
              label="Başlıq"
              htmlFor="serp-title"
              hint={`${title.px} / ${SERP_LIMITS[device].titlePx} px`}
            >
              <ToolInput
                id="serp-title"
                value={fields.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="Səhifənin başlığı"
              />
            </ToolField>

            <ToolField label="Ünvan" htmlFor="serp-url" hint="başlığın üstündəki sətir">
              <ToolInput
                id="serp-url"
                value={fields.url}
                onChange={(event) => set("url", event.target.value)}
                placeholder="https://sayt.com/bolme/sehife"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>

            <div className="@min-[34rem]:col-span-2">
              <ToolField
                label="Təsvir"
                htmlFor="serp-description"
                hint={`${description.px} / ${descriptionBudgetPx(device)} px`}
              >
                <ToolTextArea
                  id="serp-description"
                  value={fields.description}
                  onChange={(event) => set("description", event.target.value)}
                  placeholder="Səhifənin qısa təsviri"
                  rows={3}
                />
              </ToolField>
            </div>

            <ToolField label="Sayt adı" htmlFor="serp-site-name" hint="opsional">
              <ToolInput
                id="serp-site-name"
                value={fields.siteName}
                onChange={(event) => set("siteName", event.target.value)}
                placeholder="Saytın adı"
              />
            </ToolField>

            <ToolField
              label="Tarix"
              htmlFor="serp-date"
              hint="opsional"
              note="Google bəzi nəticələrdə təsvirin əvvəlinə dərc tarixini qoyur: o da təsvirin yerindən yeyir."
            >
              <ToolInput
                id="serp-date"
                value={fields.date}
                onChange={(event) => set("date", event.target.value)}
                placeholder="12 avqust 2026"
              />
            </ToolField>
          </div>
        </div>
      </ToolPanel>

      <ToolResultPanel
        title="Önizləmə"
        hint="qutuların eni sabitdir"
        action={
          <ToolSegmented
            label="Ölçmə hansı ekrana görə aparılsın"
            options={DEVICE_OPTIONS}
            value={device}
            onChange={setDevice}
          />
        }
      >
        <div className="space-y-5 p-3">
          {SERP_DEVICES.map((previewDevice) => (
            <div key={previewDevice}>
              <ToolLabel>{SERP_DEVICE_LABELS[previewDevice]}</ToolLabel>
              <SnippetPreview device={previewDevice} fields={fields} />
            </div>
          ))}
        </div>
      </ToolResultPanel>

      <div className="@container">
        <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          <ToolStat label="Başlıq: simvol" value={title.chars} note={`${SERP_DEVICE_LABELS[device]} ölçüsü`} />
          <ToolStat
            label="Başlıq: təxmini en"
            value={`${title.px} px`}
            note={`${VERDICT_LABELS[title.verdict]} · hədd ${SERP_LIMITS[device].titlePx} px`}
            tone={toneFor(title.verdict)}
          />
          <ToolStat label="Təsvir: simvol" value={description.chars} note={`${SERP_DEVICE_LABELS[device]} ölçüsü`} />
          <ToolStat
            label="Təsvir: təxmini en"
            value={`${description.px} px`}
            note={`${VERDICT_LABELS[description.verdict]} · hədd ${descriptionBudgetPx(device)} px`}
            tone={toneFor(description.verdict)}
          />
        </div>
      </div>

      {trimmedTitle.truncated && (
        <ToolNote title={`Başlıq ${SERP_DEVICE_LABELS[device]} ekranda təxminən belə qalır`}>
          <p className="font-ui text-sm break-words">{trimmedTitle.text}</p>
        </ToolNote>
      )}

      <ToolNote tone="accent" title="Rəqəm təxmindir, qutu isə deyil">
        Piksel eni hər hərfin Arial cədvəlindəki eninin cəmidir — azərbaycan hərfləri də cədvəldədir.
        Google öz şrifti ilə çəkdiyinə görə rəqəm adətən bir neçə faiz fərqlə düşür, yəni bu, təxmindir.
        Yuxarıdakı önizləmə isə təxmin deyil: qutu bildirilən sətir enində sabit saxlanılır və mətni
        brauzerin öz kəsmə qaydası kəsir. Dar pəncərədə qutu daralmır — sətir sürüşür, çünki eni
        dəyişsə kəsilmə də yalan olardı.
      </ToolNote>
    </div>
  );
}

/*
 * One result, drawn at the reported clipping geometry.
 *
 * Geometry, not palette: the box widths, the two font sizes and the line count
 * are Google's reported numbers, because they are what decides where the text
 * stops. The colours are this site's own tokens rather than a hardcoded Google
 * blue — a fixed hex would be the one thing on the page that ignores the skin,
 * and `#1a0dab` on the dark themes measured worse than the ink it replaced.
 * The claim this preview makes is about width, not about hue.
 *
 * The font family is not a free choice either: the width table was taken from
 * Arial, so the box has to be drawn in Arial for the visible cut and the
 * printed estimate to agree.
 */
function SnippetPreview({ device, fields }: { device: SerpDevice; fields: Fields }) {
  const limits = SERP_LIMITS[device];
  const title = fields.title.trim() || "Başlıq buraya yazılacaq";
  const description = fields.description.trim() || "Təsvir buraya yazılacaq";
  const siteLabel = fields.siteName.trim() || displayUrl(fields.url).split(" ")[0];
  const date = fields.date.trim();

  const clampToLines: CSSProperties = {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: limits.descriptionLines,
    fontSize: DESCRIPTION_FONT_PX,
    lineHeight: 1.5,
    width: limits.descriptionPx,
  };

  return (
    /* Scrolled, never squeezed. A box narrowed to fit the window would cut the
       text somewhere Google never would, which is the one thing this preview
       must not do. */
    <div className="mt-2 overflow-x-auto rounded border border-rule bg-surface p-3">
      <div style={{ fontFamily: PREVIEW_FONT_STACK }}>
        <div className="flex items-center gap-2" style={{ width: limits.titlePx }}>
          <span aria-hidden className="size-6 shrink-0 rounded-full border border-rule bg-hover" />
          <span className="min-w-0">
            <span className="block truncate text-sm">{siteLabel}</span>
            <span className="block truncate text-xs text-muted">{displayUrl(fields.url)}</span>
          </span>
        </div>

        <p
          className="mt-2 truncate"
          style={{ width: limits.titlePx, fontSize: TITLE_FONT_PX, lineHeight: 1.3 }}
        >
          {title}
        </p>

        <p className="mt-1 overflow-hidden" style={clampToLines}>
          {date !== "" && <span className="text-muted">{date} — </span>}
          {description}
        </p>
      </div>
    </div>
  );
}
