"use client";

import { useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { withInlineCode } from "./inline-code";
import { ToolSegmented } from "./tabs";
import {
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  buildBasicAuthHeader,
  buildServerSnippets,
  parseBasicAuthHeader,
  validateUsername,
} from "../lib/basic-auth";

/*
 * Two directions, the same shape `sifreleme-tool.tsx` uses for encrypt and
 * decrypt: one mode switch, one input surface, one output surface. Building
 * and parsing are the same kind of reversible pair that pattern was written
 * for.
 */
type Mode = "qur" | "parcala";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "qur", label: "Qur" },
  { value: "parcala", label: "Parçala" },
];

const SAMPLE_USERNAME = "admin";
const SAMPLE_PASSWORD = "üzüm123";

export function BasicAuthTool() {
  const [mode, setMode] = useState<Mode>("qur");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [pastedHeader, setPastedHeader] = useState("");

  const usernameCheck = validateUsername(username);
  const buildReady = username !== "" && password !== "";
  const buildResult = buildReady ? buildBasicAuthHeader(username, password) : null;
  const snippets = buildResult?.ok ? buildServerSnippets(username, password, targetUrl) : null;

  const parseResult = pastedHeader.trim() !== "" ? parseBasicAuthHeader(pastedHeader) : null;

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Bu şifrələmə deyil">
        {withInlineCode(
          "`Authorization: Basic` başlığı Base64 ilə kodlaşdırılır, şifrələnmir — açar olmadan hər kəs onu bir saniyəyə geri açır. Başlığı görən hər tərəf (proksi, brauzer əlavəsi, server jurnalı) parolu da açıq mətn kimi görür, ona görə Basic Auth yalnız https üzərində işlədilməlidir.",
        )}
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title={mode === "qur" ? "Ad və parol" : "Başlıq"}
          action={<ToolSegmented label="Rejim" options={MODE_OPTIONS} value={mode} onChange={setMode} />}
        />

        {mode === "qur" ? (
          <div className="space-y-4 p-4">
            <div className="grid gap-4 @container @min-[30rem]:grid-cols-2">
              <ToolField label="İstifadəçi adı" htmlFor="basic-auth-username">
                <ToolInput
                  id="basic-auth-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={SAMPLE_USERNAME}
                  spellCheck={false}
                  autoComplete="off"
                />
              </ToolField>
              <ToolField label="Parol" htmlFor="basic-auth-password">
                <ToolInput
                  id="basic-auth-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={SAMPLE_PASSWORD}
                  spellCheck={false}
                  autoComplete="off"
                />
              </ToolField>
            </div>

            <ToolField
              label="Hədəf ünvan"
              htmlFor="basic-auth-url"
              note="Yalnız aşağıdakı curl əmrinə yazılır, heç yerə göndərilmir."
            >
              <ToolInput
                id="basic-auth-url"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                placeholder="https://sayt.com/qorunan-yol"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>

            {!usernameCheck.ok && username !== "" && (
              <ToolNote tone="accent" title="Alınmadı">
                {withInlineCode(usernameCheck.error)}
              </ToolNote>
            )}

            {!buildReady && (
              <ToolNote tone="info">Nəticəni görmək üçün istifadəçi adı və parol yaz.</ToolNote>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <ToolField
              label="Authorization başlığı"
              htmlFor="basic-auth-paste"
              note={withInlineCode(
                "Tam başlığı da (`Authorization: Basic ...`), yalnız Base64 hissəsini də yapışdıra bilərsən.",
              )}
            >
              <ToolTextArea
                id="basic-auth-paste"
                value={pastedHeader}
                onChange={(event) => setPastedHeader(event.target.value)}
                rows={3}
                spellCheck={false}
                placeholder="Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="
              />
            </ToolField>
            {parseResult === null && <ToolNote tone="info">Nəticəni görmək üçün başlığı yapışdır.</ToolNote>}
          </div>
        )}
      </ToolPanel>

      {mode === "qur" && buildResult !== null && !buildResult.ok && (
        <ToolNote tone="accent" title="Alınmadı">
          {withInlineCode(buildResult.error)}
        </ToolNote>
      )}

      {mode === "qur" && buildResult?.ok && (
        <>
          <ToolResultPanel
            title="Authorization başlığı"
            hint="UTF-8 — RFC 7617"
            action={<CopyButton value={buildResult.utf8.header} label="Başlığı kopyala" className="shrink-0" />}
          >
            <ToolOutput className="m-4 break-all">{buildResult.utf8.header}</ToolOutput>
          </ToolResultPanel>

          <ToolResultPanel title="UTF-8 və Latin-1 müqayisəsi" hint={buildResult.differs ? "fərqlidir" : "eynidir"}>
            <div className="@container space-y-3 p-4">
              <div className="grid gap-3 @min-[28rem]:grid-cols-2">
                <div>
                  <ToolLabel>UTF-8 Base64 (RFC 7617)</ToolLabel>
                  <ToolOutput className="mt-1.5 break-all">{buildResult.utf8.base64}</ToolOutput>
                </div>
                <div>
                  <ToolLabel>Latin-1 Base64 (köhnə server)</ToolLabel>
                  {buildResult.latin1.ok ? (
                    <ToolOutput className="mt-1.5 break-all">{buildResult.latin1.base64}</ToolOutput>
                  ) : (
                    <ToolNote tone="accent" className="mt-1.5">
                      {withInlineCode(buildResult.latin1.error)}
                    </ToolNote>
                  )}
                </div>
              </div>
              {buildResult.latin1.ok && (
                <p className="text-ios-footnote text-muted">
                  {buildResult.differs
                    ? "İki dəyər fərqlidir — parolda Latin-1-in ASCII-dən kənar bir hərfi var."
                    : "İki dəyər eynidir — parol yalnız ASCII simvollardan ibarətdir."}
                </p>
              )}
            </div>
          </ToolResultPanel>

          {snippets !== null && (
            <ToolPanel>
              <ToolPanelHeader title="Server konfiqurasiyası" hint="hazır sətirlər" />
              <div className="space-y-4 p-4">
                <SnippetBlock title="curl" value={snippets.curl} />
                <SnippetBlock title="Caddy (Caddyfile)" value={snippets.caddy} />
                <SnippetBlock title="nginx" value={snippets.nginx} />
                <SnippetBlock title="Apache (.htaccess / httpd.conf)" value={snippets.apache} />

                <ToolNote tone="info" title="Hash-i bu alət hesablamır">
                  {withInlineCode(
                    "Caddy-nin `basic_auth` direktivi və nginx/Apache-nin oxuduğu `.htpasswd` sətri parolun özünü yox, onun hash-ini istəyir — Caddy bcrypt, `.htpasswd` isə ənənəvi olaraq APR1-MD5 (`$apr1$duz$hash`) formatını gözləyir. APR1-MD5 təsadüfi duzla başlayıb MD5-i dəfələrlə təkrarlayan bir konstruksiyadır; onu əl ilə yenidən yazmaq asanlıqla səhv nəticə verər, ona görə bu alət hash-i özü hesablamır. Əvəzinə: Caddy üçün `caddy hash-password --plaintext '<parol>'`, nginx/Apache üçün `htpasswd -nm istifadeci_adi` əmrini terminalda çalışdır — hər ikisi sınaqdan keçmiş, hazır alətlərdir və nəticə sətrini birbaşa yuxarıdakı yerə qoymaq kifayətdir.",
                  )}
                </ToolNote>
              </div>
            </ToolPanel>
          )}
        </>
      )}

      {mode === "parcala" && parseResult !== null && !parseResult.ok && (
        <ToolNote tone="accent" title="Alınmadı">
          {withInlineCode(parseResult.error)}
        </ToolNote>
      )}

      {mode === "parcala" && parseResult?.ok && (
        <ToolResultPanel
          title="Çıxarılan cüt"
          hint={parseResult.encoding === "utf-8" ? "UTF-8" : "Latin-1 (ehtiyat oxuma)"}
        >
          <div className="@container p-4">
            <div className="grid gap-3 @min-[28rem]:grid-cols-2">
              <ToolStat label="İstifadəçi adı" value={parseResult.username || "(boş)"} />
              <ToolStat label="Parol" value={parseResult.password || "(boş)"} />
            </div>
            {parseResult.encoding === "latin1-fallback" && (
              <p className="mt-3 text-ios-footnote text-muted">
                {withInlineCode(
                  "Base64-ün içi düzgün UTF-8 deyildi, ona görə bayt-bayt Latin-1 kimi oxundu — bu, başlığı köhnə üslubda `ISO-8859-1` kodlaşdırma ilə quran bir server olduğunu göstərir.",
                )}
              </p>
            )}
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}

function SnippetBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <ToolLabel>{title}</ToolLabel>
        <CopyButton value={value} label="Kopyala" className="shrink-0" />
      </div>
      <ToolOutput>{value}</ToolOutput>
    </div>
  );
}
