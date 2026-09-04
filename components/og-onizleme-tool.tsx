"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import {
  type OgCard,
  type OgExtract,
  type OgIssue,
  type OgPlatform,
} from "../lib/og-onizleme";
import { normalizeTargetUrl } from "../lib/safe-url";
import { CopyButton } from "../shared/copy-button";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

/*
 * The four cards are drawn here rather than screenshotted, and they are drawn
 * in this site's own tokens rather than in Facebook's blue: a preview that
 * copies a platform's chrome makes a promise about pixels that nobody can
 * keep - the platforms redesign, and a stale imitation is worse than an
 * honest diagram. What has to be faithful is the shape of the decision: which
 * image, which text, cut where, and big or small. That is what differs
 * between the four, and that is what is reproduced.
 *
 * The image is the one thing not drawn from tokens, because it is the visitor's
 * own file and the point is to see it. It is a plain `<img>` on an address a
 * stranger typed, so it cannot go through next/image's fixed-domain optimiser,
 * and a failure to load is caught and shown rather than left as a broken box.
 */

type OgReport = {
  url: string;
  status: number;
  redirectedTo: string | null;
  contentType: string | null;
  truncated: boolean;
  checkedAt: string;
  data: OgExtract;
  issues: OgIssue[];
  cards: OgCard[];
};

const EXAMPLES = ["camalali.com", "github.com", "wikipedia.org"];

const SEVERITY_LABELS: Record<OgIssue["severity"], string> = {
  xeta: "xəta",
  xeberdarliq: "xəbərdarlıq",
  melumat: "məlumat",
};

const PLATFORMS: Record<
  OgPlatform,
  { label: string; note: string; showDescription: boolean }
> = {
  facebook: {
    label: "Facebook",
    note: "Şəkil 1.91:1 nisbətində kəsilir. Altında domen, başlıq və təsvirin ilk sətirləri gedir.",
    showDescription: true,
  },
  twitter: {
    label: "X (Twitter)",
    note: "Ölçünü «twitter:card» teqi təyin edir: «summary» kiçik kvadrat, «summary_large_image» geniş şəkil verir.",
    showDescription: true,
  },
  linkedin: {
    label: "LinkedIn",
    note: "Lentdə yalnız şəkil, başlıq və domen çəkilir: təsvir oxunur, amma göstərilmir.",
    showDescription: false,
  },
  whatsapp: {
    label: "WhatsApp",
    note: "Şəkil kiçik kvadratdır və mesaj göndərilməzdən əvvəl WhatsApp onu özü yükləyir, ağır şəkil önizləməni ləngidir.",
    showDescription: true,
  },
};

type State =
  | { phase: "idle" }
  | { phase: "loading"; url: string }
  | { phase: "done"; report: OgReport }
  | { phase: "error"; message: string };

