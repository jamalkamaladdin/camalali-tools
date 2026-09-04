"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import { ToolSegmented } from "./tabs";
import {
  buildMetaHtml,
  buildNextMetadataCode,
  checkLength,
  DESCRIPTION_SOFT_LIMIT,
  EMPTY_META_FIELDS,
  extractDisplayDomain,
  resolveImageUrl,
  TITLE_SOFT_LIMIT,
  type LengthCheck,
  type MetaFields,
  type TwitterCardType,
} from "../lib/meta";

type OutputFormat = "html" | "next";

const OUTPUT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: "html", label: "HTML" },
  { value: "next", label: "Next.js" },
];

const TWITTER_CARD_OPTIONS: { value: TwitterCardType; label: string }[] = [
  { value: "summary", label: "summary" },
  { value: "summary_large_image", label: "summary_large_image" },
];

const SAMPLE: MetaFields = {
  title: "Kod incəliklərini izah edən jurnal",
  description:
    "Backend, verilənlər bazası və sistem dizaynı haqqında Azərbaycan dilində praktik yazılar — real layihələrdən çıxarılan qərar və səbəblər.",
  url: "https://camalali.com/bloq/websocket-nedir",
  image: "/og/websocket-nedir.png",
  siteName: "camalali",
  locale: "az_AZ",
  twitterCard: "summary_large_image",
  robotsIndex: true,
  robotsFollow: true,
};

/** Right-aligned "N / limit" badge beside a field's label — accent colour only past the limit, matching the warning convention the other tools already use. */
function LengthHint({ check }: { check: LengthCheck }) {
  return (
    <span className={check.status === "over" ? "text-accent-text" : undefined}>
      {check.length} / {check.limit}
      {check.status === "over" && " · hədd aşıldı"}
    </span>
  );
}

