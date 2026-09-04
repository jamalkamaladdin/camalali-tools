"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { formatAzStamp } from "../shared/az-date";
import { CopyButton } from "../shared/copy-button";
import {
  formatUtcOffset,
  parseUserAgent,
  type AddressSource,
  type MenimIpReport,
  type UserAgentInfo,
} from "../lib/menim-ip";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

/*
 * Two halves, two very different promises.
 *
 * The top half is a single fetch with no visitor input at all — there is
 * nothing to type for "what is my own IP" — so it loads itself on mount
 * rather than waiting for a button, the same way the currency tool loads its
 * bulletin before anyone has touched a field.
 *
 * The bottom half never calls the route. `collectBrowserSignals` reads
 * `navigator`/`screen`/`matchMedia` once, after mount so the server-rendered
 * markup and the first client render agree, and nothing it reads is ever
 * handed to `fetch`. That promise is the whole reason the section exists, so
 * it is kept in the one place a reviewer would notice it broken: no network
 * call anywhere below `BrowserReveal`.
 */

type State =
  | { phase: "loading" }
  | { phase: "done"; report: MenimIpReport }
  | { phase: "error"; message: string };

async function fetchReport(): Promise<State> {
  try {
    const response = await fetch("/api/alet/menim-ip");
    const body: unknown = await response.json();
    const payload = body as { ok?: boolean; data?: MenimIpReport; message?: string };
    if (payload.ok && payload.data) {
      return { phase: "done", report: payload.data };
    }
    return { phase: "error", message: payload.message ?? "Sorğu alınmadı." };
  } catch {
    return { phase: "error", message: "Serverlə əlaqə qurulmadı. Bir azdan yenidən yoxla." };
  }
}

function addressSourceLabel(source: AddressSource): ReactNode {
  if (source === "cf-connecting-ip") {
    return (
      <>
        <span className="font-mono text-xs">cf-connecting-ip</span> başlığından oxunub: bu sayt
        Cloudflare arxasında işlədiyi üçün əsl soket ünvanı deyil, Cloudflare-in əlavə etdiyi başlıq
        oxunur.
      </>
    );
  }
  if (source === "x-forwarded-for") {
    return (
      <>
        <span className="font-mono text-xs">x-forwarded-for</span> başlığından oxunub: bu ünvanı
        proksi zənciri əlavə edib.
      </>
    );
  }
  return "Heç bir etibarlı başlıq tapılmadı: server sənin ünvanını bilmir.";
}

export function MenimIpTool() {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchReport().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = state.phase === "loading";

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Bu bölmə sorğunu serverə göndərir">
        Səhifə açılan kimi server sənin öz IP ünvanını, onun ASN-ini, RDAP qeydini və tərs DNS
        yazısını yoxlayır. Heç nə yazmırsan. Aşağıdakı brauzer bölməsi isə tamam fərqlidir: heç
        bir sorğu getmir, hər şey brauzerin özündə oxunub göstərilir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="Bağlantı"
          action={
            <ToolButton
              size="chip"
              disabled={busy}
              onClick={() => {
                setState({ phase: "loading" });
                void fetchReport().then(setState);
              }}
            >
              {busy ? "Yoxlanır…" : "Yenidən yoxla"}
            </ToolButton>
          }
        />
        <div className="p-4">
          {state.phase === "loading" && (
            <p className="text-ios-subhead text-muted">IP ünvanın və şəbəkə qeydləri yoxlanır…</p>
          )}
          {state.phase === "done" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-ios-body">{state.report.address}</span>
              <CopyButton value={state.report.address} label="ünvanı kopyala" />
              <span className="text-ios-footnote text-muted tabular-nums">
                {formatAzStamp(new Date(state.report.checkedAt))}
              </span>
            </div>
          )}
        </div>
      </ToolPanel>

      {state.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {state.message}
        </ToolNote>
      )}

      {state.phase === "done" && <ServerReport report={state.report} />}

      <BrowserReveal />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <ToolLabel>{label}</ToolLabel>
      <p className="mt-0.5 text-ios-subhead break-words">{value ?? ""}</p>
    </div>
  );
}

