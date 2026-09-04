"use client";

import { useMemo, useState } from "react";
import {
  buildMailAnalysis,
  type AuthMethod,
  type AuthResult,
  type MailAnalysis,
  type ReceivedHop,
} from "../lib/mail-basliq-analizi";
import {
  accentWash,
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

/*
 * A three-hop, phishing-shaped chain: the visible `From` names a bank, the
 * actual sending domain — visible only in `Return-Path` and `Reply-To` — does
 * not. SPF/DKIM/DMARC all fail for the same reason, and a folded `Subject`
 * line demonstrates the unfolding step without needing a second, unrelated
 * example.
 */
const SAMPLE_HEADERS = `Delivered-To: nigar@example.az
Received: by 10.28.55.66 with SMTP id e02csp1234567abc;
        Thu, 3 Sep 2026 01:18:52 -0700 (PDT)
Received: from mail-relay.evil-sender.net (mail-relay.evil-sender.net. [203.0.113.42])
        by mx.example.az with ESMTPS id d7si3821728ejb;
        Thu, 03 Sep 2026 01:18:50 -0700 (PDT)
Received: from smtp.evil-sender.net (smtp.evil-sender.net [198.51.100.7])
        by mail-relay.evil-sender.net with SMTP id ab12cd34;
        Thu, 3 Sep 2026 08:18:20 +0000
Authentication-Results: mx.example.az;
       dkim=fail header.i=@evil-sender.net;
       spf=softfail (mx.example.az: domain of bank-destek@bank-az.com does not designate 198.51.100.7 as permitted sender) smtp.mailfrom=bank-destek@bank-az.com;
       dmarc=fail (p=REJECT sp=REJECT dis=NONE) header.from=bank-az.com
Return-Path: <bounce@evil-sender.net>
From: "Bank Dəstək" <bank-destek@bank-az.com>
Reply-To: geri-bildirim@evil-sender.net
To: nigar@example.az
Subject: Hesabınızla bağlı təcili
 bir bildiriş var
Message-ID: <20260903081820.ab12cd34@smtp.evil-sender.net>
X-Spam-Score: 8.4
X-Spam-Status: Yes, score=8.4 required=5.0`;

const AUTH_LABELS: Record<AuthMethod, string> = { spf: "SPF", dkim: "DKIM", dmarc: "DMARC" };

const GOOD_RESULTS = new Set(["pass"]);

function formatDelay(ms: number | null): string {
  if (ms === null) return "naməlum";
  if (ms < 0) return "əvvəlki saatdan geri (saat sinxron deyil)";
  if (ms < 1000) return `${ms} ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} san`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes} dəq` : `${minutes} dəq ${seconds} san`;
}

export function MailBasliqAnaliziTool() {
  const [raw, setRaw] = useState(SAMPLE_HEADERS);

  const result = useMemo(() => buildMailAnalysis(raw), [raw]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Xam başlıqlar"
          hint="hər sətir bir başlıq"
          action={
            <ToolButton size="chip" onClick={() => setRaw(SAMPLE_HEADERS)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="Başlıqlar" htmlFor="mail-basliq-raw">
            <ToolTextArea
              id="mail-basliq-raw"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              rows={14}
              spellCheck={false}
              placeholder={"Received: ...\nFrom: ...\nSubject: ..."}
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok && (
        <ToolNote tone="accent" title="Alınmadı">
          {result.error}
        </ToolNote>
      )}

      {result.ok && <Report analysis={result.analysis} />}
    </div>
  );
}

function Report({ analysis }: { analysis: MailAnalysis }) {
  return (
    <div className="space-y-5">
      <div className="@container">
        <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          <ToolStat label="Başlıq sayı" value={String(analysis.headerCount)} />
          <ToolStat label="Received sıçrayışı" value={String(analysis.receivedChain.length)} />
          <ToolStat label="Ümumi gecikmə" value={formatDelay(analysis.totalDelayMs)} />
          <ToolStat
            label="Göndərən uyğunluğu"
            value={analysis.sender.fromReturnPathMismatch ? "uyğun deyil" : "uyğundur"}
            tone={analysis.sender.fromReturnPathMismatch ? "warning" : "default"}
          />
        </div>
      </div>

      {analysis.receivedChain.length > 0 && <ReceivedChainPanel hops={analysis.receivedChain} />}

      <SenderPanel analysis={analysis} />

      <AuthPanel auth={analysis.auth} />

      <OtherHeadersPanel analysis={analysis} />
    </div>
  );
}

function ReceivedChainPanel({ hops }: { hops: ReceivedHop[] }) {
  return (
    <ToolResultPanel title="Received zənciri" hint="göndərəndən alana">
      <div className="space-y-3 p-3">
        {hops.map((hop, index) => (
          <div key={index} className="rounded border border-result-rule p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <ToolLabel>{index === 0 ? "1. sıçrayış (göndərən tərəf)" : `${index + 1}. sıçrayış`}</ToolLabel>
              <span className="text-[11px] text-muted tabular-nums">{formatDelay(hop.delayMs)}</span>
            </div>
            <p className="mt-1 font-mono text-xs break-all">
              {hop.from ? `from ${hop.from}` : "from: bilinmir"}
            </p>
            <p className="font-mono text-xs break-all">{hop.by ? `by ${hop.by}` : "by: bilinmir"}</p>
            {hop.withProtocol && <p className="font-mono text-xs break-all">with {hop.withProtocol}</p>}
          </div>
        ))}
      </div>
    </ToolResultPanel>
  );
}

function SenderPanel({ analysis }: { analysis: MailAnalysis }) {
  const { sender } = analysis;
  return (
    <ToolResultPanel
      title="Göndərən sahələri"
      hint={sender.fromReturnPathMismatch ? "uyğunsuzluq var" : "uyğundur"}
    >
      <div className="space-y-2 p-3">
        <AddressLine label="From" address={sender.from} />
        <AddressLine label="Return-Path" address={sender.returnPath} />
        <AddressLine label="Reply-To" address={sender.replyTo} />
        {(sender.fromReturnPathMismatch || sender.replyToMismatch) && (
          <p className="mt-2 text-sm/6">
            {sender.fromReturnPathMismatch &&
              "«From» və «Return-Path» fərqli domendədir: bu, saxtakarlığın klassik izidir, amma qanuni newsletter platformaları da bunu edir. "}
            {sender.replyToMismatch &&
              "«Reply-To» «From»-dan fərqli bir domenə işarə edir. Cavab yazsan mesaj başqa ünvana gedəcək."}
          </p>
        )}
      </div>
    </ToolResultPanel>
  );
}

function AddressLine({ label, address }: { label: string; address: { name: string | null; address: string | null } | null }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="w-28 shrink-0 text-ios-footnote text-muted">{label}</span>
      {address === null || address.address === null ? (
        <span className="text-sm text-muted">yoxdur</span>
      ) : (
        <span className="font-mono text-sm break-all">
          {address.name ? `${address.name} <${address.address}>` : address.address}
        </span>
      )}
    </div>
  );
}

function AuthPanel({ auth }: { auth: Record<AuthMethod, AuthResult | null> }) {
  return (
    <ToolResultPanel title="Autentifikasiya nəticələri" hint="Authentication-Results">
      <div className="@container p-3">
        <div className="grid gap-3 @min-[30rem]:grid-cols-3">
          {(Object.keys(AUTH_LABELS) as AuthMethod[]).map((method) => {
            const entry = auth[method];
            const good = entry !== null && GOOD_RESULTS.has(entry.result);
            return (
              <ToolStat
                key={method}
                label={AUTH_LABELS[method]}
                value={entry ? entry.result : "tapılmadı"}
                tone={entry === null ? "default" : good ? "default" : "warning"}
                note={entry?.detail ?? undefined}
              />
            );
          })}
        </div>
      </div>
    </ToolResultPanel>
  );
}

function OtherHeadersPanel({ analysis }: { analysis: MailAnalysis }) {
  return (
    <ToolPanel>
      <ToolPanelHeader title="Digər başlıqlar" />
      <div className="space-y-3 p-4">
        <div>
          <ToolLabel>Message-ID</ToolLabel>
          <p className="mt-1 font-mono text-sm break-all">{analysis.messageId ?? "yoxdur"}</p>
        </div>
        <div>
          <ToolLabel>X-Spam-* başlıqları</ToolLabel>
          {analysis.spamHeaders.length === 0 ? (
            <p className="mt-1 text-sm text-muted">yoxdur</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {analysis.spamHeaders.map((header, index) => (
                <li key={index} className="font-mono text-xs break-all">
                  <span
                    className="rounded-[2px] px-1 text-ink"
                    style={{ backgroundColor: accentWash }}
                  >
                    {header.name}
                  </span>{" "}
                  {header.value}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ToolPanel>
  );
}