export function OgOnizlemeTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(raw: string) {
    /* The route validates again; this copy only saves a doomed round trip and
       the rate-limit slot that goes with it. */
    const target = normalizeTargetUrl(raw);
    if (!target.ok) {
      setState({ phase: "error", message: target.error });
      return;
    }

    setState({ phase: "loading", url: target.url });
    try {
      const response = await fetch(`/api/alet/og-onizleme?unvan=${encodeURIComponent(target.url)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: OgReport; message?: string };
      if (payload.ok && payload.data) {
        setState({ phase: "done", report: payload.data });
      } else {
        setState({ phase: "error", message: payload.message ?? "Sorğu alınmadı." });
      }
    } catch {
      setState({ phase: "error", message: "Serverlə əlaqə qurulmadı. Bir azdan yenidən yoxla." });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(input);
  }

  const busy = state.phase === "loading";

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Bu alət ünvanı serverə göndərir">
        Yazdığın səhifəni sənin brauzerin yox, bu saytın serveri açır və ilk 256 KB-ını oxuyur:
        meta teqlər orada yerləşir. Daxili şəbəkə ünvanları (localhost, 10.x, 192.168.x) və
        80/443-dən başqa portlar rədd edilir. Önizləmədəki şəkli isə brauzerin birbaşa həmin şəkil
        ünvanından yükləyəcək.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="Ünvan"
          action={
            <>
              {EXAMPLES.map((example) => (
                <ToolButton
                  key={example}
                  size="chip"
                  disabled={busy}
                  onClick={() => {
                    setInput(example);
                    void run(example);
                  }}
                >
                  {example}
                </ToolButton>
              ))}
            </>
          }
        />

        <form onSubmit={onSubmit} className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <ToolField
              label="Səhifə ünvanı"
              htmlFor="og-onizleme-url"
              className="min-w-56 flex-1"
              note="Sxem yazılmasa https götürülür. Yönləndirmə izlənmir: hara yönləndirdiyi göstərilir."
            >
              <ToolInput
                id="og-onizleme-url"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://example.com/yazi"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Oxunur…" : "Önizlə"}
            </ToolButton>
          </div>
        </form>
      </ToolPanel>

      {state.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {state.message}
        </ToolNote>
      )}

      {state.phase === "loading" && (
        <p className="font-ui text-sm text-muted">{state.url} oxunur…</p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: OgReport }) {
  const errors = report.issues.filter((issue) => issue.severity === "xeta").length;
  const tagNames = Object.keys(report.data.tags);
  const plain = tagNames.map((name) => `${name}: ${report.data.tags[name]}`).join("\n");

  return (
    <div className="space-y-5">
      {report.truncated && (
        <ToolNote tone="accent" title="Səhifə tam oxunmadı">
          Səhifə 256 KB-dan böyükdür və yalnız başlanğıcı oxundu. Meta teqlər adətən bu hissədə
          olur, amma teq daha aşağıdadırsa aşağıdakı siyahıya düşməyəcək.
        </ToolNote>
      )}

      <div className="@container">
        <div className="grid gap-3 @md:grid-cols-3">
          <ToolStat
            label="Problem"
            value={errors > 0 ? `${errors} xəta` : `${report.issues.length} qeyd`}
            tone={errors > 0 ? "warning" : "default"}
            note={errors > 0 ? "kart səhv çıxacaq" : "ciddi xəta yoxdur"}
          />
          <ToolStat label="HTTP cavabı" value={String(report.status)} note={`${tagNames.length} teq tapıldı`} />
          <ToolStat label="Oxunuldu" value={formatAzStamp(new Date(report.checkedAt))} />
        </div>
      </div>

      <ToolResultPanel
        title="Önizləmə"
        hint="kartlar kodla çəkilir, şəkil isə səhifənin öz ünvanındandır"
      >
        <div className="@container p-3">
          <div className="grid gap-4 @xl:grid-cols-2">
            {report.cards.map((card) => (
              <PlatformCard key={card.platform} card={card} />
            ))}
          </div>
        </div>
      </ToolResultPanel>

      <ToolResultPanel
        title="Tapılanlar"
        hint={report.issues.length === 0 ? "təmiz" : `${report.issues.length} qeyd`}
      >
        {report.issues.length === 0 ? (
          <p className="p-4 text-sm/6">
            Bütün əsas teqlər yerindədir və heç biri platforma həddini keçmir.
          </p>
        ) : (
          <ul className="space-y-3 p-4">
            {report.issues.map((issue) => (
              <li key={issue.message} className="border-l-2 border-rule pl-3">
                <p className="font-ui text-[11px] text-muted">{SEVERITY_LABELS[issue.severity]}</p>
                <p className="mt-1 text-sm/6">{issue.message}</p>
              </li>
            ))}
          </ul>
        )}
      </ToolResultPanel>

      <ToolAccordion>
        <ToolAccordionItem summary="Səhifədə tapılan teqlər" hint={`${tagNames.length} ədəd`}>
          <div className="space-y-2">
            <CopyButton value={plain} label="teqləri kopyala" disabled={tagNames.length === 0} />
            {tagNames.length === 0 ? (
              <p>Səhifədə bir dənə də «og:» və ya «twitter:» teqi yoxdur.</p>
            ) : (
              <ul className="space-y-1">
                {tagNames.map((name) => (
                  <li key={name} className="font-mono text-xs break-all">
                    <span className="font-semibold text-ink">{name}</span>: {report.data.tags[name]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ToolAccordionItem>

        <ToolAccordionItem summary="Ehtiyat mənbələr" hint="teq yoxdursa buradan götürülür">
          <ul className="space-y-1 font-mono text-xs break-all">
            <li>title: {report.data.title ?? "yoxdur"}</li>
            <li>meta description: {report.data.description ?? "yoxdur"}</li>
            <li>canonical: {report.data.canonical ?? "yoxdur"}</li>
            <li>icon: {report.data.icon ?? "yoxdur"}</li>
            <li>content-type: {report.contentType ?? "yoxdur"}</li>
          </ul>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}

function PlatformCard({ card }: { card: OgCard }) {
  const meta = PLATFORMS[card.platform];

  return (
    <div className="min-w-0 rounded border border-rule bg-surface">
      <header className="flex items-baseline justify-between gap-2 border-b border-rule px-3 py-2">
        <h3 className="font-ui text-xs font-semibold">{meta.label}</h3>
        <span className="font-ui text-[11px] text-muted">
          {card.large ? "geniş şəkil" : "kiçik şəkil"}
        </span>
      </header>

      <div className="p-3">
        {card.large ? <WideBody card={card} meta={meta} /> : <NarrowBody card={card} meta={meta} />}
      </div>

      <p className="border-t border-rule px-3 py-2 font-ui text-[11px]/5 text-muted">
        {meta.note}
      </p>
    </div>
  );
}

type CardMeta = (typeof PLATFORMS)[OgPlatform];

function WideBody({ card, meta }: { card: OgCard; meta: CardMeta }) {
  return (
    <div className="overflow-hidden rounded border border-rule">
      <CardImage key={card.image ?? "yox"} src={card.image} shape="wide" />
      <div className="bg-hover p-3">
        <p className="truncate font-ui text-[11px] text-muted">{card.host || "yoxdur"}</p>
        <p className="mt-1 line-clamp-2 font-semibold">{card.title || "başlıq yoxdur"}</p>
        <CardDescription card={card} meta={meta} />
      </div>
    </div>
  );
}

function NarrowBody({ card, meta }: { card: OgCard; meta: CardMeta }) {
  return (
    <div className="flex overflow-hidden rounded border border-rule">
      <CardImage key={card.image ?? "yox"} src={card.image} shape="square" />
      <div className="min-w-0 flex-1 bg-hover p-3">
        <p className="line-clamp-2 font-semibold">{card.title || "başlıq yoxdur"}</p>
        <CardDescription card={card} meta={meta} />
        <p className="mt-1 truncate font-ui text-[11px] text-muted">{card.host || "yoxdur"}</p>
      </div>
    </div>
  );
}

function CardDescription({ card, meta }: { card: OgCard; meta: CardMeta }) {
  if (card.description === "") {
    return <p className="mt-1 font-ui text-[11px] text-muted">təsvir yoxdur</p>;
  }
  if (!meta.showDescription) {
    return (
      <p className="mt-1 font-ui text-[11px]/5 text-muted">
        lentdə göstərilmir: {card.description}
      </p>
    );
  }
  return <p className="mt-1 line-clamp-2 text-sm/6 text-muted">{card.description}</p>;
}

/**
 * The visitor's own image, or an honest empty box in its place.
 *
 * Two different sentences on purpose: "no image" is a missing tag and "did not
 * load" is a tag pointing at something the browser could not fetch — a typo, a
 * private bucket, a hotlink block. Both end as a grey rectangle in the feed,
 * but only one of them is fixed by writing a tag.
 */
function CardImage({ src, shape }: { src: string | null; shape: "wide" | "square" }) {
  const [failed, setFailed] = useState(false);
  const box = shape === "wide" ? "aspect-[1.91/1] w-full" : "size-24 shrink-0";

  if (src === null || failed) {
    return (
      <div
        className={`${box} flex items-center justify-center border-rule bg-surface p-2 text-center font-ui text-[11px] text-muted`}
      >
        {src === null ? "şəkil yoxdur" : "şəkil yüklənmədi"}
      </div>
    );
  }

  return (
    // The address is one a stranger typed, so it cannot go through
    // next/image's fixed-domain optimiser.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={`${box} bg-surface object-cover`}
    />
  );
}