export function MetaTool() {
  const [fields, setFields] = useState<MetaFields>(EMPTY_META_FIELDS);
  const [format, setFormat] = useState<OutputFormat>("html");

  const set = <K extends keyof MetaFields>(key: K, value: MetaFields[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const titleLength = useMemo(() => checkLength(fields.title, TITLE_SOFT_LIMIT), [fields.title]);
  const descriptionLength = useMemo(
    () => checkLength(fields.description, DESCRIPTION_SOFT_LIMIT),
    [fields.description],
  );

  const html = useMemo(() => buildMetaHtml(fields), [fields]);
  const nextCode = useMemo(() => buildNextMetadataCode(fields), [fields]);
  const output = format === "html" ? html : nextCode;

  const domain = useMemo(() => extractDisplayDomain(fields.url), [fields.url]);
  const resolvedImage = useMemo(
    () => resolveImageUrl(fields.image, fields.url),
    [fields.image, fields.url],
  );

  const previewTitle = fields.title.trim() || "Başlıq buraya yazılacaq";
  const previewDescription = fields.description.trim() || "Təsvir buraya yazılacaq";

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

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <ToolField label="Başlıq" htmlFor="meta-title" hint={<LengthHint check={titleLength} />}>
            <ToolInput
              id="meta-title"
              value={fields.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="Səhifənin başlığı"
            />
          </ToolField>

          <ToolField label="URL" htmlFor="meta-url" hint="canonical + og:url">
            <ToolInput
              id="meta-url"
              value={fields.url}
              onChange={(event) => set("url", event.target.value)}
              placeholder="https://sayt.com/sehife"
            />
          </ToolField>

          <div className="md:col-span-2">
            <ToolField
              label="Təsvir"
              htmlFor="meta-description"
              hint={<LengthHint check={descriptionLength} />}
            >
              <ToolTextArea
                id="meta-description"
                value={fields.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="Səhifənin qısa təsviri"
                rows={3}
              />
            </ToolField>
          </div>

          <ToolField
            label="Şəkil"
            htmlFor="meta-image"
            note={resolvedImage !== "" && resolvedImage !== fields.image.trim() ? `Mütləq: ${resolvedImage}` : undefined}
          >
            <ToolInput
              id="meta-image"
              value={fields.image}
              onChange={(event) => set("image", event.target.value)}
              placeholder="/og/sekil.png və ya tam URL"
            />
          </ToolField>

          <ToolField label="Sayt adı" htmlFor="meta-site-name" hint="og:site_name">
            <ToolInput
              id="meta-site-name"
              value={fields.siteName}
              onChange={(event) => set("siteName", event.target.value)}
              placeholder="Saytın adı"
            />
          </ToolField>

          <ToolField label="Dil" htmlFor="meta-locale" hint="og:locale">
            <ToolInput
              id="meta-locale"
              value={fields.locale}
              onChange={(event) => set("locale", event.target.value)}
              placeholder="az_AZ"
            />
          </ToolField>

          <ToolField label="Twitter Card">
            <ToolSegmented
              label="Twitter Card növü"
              options={TWITTER_CARD_OPTIONS}
              value={fields.twitterCard}
              onChange={(value) => set("twitterCard", value)}
            />
          </ToolField>

          <div className="flex items-end gap-4 md:col-span-2">
            <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={fields.robotsIndex}
                onChange={(event) => set("robotsIndex", event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              İndeksləşdirməyə icazə ver
            </label>
            <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
              <input
                type="checkbox"
                checked={fields.robotsFollow}
                onChange={(event) => set("robotsFollow", event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Linkləri izləməyə icazə ver
            </label>
          </div>
        </div>
      </ToolPanel>

      <div className="grid gap-4 lg:grid-cols-3">
        <PreviewCard label="Google axtarış nəticəsi">
          <GooglePreview domain={domain} title={previewTitle} description={previewDescription} />
        </PreviewCard>
        <PreviewCard label="Facebook / LinkedIn kartı">
          <SocialCardPreview
            domain={domain}
            title={previewTitle}
            description={previewDescription}
            image={resolvedImage}
          />
        </PreviewCard>
        <PreviewCard label="Twitter kartı">
          <TwitterCardPreview
            domain={domain}
            title={previewTitle}
            description={previewDescription}
            image={resolvedImage}
            large={fields.twitterCard === "summary_large_image"}
          />
        </PreviewCard>
      </div>

      <ToolResultPanel
        title="Çıxış"
        action={
          <>
            <ToolSegmented options={OUTPUT_OPTIONS} value={format} onChange={setFormat} />
            <CopyButton value={output} label="kopyala" />
          </>
        }
      >
        <ToolOutput className="m-3 max-h-96 overflow-y-auto">{output}</ToolOutput>
      </ToolResultPanel>

      <ToolAccordion>
        <ToolAccordionItem summary="Piksel həddi nə üçün simvol sayı ilə göstərilir?">
          <p>
            Google başlığı və təsviri ekranda tutduğu piksel enə görə kəsir, simvol sayına görə yox —
            «i» ilə «W» eyni sayda hərf olsa da fərqli en tutur. Bu alət yuxarıda göstərdiyi 60/155
            simvol həddini geniş qəbul edilmiş təxmini göstərici kimi işlədir, dəqiq zəmanət kimi yox.
          </p>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}

function PreviewCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded border border-rule bg-surface">
      <p className="border-b border-rule px-3 py-2 font-ui text-[11px] text-muted">{label}</p>
      <div className="p-3">{children}</div>
    </div>
  );
}

/*
 * The three previews below imitate a surface this site does not own — Google's
 * results page, a Facebook/LinkedIn card, a Twitter card — so they reach for
 * Tailwind's own neutral/blue scale rather than this site's skin tokens. A
 * card drawn in the site's own `--btn-*` chrome would look like part of this
 * page, which defeats the point of a preview: it has to look like the other
 * platform, not like camalali.com.
 */

function GooglePreview({
  domain,
  title,
  description,
}: {
  domain: string;
  title: string;
  description: string;
}) {
  return (
    <div className="font-sans">
      <div className="flex items-center gap-2 text-xs text-gray-700">
        <span aria-hidden className="size-4 shrink-0 rounded-full bg-gray-300" />
        <span className="truncate">{domain}</span>
      </div>
      <p className="mt-1 truncate text-lg text-blue-800">{title}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{description}</p>
    </div>
  );
}

function SocialCardPreview({
  domain,
  title,
  description,
  image,
}: {
  domain: string;
  title: string;
  description: string;
  image: string;
}) {
  return (
    <div className="overflow-hidden rounded border border-gray-300 font-sans">
      {image !== "" ? (
        // An arbitrary external address the visitor typed cannot go through
        // next/image's fixed-domain optimiser.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="aspect-[1.91/1] w-full bg-gray-100 object-cover" />
      ) : (
        <div className="flex aspect-[1.91/1] items-center justify-center bg-gray-100 text-xs text-gray-400">
          şəkil yoxdur
        </div>
      )}
      <div className="bg-gray-50 p-3">
        <p className="truncate text-xs uppercase text-gray-500">{domain}</p>
        <p className="mt-1 line-clamp-2 font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 line-clamp-1 text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
}

function TwitterCardPreview({
  domain,
  title,
  description,
  image,
  large,
}: {
  domain: string;
  title: string;
  description: string;
  image: string;
  large: boolean;
}) {
  if (large) {
    return <SocialCardPreview domain={domain} title={title} description={description} image={image} />;
  }

  return (
    <div className="flex overflow-hidden rounded border border-gray-300 font-sans">
      {image !== "" ? (
        // eslint-disable-next-line @next/next/no-img-element -- same as above: external, visitor-supplied address.
        <img src={image} alt="" className="size-24 shrink-0 bg-gray-100 object-cover" />
      ) : (
        <div className="flex size-24 shrink-0 items-center justify-center bg-gray-100 text-xs text-gray-400">
          —
        </div>
      )}
      <div className="min-w-0 flex-1 bg-gray-50 p-3">
        <p className="line-clamp-2 font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 line-clamp-1 text-sm text-gray-600">{description}</p>
        <p className="mt-1 truncate text-xs text-gray-500">{domain}</p>
      </div>
    </div>
  );
}
