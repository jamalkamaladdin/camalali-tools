"use client";

import { useEffect, useMemo, useState } from "react";
import { ToolTabs, type ToolTabItem } from "./tabs";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { formatAzDateTime, formatRelative } from "../shared/az-date";
import { claimToDate, decodeJwt, STANDARD_CLAIM_NOTES } from "../lib/jwt";

/*
 * Structure kept from the source tool (camalali-dev's jwt-tool.tsx): the
 * token box full width on top, the decoded payload first below it, and
 * header/claim detail one click away in tabs rather than three more panels
 * stacked down the page. Only the skin changed — every surface and control
 * below comes from `src/components/tools/ui.tsx` and `tabs.tsx`.
 */

// Fixed, hand-built token — alg/typ/exp are far in the future so the demo
// always shows the "valid" path, not a sample that expires while we're away.
const SAMPLE_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkVsdmluIE3JmW1tyZlkb3YiLCJyb2xlIjoiZGV2ZWxvcGVyIiwiaWF0IjoxNzM1Njg5NjAwLCJleHAiOjE4OTM0NTYwMDB9.dGhpc19pc19hX2Zha2Vfc2lnbmF0dXJl";

const TIME_CLAIMS = [
  { key: "iat", label: "iat — verilmə vaxtı" },
  { key: "nbf", label: "nbf — qüvvəyə minmə vaxtı" },
  { key: "exp", label: "exp — bitmə vaxtı" },
] as const;

const STANDARD_CLAIM_KEYS = Object.keys(STANDARD_CLAIM_NOTES);

function claimValueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * `setTimeout` overflows past this and fires immediately, so a boundary
 * further away than ~24 days is simply not scheduled: no tab stays open that
 * long, and a wrong timer is worse than none.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;


