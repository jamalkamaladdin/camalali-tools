"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { formatNumber } from "../shared/format";
import {
  countInRange,
  describeExposure,
  parseRangeBody,
  splitPasswordHash,
  SUFFIX_LENGTH,
  type Exposure,
  type PasswordHashParts,
} from "../lib/parol-sizmasi";
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

type Status = "idle" | "loading" | "done" | "error";

type Outcome = {
  parts: PasswordHashParts;
  exposure: Exposure;
  /** How many hashes shared the prefix — the size of the crowd the query hid in. */
  crowd: number;
};

type Payload =
  | { ok: true; data: { prefix: string; range: string } }
  | { ok: false; message: string };

export function PasswordBreachTool() {
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  /* Every check takes a ticket. Two answers can be in flight when somebody
     edits the password and presses again, and a slow reply to the old one
     landing after the new one would show a verdict for a password that is no
     longer on screen — the single worst thing this tool could get wrong. */
  const ticket = useRef(0);

  /* Shown live under the button, so the visitor watches the five characters
     change as they type and can see for themselves that the rest never moves. */
  const outgoing = useMemo(
    () => (password === "" ? "" : splitPasswordHash(password).prefix),
    [password],
  );

  const check = async (event: FormEvent) => {
    event.preventDefault();
    if (password === "" || status === "loading") return;

    const mine = ticket.current + 1;
    ticket.current = mine;
    setStatus("loading");
    setError("");

    /* The one line the whole tool is about: the digest is computed here, in
       the browser, and only `parts.prefix` — five characters — is ever put
       into a URL. `parts.suffix` stays in this closure. */
    const parts = splitPasswordHash(password);

    try {
      const response = await fetch(
        `/api/alet/parol-sizmasi?prefix=${encodeURIComponent(parts.prefix)}`,
      );
      const payload = (await response.json()) as Payload;
      if (mine !== ticket.current) return;

      if (!payload.ok) {
        setError(payload.message);
        setStatus("error");
        return;
      }

      const { range } = payload.data;
      setOutcome({
        parts,
        exposure: describeExposure(countInRange(range, parts.suffix)),
        crowd: parseRangeBody(range).length,
      });
      setStatus("done");
    } catch {
      if (mine !== ticket.current) return;
      setError("Sorğu göndərilmədi. İnternet bağlantını yoxla və yenidən cəhd et.");
      setStatus("error");
    }
  };

  const clean = outcome?.exposure.level === "clean";

  return (
    <div className="mt-8 space-y-5">
      {/* Before the field, not after it: a promise about where a password goes
          is worth nothing to somebody who has already typed it. */}
      <ToolNote tone="accent" title="Parol brauzerdən çıxmır">
        Yoxlama <strong>k-anonymity</strong> üsulu ilə aparılır. Parolun SHA-1 hash-i
        sənin brauzerində hesablanır və şəbəkəyə yalnız onun{" "}
        <strong>ilk 5 simvolu</strong> göndərilir. Cavabda həmin 5 simvolla başlayan
        minlərlə hash gəlir; sənin hash-in onların arasında var-yoxdur: bunu brauzer
        özü yoxlayır. Nə parolun, nə də onun tam hash-i heç yerə çıxmır.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader title="Parol" hint="Have I Been Pwned bazası" />

        <form onSubmit={check} className="space-y-4 p-4">
          <ToolField
            label="Yoxlanacaq parol"
            htmlFor="parol-sizmasi-input"
            note="Yazdıqca heç nə göndərilmir, sorğu yalnız düyməni basanda gedir."
            suffix={
              <ToolButton size="chip" onClick={() => setReveal((on) => !on)}>
                {reveal ? "Gizlət" : "Göstər"}
              </ToolButton>
            }
          >
            <ToolInput
              id="parol-sizmasi-input"
              type={reveal ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="parolu yaz"
              /* The browser's own password manager must not offer to fill or
                 to save anything here: this field is a question, not a login. */
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </ToolField>

          <div className="flex flex-wrap items-center gap-3">
            <ToolButton type="submit" disabled={password === "" || status === "loading"}>
              {status === "loading" ? "Yoxlanılır…" : "Yoxla"}
            </ToolButton>
            <span className="font-ui text-[11px] text-muted">
              Şəbəkəyə gedən: <span className="font-mono">{outgoing}</span>
            </span>
          </div>
        </form>
      </ToolPanel>

      {status === "error" && (
        <ToolNote tone="accent" title="Yoxlama alınmadı">
          {error}
        </ToolNote>
      )}

      {outcome && status !== "error" && (
        <ToolResultPanel title="Nəticə" hint={`prefiks ${outcome.parts.prefix}`}>
          <div className="space-y-4 p-4">
            <ToolStat
              label="Məlum sızmalarda görünmə sayı"
              value={outcome.exposure.count === 0 ? "tapılmadı" : formatNumber(outcome.exposure.count)}
              tone={clean ? "default" : "warning"}
              note={outcome.exposure.headline}
            />

            <ToolNote
              tone={clean ? "info" : "accent"}
              title={clean ? "Bunu «güclüdür» kimi oxuma" : "Nə etmək lazımdır"}
            >
              {outcome.exposure.advice}
            </ToolNote>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToolStat
                label="Göndərilən hissə"
                value={outcome.parts.prefix}
                note="Hash-in ilk 5 simvolu: şəbəkəyə çıxan yeganə məlumat."
              />
              <ToolStat
                label="Eyni prefiksli hash sayı"
                value={formatNumber(outcome.crowd)}
                note="Sorğun bu qədər hash-in arasında gizləndi: xidmət hansının səninki olduğunu bilmir."
              />
            </div>

            <ToolAccordion>
              <ToolAccordionItem summary="Tam SHA-1-i göstər" hint="brauzerdən çıxmayıb">
                <p className="font-mono text-xs break-all text-ink">
                  <span className="font-semibold">{outcome.parts.prefix}</span>
                  {outcome.parts.suffix}
                </p>
                <p className="mt-2">
                  Qalın yazılmış ilk 5 simvol göndərildi, qalan {SUFFIX_LENGTH} simvol bu
                  səhifədən kənara çıxmadı. SHA-1 zəif parol üçün geri açıla bildiyinə görə
                  tam hash-i heç yerə vermək olmaz.
                </p>
              </ToolAccordionItem>
            </ToolAccordion>
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}