function ServerReport({ report }: { report: MenimIpReport }) {
  return (
    <div className="space-y-5">
      <ToolNote title="Ünvan haradan oxundu">{addressSourceLabel(report.addressSource)}</ToolNote>

      <div className="@container">
        <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          <ToolStat
            label="ASN"
            value={report.asn ? `AS${report.asn.asn}` : ""}
            note={report.asnName ?? undefined}
          />
          <ToolStat label="Elan edən prefiks" value={report.asn?.prefix ?? ""} />
          <ToolStat label="Qeydiyyat (RIR)" value={report.asn?.registry ?? ""} />
          <ToolStat label="Ölkə kodu" value={report.rdap?.country ?? report.asn?.country ?? ""} />
        </div>
      </div>

      {report.asnError && (
        <ToolNote tone="accent" title="ASN sorğusu tam alınmadı">
          {report.asnError}
        </ToolNote>
      )}

      <ToolResultPanel title="RDAP qeydi" hint={report.rdap ? undefined : "əlçatan deyil"}>
        <div className="p-3">
          {report.rdap ? (
            <div className="@container">
              <div className="grid gap-3 @min-[26rem]:grid-cols-2">
                <Field label="Şəbəkə adı" value={report.rdap.networkName} />
                <Field label="Tutacaq (handle)" value={report.rdap.handle} />
                <Field label="Ölkə" value={report.rdap.country} />
                <Field label="Məsul təşkilat" value={report.rdap.organisation} />
              </div>
            </div>
          ) : (
            <p className="text-ios-subhead text-muted">
              {report.rdapError ?? "RDAP qeydi tapılmadı."}
            </p>
          )}
        </div>
      </ToolResultPanel>

      <ToolResultPanel title="Tərs DNS (PTR)" hint={report.ptr ? `${report.ptr.length} ad` : undefined}>
        <div className="p-3">
          {report.ptrError ? (
            <p className="text-ios-subhead text-muted">{report.ptrError}</p>
          ) : report.ptr && report.ptr.length > 0 ? (
            <ul className="space-y-1">
              {report.ptr.map((name) => (
                <li key={name} className="font-mono text-sm break-all">
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ios-subhead text-muted">
              Bu ünvan üçün PTR yazısı yoxdur: çoxu üçün adi haldır, xəta deyil.
            </p>
          )}
        </div>
      </ToolResultPanel>

      <ToolNote title="Şəhər niyə göstərilmir">
        Şəhər səviyyəsində yer təyini heç bir pulsuz, açar tələb etməyən mənbədən etibarlı gəlmir.
        Bu alət yalnız RDAP və ASN qeydlərində yazılan, yoxlana bilən ölkə kodunu göstərir.
      </ToolNote>
    </div>
  );
}

/* ---------- the browser's own reveal — no request anywhere below here ---------- */

type BrowserSignals = {
  userAgent: string;
  uaInfo: UserAgentInfo;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  timeZone: string;
  utcOffset: string;
  language: string;
  languages: string[];
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  cookiesEnabled: boolean;
  localStorageAvailable: boolean;
  doNotTrack: string | null;
  webdriver: boolean;
  prefersDark: boolean;
  prefersReducedMotion: boolean;
};

/** Two properties the DOM lib does not carry: Device Memory is a
 *  Chromium-only draft API, and `webdriver` is standard but read here
 *  through the same defensive cast so one file states both exceptions. */
type NavigatorExtras = {
  deviceMemory?: number;
  webdriver?: boolean;
};

function probeLocalStorage(): boolean {
  const probeKey = "__menim-ip-probe__";
  try {
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

function collectBrowserSignals(): BrowserSignals {
  const nav = window.navigator as Navigator & NavigatorExtras;

  return {
    userAgent: nav.userAgent,
    uaInfo: parseUserAgent(nav.userAgent),
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    colorDepth: window.screen.colorDepth,
    devicePixelRatio: window.devicePixelRatio,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utcOffset: formatUtcOffset(new Date().getTimezoneOffset()),
    language: nav.language,
    languages: Array.from(nav.languages ?? [nav.language]),
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    cookiesEnabled: nav.cookieEnabled,
    localStorageAvailable: probeLocalStorage(),
    doNotTrack: nav.doNotTrack ?? null,
    webdriver: nav.webdriver === true,
    prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

/* Nothing to subscribe to: "is this the browser yet" is answered once and
   never changes again — the same one-shot hydration guard `parol-tool.tsx`
   and `uuid-tool.tsx` use, rather than a `useState`/`useEffect` pair that
   would set state from inside the effect body. */
const subscribeToNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

function BrowserReveal() {
  // `navigator`/`screen` do not exist on the server, so the first client
  // render has to agree with the server's "nothing yet" before this flips —
  // `useSyncExternalStore` is what makes that flip happen safely.
  const onBrowser = useSyncExternalStore(subscribeToNothing, onClient, onServer);
  const signals = useMemo<BrowserSignals | null>(
    () => (onBrowser ? collectBrowserSignals() : null),
    [onBrowser],
  );

  return (
    <ToolResultPanel title="Brauzerinin özü nə göstərir" hint="heç yerə göndərilmir">
      <div className="space-y-4 p-3">
        <ToolNote>
          Bu bölmədəki hər dəyər brauzerin öz JavaScript mühitindən oxunur və yalnız bu səhifədə
          göstərilir. Heç biri serverə göndərilmir. WebRTC ilə yerli şəbəkə ünvanını tapmağa cəhd
          edilmir: müasir brauzerlər əsl ünvan əvəzinə təsadüfi bir{" "}
          <span className="font-mono text-xs">.local</span> adı qaytarır, faydasız bir sətri
          «tapıldı» kimi göstərmək isə heç nə göstərməməkdən pisdir.
        </ToolNote>

        {signals === null ? (
          <p className="text-ios-subhead text-muted">Oxunur…</p>
        ) : (
          <>
            <div className="@container">
              <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
                <ToolStat label="Brauzer" value={signals.uaInfo.browser} note={signals.uaInfo.engine} />
                <ToolStat label="Platforma" value={signals.uaInfo.platform} />
                <ToolStat
                  label="Saat qurşağı"
                  value={signals.timeZone}
                  note={signals.utcOffset}
                />
                <ToolStat
                  label="Dil"
                  value={signals.language}
                  note={signals.languages.join(", ")}
                />
              </div>
            </div>

            <div className="@container">
              <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
                <ToolStat
                  label="Ekran"
                  value={`${signals.screenWidth}×${signals.screenHeight}`}
                  note={`${signals.colorDepth} bit rəng · ${signals.devicePixelRatio}x piksel nisbəti`}
                />
                <ToolStat
                  label="Görüntü sahəsi"
                  value={`${signals.viewportWidth}×${signals.viewportHeight}`}
                />
                <ToolStat
                  label="Prosessor nüvəsi"
                  value={
                    signals.hardwareConcurrency !== null ? String(signals.hardwareConcurrency) : ""
                  }
                />
                <ToolStat
                  label="Yaddaş"
                  value={signals.deviceMemory !== null ? `${signals.deviceMemory} GB` : ""}
                  note={signals.deviceMemory === null ? "bu brauzer açıqlamır" : undefined}
                />
              </div>
            </div>

            <ToolAccordion>
              <ToolAccordionItem summary="Kukilər və saxlama" group="menim-ip">
                <ul className="space-y-1 text-ios-subhead">
                  <li>Kuki icazəsi: {signals.cookiesEnabled ? "açıq" : "bağlı"}</li>
                  <li>localStorage: {signals.localStorageAvailable ? "işləyir" : "işləmir"}</li>
                  <li>Do Not Track: {signals.doNotTrack ?? "göndərilmir"}</li>
                  <li>
                    <span className="font-mono text-xs">navigator.webdriver</span>:{" "}
                    {signals.webdriver
                      ? "true: avtomatlaşdırılmış brauzer əlaməti"
                      : "false"}
                  </li>
                </ul>
              </ToolAccordionItem>
              <ToolAccordionItem summary="Görünüş seçimləri" group="menim-ip">
                <ul className="space-y-1 text-ios-subhead">
                  <li>
                    <span className="font-mono text-xs">prefers-color-scheme</span>:{" "}
                    {signals.prefersDark ? "dark" : "light"}
                  </li>
                  <li>
                    <span className="font-mono text-xs">prefers-reduced-motion</span>:{" "}
                    {signals.prefersReducedMotion ? "reduce" : "no-preference"}
                  </li>
                </ul>
              </ToolAccordionItem>
              <ToolAccordionItem summary="User-Agent sətri (tam)" group="menim-ip">
                <ToolOutput className="text-[11px]">{signals.userAgent}</ToolOutput>
              </ToolAccordionItem>
            </ToolAccordion>
          </>
        )}
      </div>
    </ToolResultPanel>
  );
}