export function JwtTool() {
  const [token, setToken] = useState("");
  /*
   * exp and nbf turn over on a wall-clock boundary, not on a keystroke. While
   * the decode captured `new Date()` inside a memo keyed on the token alone, a
   * token that expired with the page open stayed "valid" until something was
   * typed. This clock is what the decode reads; the effect below moves it.
   */
  const [now, setNow] = useState(() => new Date());

  const result = useMemo(() => {
    if (token.trim() === "") return null;
    return decodeJwt(token, now);
  }, [token, now]);

  const header = result?.ok ? result.header : null;
  const payload = result?.ok ? result.payload : null;

  const expDate = payload ? claimToDate(payload.exp) : null;
  const nbfDate = payload ? claimToDate(payload.nbf) : null;

  const standardClaims = payload
    ? STANDARD_CLAIM_KEYS.filter((claim) => payload[claim] !== undefined)
    : [];

  // The first exp/nbf still ahead of the clock: the next moment this token's
  // verdict can change. `null` once nothing is left to wait for.
  const nextFlipMs = useMemo(() => {
    const ahead = [expDate, nbfDate]
      .map((date) => date?.getTime())
      .filter((ms): ms is number => ms !== undefined && ms > now.getTime());
    return ahead.length > 0 ? Math.min(...ahead) : null;
  }, [expDate, nbfDate, now]);

  /* One timeout per boundary rather than a ticking interval — nothing else on
     this screen depends on the time, so a second-by-second re-render would be
     work nobody sees. */
  useEffect(() => {
    if (nextFlipMs === null) return;

    const delay = nextFlipMs - Date.now();
    if (delay > MAX_TIMEOUT_MS) return;

    // A margin, so the re-read lands after the boundary and never exactly on it.
    const timer = window.setTimeout(() => setNow(new Date()), Math.max(delay, 0) + 250);
    return () => window.clearTimeout(timer);
  }, [nextFlipMs]);

  // The narrow column beside Payload: Header's raw JSON and the claim
  // breakdowns that used to be separate stacked panels now live behind tabs,
  // so the decoded payload stays the first thing on screen.
  const detailTabs: ToolTabItem[] =
    header && payload
      ? [
          {
            id: "header",
            label: "Header",
            content: (
              <ToolResultPanel
                title="Header (JSON)"
                action={
                  <CopyButton
                    value={JSON.stringify(header, null, 2)}
                    label="header-i kopyala"
                    doneLabel="kopyalandı"
                    className="shrink-0"
                  />
                }
              >
                <ToolOutput className="m-3 tabular-nums">
                  {JSON.stringify(header, null, 2)}
                </ToolOutput>
              </ToolResultPanel>
            ),
          },
          {
            id: "vaxt",
            label: "Vaxt",
            content: (
              <ToolResultPanel title="Vaxt">
                <div className="space-y-3 p-3">
                  {TIME_CLAIMS.filter(({ key }) => payload[key] !== undefined).map(
                    ({ key, label }) => {
                      const date = claimToDate(payload[key]);
                      return (
                        <div
                          key={key}
                          className="flex flex-wrap items-baseline justify-between gap-2 border-t border-rule pt-3 first:border-t-0 first:pt-0"
                        >
                          <span className="text-sm text-muted">{label}</span>
                          <span className="font-ui text-sm tabular-nums text-ink">
                            {date
                              ? `${formatAzDateTime(date)} · ${formatRelative(date)}`
                              : "rəqəm deyil"}
                          </span>
                        </div>
                      );
                    },
                  )}
                  {TIME_CLAIMS.every(({ key }) => payload[key] === undefined) && (
                    <p className="text-sm text-muted">Bu token-də vaxt claim-i yoxdur.</p>
                  )}
                </div>
              </ToolResultPanel>
            ),
          },
          ...(standardClaims.length > 0
            ? [
                {
                  id: "standart",
                  label: "Standart",
                  content: (
                    <ToolResultPanel title="Standart">
                      <dl className="space-y-3 p-3">
                        {standardClaims.map((claim) => (
                          <div
                            key={claim}
                            className="border-t border-rule pt-3 first:border-t-0 first:pt-0"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <dt className="font-mono text-sm text-ink">{claim}</dt>
                              <dd className="font-mono text-sm tabular-nums text-muted">
                                {claimValueText(payload[claim])}
                              </dd>
                            </div>
                            <p className="mt-1 text-xs text-muted">
                              {STANDARD_CLAIM_NOTES[claim]}
                            </p>
                          </div>
                        ))}
                      </dl>
                    </ToolResultPanel>
                  ),
                },
              ]
            : []),
        ]
      : [];

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <div className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
          <ToolButton size="chip" onClick={() => setToken(SAMPLE_TOKEN)}>
            Nümunə
          </ToolButton>
          <ToolButton size="chip" onClick={() => setToken("")} disabled={token === ""}>
            Təmizlə
          </ToolButton>
        </div>

        <div className="p-4">
          <ToolField
            label="JWT token"
            htmlFor="jwt-input"
            /* A sentence belongs in `note`: `hint` shares the label's line and
               is `shrink-0`, so on a 390px screen this ran off the edge. */
            note="Üç hissə nöqtə (.) ilə ayrılır: header.payload.imza."
          >
            <ToolTextArea
              id="jwt-input"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
            />
          </ToolField>
        </div>
      </ToolPanel>

      <ToolNote tone="info" title="İmza yoxlanılmır">
        Bu alət yalnız token-i oxuyur — header və payload-u dekod edir. İmzanın düzgünlüyünü
        təsdiqləmək üçün onu yaradan gizli açar (və ya açıq açar) lazımdır; bu alət heç vaxt bunu
        istəmir və heç nəyi saxlamır.
      </ToolNote>

      {result && !result.ok && (
        <ToolNote tone="accent" title="Dekod alınmadı">
          {result.error}
        </ToolNote>
      )}

      {result && result.ok && header && payload && (
        <>
          <div className="grid gap-5 sm:grid-cols-3">
            <ToolStat label="alg" value={typeof header.alg === "string" ? header.alg : "—"} />
            <ToolStat label="typ" value={typeof header.typ === "string" ? header.typ : "—"} />
            <ToolStat label="kid" value={typeof header.kid === "string" ? header.kid : "—"} />
          </div>

          {result.expired && expDate && (
            <ToolNote tone="accent" title="Token-in vaxtı bitib">
              exp claim-i {formatAzDateTime(expDate)} tarixinə işarə edir — {formatRelative(expDate)}.
            </ToolNote>
          )}

          {result.notYetValid && nbfDate && (
            <ToolNote tone="accent" title="Token hələ qüvvəyə minməyib">
              nbf claim-i {formatAzDateTime(nbfDate)} tarixinə işarə edir — {formatRelative(nbfDate)}.
            </ToolNote>
          )}

          {result.warnings.map((warning) => (
            <ToolNote key={warning} tone="accent">
              {warning}
            </ToolNote>
          ))}

          {/* Payload is the decoded body — it stays wide and comes first.
              Header and the derived claim tables sit beside it, one click
              away, instead of stacking as three more full-width panels. */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <ToolResultPanel
              title="Payload (JSON)"
              action={
                <CopyButton
                  value={JSON.stringify(payload, null, 2)}
                  label="payload-u kopyala"
                  doneLabel="kopyalandı"
                />
              }
            >
              <ToolOutput className="m-4 tabular-nums">
                {JSON.stringify(payload, null, 2)}
              </ToolOutput>
            </ToolResultPanel>

            <ToolPanel className="p-4">
              {/* Keyed by which tabs exist, not by the token text. The key is
                  here so an active tab that disappears — "Standart", once the
                  new token carries no standard claims — cannot stay selected.
                  Keyed by the token it also remounted on every keystroke, so
                  editing the token threw away the open tab. */}
              <ToolTabs
                key={detailTabs.map((tab) => tab.id).join("+")}
                items={detailTabs}
                idPrefix="jwt-detail"
              />
            </ToolPanel>
          </div>

          <ToolResultPanel
            title="İmza (dekod edilmir)"
            action={
              <CopyButton
                value={result.signature}
                label="imzanı kopyala"
                doneLabel="kopyalandı"
              />
            }
          >
            <ToolOutput className="m-4 break-all tabular-nums">
              {result.signature || "(boş)"}
            </ToolOutput>
          </ToolResultPanel>
        </>
      )}
    </div>
  );
}
