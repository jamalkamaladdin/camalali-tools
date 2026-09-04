"use client";

import { useMemo, useState } from "react";
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
  ToolSelect,
  ToolStat,
} from "./ui";
import { formatNumber } from "../shared/format";
import {
  analyseIpv4,
  analyseIpv6,
  CLASS_LABELS,
  formatAddressCount,
  formatIpv4,
  IPV4_PREFIX_MAX,
  SPLIT_ROW_LIMIT,
  splitCidrText,
  splitSubnet,
  subnetReport,
} from "../lib/subnet";

const SAMPLES = [
  { label: "Ev şəbəkəsi", value: "192.168.1.10/24" },
  { label: "VPC", value: "10.0.0.0/16" },
  { label: "Nöqtə-nöqtə", value: "192.0.2.0/31" },
  { label: "Tək host", value: "8.8.8.8/32" },
];

const DEFAULT_INPUT = "192.168.1.10/24";
const DEFAULT_IPV6 = "2001:0db8:0000:0000:0000:ff00:0042:8329/48";

export function SubnetTool() {
  const [text, setText] = useState(DEFAULT_INPUT);
  /*
   * Only used when the typed text carries no "/nn" of its own. The text field
   * is the single source of truth for the prefix: moving the slider rewrites
   * the text, so the two controls can never disagree about what is being
   * calculated — which is the failure this tool would be blamed for first.
   */
  const [loosePrefix, setLoosePrefix] = useState(24);
  const [splitPrefix, setSplitPrefix] = useState(26);
  const [ipv6Text, setIpv6Text] = useState(DEFAULT_IPV6);

  const typed = splitCidrText(text);
  const activePrefix = typed.prefix ?? loosePrefix;

  const analysis = useMemo(() => analyseIpv4(text, loosePrefix), [text, loosePrefix]);
  const info = analysis.ok ? analysis.info : null;

  const split = useMemo(
    () => (info === null ? null : splitSubnet(info, splitPrefix)),
    [info, splitPrefix],
  );

  const ipv6 = useMemo(() => analyseIpv6(ipv6Text, 64), [ipv6Text]);

  const movePrefix = (next: number) => {
    setLoosePrefix(next);
    // Rewritten only when a prefix was already typed; adding one to a bare
    // address while the visitor is still halfway through typing it would move
    // their cursor out from under them.
    if (typed.prefix !== null) setText(`${typed.address}/${next}`);
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="IPv4"
          action={
            <>
              {SAMPLES.map((sample) => (
                <ToolButton
                  key={sample.value}
                  size="chip"
                  onClick={() => {
                    setText(sample.value);
                    const parsed = splitCidrText(sample.value);
                    if (parsed.prefix !== null) setLoosePrefix(parsed.prefix);
                  }}
                >
                  {sample.label}
                </ToolButton>
              ))}
              <ToolButton size="chip" onClick={() => setText("")} disabled={text === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <ToolField
              label="Ünvan və ya CIDR"
              htmlFor="subnet-address"
              note="192.168.1.10 və ya 192.168.1.10/24 — hər iki forma qəbul edilir."
            >
              <ToolInput
                id="subnet-address"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="192.168.1.10/24"
                spellCheck={false}
                inputMode="text"
              />
            </ToolField>

            <ToolField
              label="Prefiks"
              htmlFor="subnet-prefix"
              hint={<span className="tabular-nums">/{activePrefix}</span>}
              note="Sürüşdür — bütün nəticələr dərhal yenilənir."
            >
              {/* A native range: the skin layer draws buttons and fields, and a
                  slider is neither. `accent-color` is what makes it follow the
                  active accent the way the checkboxes on the uuid tool do. */}
              <input
                id="subnet-prefix"
                type="range"
                min={0}
                max={IPV4_PREFIX_MAX}
                step={1}
                value={activePrefix}
                onChange={(event) => movePrefix(Number(event.target.value))}
                className="h-9 w-full accent-[var(--color-accent)]"
              />
            </ToolField>

            {info !== null && info.insideBlock && (
              <ToolNote title="Şəbəkə ünvanı deyil">
                Yazdığın ünvan blokun içindədir, amma onun ilk ünvanı deyil. Bu blokun
                şəbəkə ünvanı {formatIpv4(info.network)}/{info.prefix}.
              </ToolNote>
            )}
          </div>

          {analysis.ok ? (
            <ToolResultPanel
              title="Şəbəkə"
              hint={
                <span className="tabular-nums">
                  {formatIpv4(analysis.info.network)}/{analysis.info.prefix}
                </span>
              }
              action={
                <CopyButton value={subnetReport(analysis.info)} label="nəticəni kopyala" />
              }
              className="min-w-0"
            >
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
                <ToolStat
                  label="Şəbəkə ünvanı"
                  value={formatIpv4(analysis.info.network)}
                  tone="accent"
                />
                <ToolStat
                  label="Broadcast"
                  value={
                    analysis.info.broadcast === null
                      ? "yoxdur"
                      : formatIpv4(analysis.info.broadcast)
                  }
                  note={
                    analysis.info.prefix === 31
                      ? "/31-də broadcast ayrılmır (RFC 3021)."
                      : analysis.info.prefix === 32
                        ? "/32 tək ünvandır."
                        : undefined
                  }
                />
                <ToolStat label="Maska" value={formatIpv4(analysis.info.mask)} />
                <ToolStat
                  label="Wildcard maska"
                  value={formatIpv4(analysis.info.wildcard)}
                  note="ACL və OSPF konfiqurasiyalarında istifadə olunur."
                />
                <ToolStat
                  label="İlk host"
                  value={
                    analysis.info.firstHost === null
                      ? "yoxdur"
                      : formatIpv4(analysis.info.firstHost)
                  }
                />
                <ToolStat
                  label="Son host"
                  value={
                    analysis.info.lastHost === null
                      ? "yoxdur"
                      : formatIpv4(analysis.info.lastHost)
                  }
                />
                <ToolStat
                  label="Ünvan sayı"
                  value={formatNumber(analysis.info.totalAddresses)}
                />
                <ToolStat
                  label="Host sayı"
                  value={formatNumber(analysis.info.usableHosts)}
                  tone="accent"
                  note={
                    analysis.info.prefix <= 30
                      ? "Şəbəkə və broadcast ünvanları çıxılıb."
                      : "Hər iki ünvan hosta verilir."
                  }
                />
                <ToolStat
                  label="Sinif"
                  value={analysis.info.addressClass}
                  note={CLASS_LABELS[analysis.info.addressClass]}
                />
                <ToolStat
                  label="Növ"
                  value={analysis.info.scope.private ? "şəxsi" : "ictimai"}
                  tone={analysis.info.scope.private ? "warning" : "default"}
                  note={`${analysis.info.scope.label} · ${analysis.info.scope.reference}`}
                  className="col-span-2 sm:col-span-3"
                />
              </div>
            </ToolResultPanel>
          ) : (
            <ToolNote tone="accent" title="Ünvan oxunmadı">
              {analysis.error}
            </ToolNote>
          )}
        </div>
      </ToolPanel>

      <ToolAccordion>
        <ToolAccordionItem
          summary="Alt şəbəkələrə böl"
          hint="bir bloku bərabər hissələrə"
          defaultOpen
        >
          {info === null || split === null ? (
            <p className="font-ui text-sm text-muted">
              Yuxarıda düzgün bir şəbəkə yaz — bölgü burada görünəcək.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <ToolField
                  label="Yeni prefiks"
                  htmlFor="subnet-split"
                  className="w-40"
                  hint={<span className="tabular-nums">/{split.newPrefix}</span>}
                >
                  <ToolSelect
                    id="subnet-split"
                    value={split.newPrefix}
                    onChange={(event) => setSplitPrefix(Number(event.target.value))}
                  >
                    {Array.from(
                      { length: IPV4_PREFIX_MAX - info.prefix + 1 },
                      (_, index) => info.prefix + index,
                    ).map((option) => (
                      <option key={option} value={option}>
                        /{option}
                      </option>
                    ))}
                  </ToolSelect>
                </ToolField>

                <p className="font-ui text-xs/6 text-muted">
                  <span className="tabular-nums">{formatNumber(split.total)}</span> alt şəbəkə
                  {split.truncated
                    ? ` — ilk ${SPLIT_ROW_LIMIT} dənəsi göstərilir.`
                    : "."}
                </p>
              </div>

              <div
                data-surface="result"
                className="overflow-x-auto rounded border border-result-rule bg-result"
              >
                <table className="w-full border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-result-rule text-left text-muted">
                      <th scope="col" className="p-2 font-normal">
                        Alt şəbəkə
                      </th>
                      <th scope="col" className="p-2 font-normal">
                        Host aralığı
                      </th>
                      <th scope="col" className="p-2 font-normal">
                        Broadcast
                      </th>
                      <th scope="col" className="p-2 text-right font-normal">
                        Host
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {split.parts.map((part) => (
                      <tr key={part.cidr} className="border-b border-result-rule last:border-0">
                        <td className="p-2 whitespace-nowrap">{part.cidr}</td>
                        <td className="p-2 whitespace-nowrap">
                          {part.firstHost === null || part.lastHost === null
                            ? "—"
                            : `${formatIpv4(part.firstHost)} – ${formatIpv4(part.lastHost)}`}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {part.broadcast === null ? "—" : formatIpv4(part.broadcast)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatNumber(part.usableHosts)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ToolAccordionItem>

        <ToolAccordionItem summary="IPv6 ünvanı" hint="normallaşdırma · prefiks · ünvan sayı">
          <div className="space-y-4">
            {/* The scope limit is stated before the field, not after the
                result: somebody who came here for an IPv6 host range should
                learn that it is not on offer before they type. */}
            <ToolNote title="Bu bölmə nə edir">
              Qısaldılmış formanı tam səkkiz qrupa açır və əksinə (RFC 5952), prefiksə görə
              şəbəkə ünvanını tapır və prefiksin neçə ünvan tutduğunu göstərir. Host
              aralığı, broadcast və şəxsi/ictimai bölgüsü yalnız IPv4 hissəsindədir —
              IPv6-da broadcast yoxdur, onun işini multicast görür.
            </ToolNote>

            <ToolField
              label="IPv6 ünvanı"
              htmlFor="subnet-ipv6"
              note="Prefiks yazılmasa /64 götürülür. «::», zona («%eth0») və kvadrat mötərizə qəbul edilir."
            >
              <ToolInput
                id="subnet-ipv6"
                value={ipv6Text}
                onChange={(event) => setIpv6Text(event.target.value)}
                placeholder="2001:db8::1/64"
                spellCheck={false}
              />
            </ToolField>

            {ipv6.ok ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <ToolStat
                  label="Qısa forma"
                  value={<span className="break-all">{ipv6.info.compressed}</span>}
                  tone="accent"
                />
                <ToolStat
                  label="Tam forma"
                  value={<span className="break-all">{ipv6.info.expanded}</span>}
                />
                <ToolStat
                  label={`Şəbəkə (/${ipv6.info.prefix})`}
                  value={<span className="break-all">{ipv6.info.networkCompressed}</span>}
                  note={ipv6.info.networkExpanded}
                />
                <ToolStat
                  label="Ünvan sayı"
                  value={`2^${ipv6.info.addressExponent}`}
                  note={formatAddressCount(ipv6.info.addressCount)}
                />
              </div>
            ) : (
              <ToolNote tone="accent" title="IPv6 ünvanı oxunmadı">
                {ipv6.error}
              </ToolNote>
            )}
          </div>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}
