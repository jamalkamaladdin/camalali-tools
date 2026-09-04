"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { withInlineCode } from "./inline-code";
import {
  ToolButton,
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import { inspectSshInput, type SshLineResult } from "../lib/ssh-parmaq-izi";

/*
 * Two real, freshly generated demo keys — an unrestricted Ed25519 line and an
 * RSA line locked to one `rsync` command — plus a `#` comment line and a
 * blank line, so the sample also demonstrates the "skipped, not an error"
 * behaviour without a visitor having to type anything.
 */
const SAMPLE_KEYS = `# nümunə authorized_keys sətirləri
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJZqW9aRfNslhr387cPQ0LT6IBLGgSMOQ+kGO6uBV/wC laptop@masaustu

command="/usr/bin/rsync --server -vlogDtprze.iLsfxC . /home/backup",no-pty,no-port-forwarding,no-x11-forwarding ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCt0I9922cEjuKOXgQvGdJOyuSKygJV5QACYICtX7A4M1hnXbz1zw+3l6lu5c2D3aFhKt4b0HHDQjLNoDBDL3ZC9Bqc6/c/lM624YyCVdpl7z0Z3cp+Cp0Fo8dxkI4XMjaepBJfNGTJEMIL+u3HPZFsZBxI3vciUPim6TgTnrf3ZPSGbMNPYXCjROHgH1MtKNkRUrt64FDomrhaWg058Vlt97tKbGv/BbqKRJnw5A2I/M5/4uwjkkka8hKBAa1Ou4SP/iESzYaMscmTgneuMrRJxWEuBQh8Cj5ecEBP/nH8eGPZpJCTfB14w2b/D5JreeKappyeXcgm97jpYSZhHid9 rsync-backup@server`;

function SshKeyCard({ result }: { result: SshLineResult }) {
  if (!result.ok) {
    return (
      <ToolNote tone="accent" title="Bu sətir oxunmadı">
        <p className="font-mono text-xs break-all text-muted">{result.input}</p>
        <p className="mt-1.5">{result.error}</p>
      </ToolNote>
    );
  }

  const { key } = result;

  return (
    <ToolResultPanel
      title={key.typeLabel}
      hint={key.adequate ? "etibarlı" : "zəif"}
      action={<CopyButton value={key.sha256Fingerprint} label="SHA256 kopyala" />}
    >
      <div className="space-y-3 p-3">
        <div>
          <ToolLabel>SHA256 parmaq izi</ToolLabel>
          <ToolOutput className="mt-1 break-all">{key.sha256Fingerprint}</ToolOutput>
        </div>

        <div>
          <ToolLabel>MD5 parmaq izi (köhnə format)</ToolLabel>
          <div className="mt-1 flex items-start gap-2">
            <ToolOutput className="min-w-0 flex-1 break-all">{key.md5Fingerprint}</ToolOutput>
            <CopyButton value={key.md5Fingerprint} label="Kopyala" className="shrink-0" />
          </div>
        </div>

        <p className="text-ios-subhead text-ink">{key.adequacyNote}</p>

        {key.comment !== "" && (
          <div>
            <ToolLabel>Şərh</ToolLabel>
            <p className="mt-1 text-ios-subhead break-all">{key.comment}</p>
          </div>
        )}

        {key.restriction !== null && (
          <ToolNote tone="accent" title="Giriş şərtləndirilib">
            {withInlineCode(key.restriction)}
          </ToolNote>
        )}

        {key.options.length > 0 && (
          <div>
            <ToolLabel>authorized_keys seçimləri</ToolLabel>
            <ul className="mt-1 space-y-1.5 text-ios-footnote text-muted">
              {key.options.map((option, index) => (
                <li key={index}>
                  <span className="font-mono text-xs text-ink break-all">{option.raw}</span>
                  <span className="block">{option.note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ToolResultPanel>
  );
}

export function SshParmaqIziTool() {
  const [text, setText] = useState(SAMPLE_KEYS);

  const inspection = useMemo(() => inspectSshInput(text), [text]);

  const okCount =
    !inspection.refused ? inspection.results.filter((result) => result.ok).length : 0;
  const errorCount =
    !inspection.refused ? inspection.results.length - okCount : 0;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="authorized_keys"
          hint="hər sətirdə bir açıq açar"
          action={
            <>
              <ToolButton size="chip" onClick={() => setText(SAMPLE_KEYS)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setText("")} disabled={text === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />
        <div className="p-4">
          <ToolTextArea
            id="ssh-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="ssh-ed25519 AAAA... istifadəçi@host"
            spellCheck={false}
            className="min-h-40"
            aria-label="Açıq açar sətirləri"
          />
        </div>
      </ToolPanel>

      {inspection.refused ? (
        <ToolNote tone="accent" title="Özəl açar — emal edilmədi">
          {inspection.reason}
        </ToolNote>
      ) : inspection.results.length === 0 ? (
        <ToolNote tone="info">Yoxlamaq üçün ən azı bir açıq açar sətri yaz.</ToolNote>
      ) : (
        <>
          <ToolLabel>
            {okCount} açar tanındı{errorCount > 0 ? `, ${errorCount} sətir oxunmadı` : ""}
          </ToolLabel>
          <div className="space-y-4">
            {inspection.results.map((result, index) => (
              <SshKeyCard key={index} result={result} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
