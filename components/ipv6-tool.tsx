"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import {
  analyseIpv6,
  compareContainment,
  formatAddressCount,
  IPV6_KIND_INFO,
  type ContainmentRelation,
} from "../lib/ipv6";

/*
 * The RFC 5952 worked example with a /64 tacked on: pasting it demonstrates
 * the canonical-shortening rule (the four leading zero groups collapse to
 * `::`) and the prefix arithmetic panel in the same click.
 */
const SAMPLE_ADDRESS = "2001:0db8:0000:0000:0000:ff00:0042:8329/64";
const SAMPLE_SECOND = "2001:db8::/32";

const RELATION_TEXT: Record<ContainmentRelation, string> = {
  equal: "İki prefiks eynidir — eyni şəbəkəni göstərir.",
  "a-contains-b": "Birinci prefiks ikincini əhatə edir — ikinci onun daxilindəki alt şəbəkədir.",
  "b-contains-a": "İkinci prefiks birincini əhatə edir — birinci onun daxilindəki alt şəbəkədir.",
  disjoint: "Biri digərini əhatə etmir — iki ayrı şəbəkədir.",
};

export function Ipv6Tool() {
  const [addressText, setAddressText] = useState(SAMPLE_ADDRESS);
  const [secondText, setSecondText] = useState(SAMPLE_SECOND);

  const analysis = useMemo(() => analyseIpv6(addressText), [addressText]);
  const containment = useMemo(() => {
    if (secondText.trim() === "") return null;
    return compareContainment(addressText, secondText);
  }, [addressText, secondText]);

  const loadSample = () => {
    setAddressText(SAMPLE_ADDRESS);
    setSecondText(SAMPLE_SECOND);
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Ünvan"
          hint="IPv6 və ya IPv4"
          action={
            <ToolButton size="chip" onClick={loadSample}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="space-y-4 p-4">
          <ToolField
            label="IPv6 ünvanı (prefikslə və ya prefikssiz)"
            htmlFor="ipv6-address"
            note="Prefiks yazılmasa yalnız formatı, növü və tərs DNS adını göstərir. Sadə IPv4 ünvanı da qəbul olunur — ::ffff: formasına çevrilir."
          >
            <ToolInput
              id="ipv6-address"
              value={addressText}
              onChange={(event) => setAddressText(event.target.value)}
              spellCheck={false}
              className="font-mono"
              placeholder="2001:db8::1/64"
            />
          </ToolField>

          <ToolField
            label="İkinci prefiks (əhatə yoxlaması, könüllü)"
            htmlFor="ipv6-second"
            note="Hər iki tərəf prefiksli olmalıdır (/n). Boş saxlasan əhatə yoxlaması göstərilmir."
          >
            <ToolInput
              id="ipv6-second"
              value={secondText}
              onChange={(event) => setSecondText(event.target.value)}
              spellCheck={false}
              className="font-mono"
              placeholder="2001:db8::/32"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!analysis.ok && <ToolNote tone="accent">{analysis.error}</ToolNote>}

      {analysis.ok && (
        <>
          <ToolResultPanel title="Format">
            <div className="space-y-4 p-4">
              {analysis.info.mappedFromIpv4 && (
                <ToolNote tone="info">
                  IPv4 ünvanı yazıldı — avtomatik olaraq IPv6-mapped formasına (::ffff:) çevrildi.
                </ToolNote>
              )}
              <div>
                <ToolLabel>Qısaldılmış (kanonik, RFC 5952)</ToolLabel>
                <div className="mt-1.5 flex items-start gap-2">
                  <ToolOutput className="flex-1">{analysis.info.compressed}</ToolOutput>
                  <CopyButton value={analysis.info.compressed} label="qısaldılmışı kopyala" />
                </div>
              </div>
              <div>
                <ToolLabel>Tam (səkkiz qrup)</ToolLabel>
                <div className="mt-1.5 flex items-start gap-2">
                  <ToolOutput className="flex-1">{analysis.info.expanded}</ToolOutput>
                  <CopyButton value={analysis.info.expanded} label="tam formanı kopyala" />
                </div>
              </div>
            </div>
          </ToolResultPanel>

          <ToolResultPanel title="Növ" hint={IPV6_KIND_INFO[analysis.info.kind].reference}>
            <div className="space-y-2 p-4">
              <p className="text-ios-headline">{IPV6_KIND_INFO[analysis.info.kind].label}</p>
              <p className="text-ios-subhead text-muted">{IPV6_KIND_INFO[analysis.info.kind].meaning}</p>
              {analysis.info.ipv4Embedded && (
                <div className="pt-2">
                  <ToolLabel>Daşıdığı IPv4 ünvanı</ToolLabel>
                  <div className="mt-1.5 flex items-start gap-2">
                    <ToolOutput className="flex-1">{analysis.info.ipv4Embedded}</ToolOutput>
                    <CopyButton value={analysis.info.ipv4Embedded} label="IPv4-ü kopyala" />
                  </div>
                </div>
              )}
            </div>
          </ToolResultPanel>

          {analysis.info.prefixInfo && (
            <ToolResultPanel title="Prefiks hesablamaları" hint={`/${analysis.info.prefixInfo.prefix}`}>
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-3">
                  <ToolStat
                    label="Şəbəkə ünvanı"
                    value={<span className="break-all">{analysis.info.prefixInfo.networkCompressed}</span>}
                    note={analysis.info.prefixInfo.networkExpanded}
                  />
                  <ToolStat
                    label="İlk ünvan"
                    value={<span className="break-all">{analysis.info.prefixInfo.firstCompressed}</span>}
                  />
                  <ToolStat
                    label="Son ünvan"
                    value={<span className="break-all">{analysis.info.prefixInfo.lastCompressed}</span>}
                    note={analysis.info.prefixInfo.lastExpanded}
                  />
                </div>
                {(() => {
                  const count = formatAddressCount(analysis.info.prefixInfo.hostBits);
                  return (
                    <ToolStat
                      label="Ünvan sayı"
                      value={count.power}
                      note={count.exact ?? "Çox böyük ədəd — yalnız üstlü formada göstərilir."}
                    />
                  );
                })()}
              </div>
            </ToolResultPanel>
          )}

          <ToolResultPanel title="Tərs DNS adı" hint=".ip6.arpa">
            <div className="flex items-start gap-2 p-4">
              <ToolOutput className="flex-1">{analysis.info.reverseDns}</ToolOutput>
              <CopyButton value={analysis.info.reverseDns} label="tərs DNS adını kopyala" />
            </div>
          </ToolResultPanel>
        </>
      )}

      {containment && (
        <ToolResultPanel title="Əhatə yoxlaması">
          <div className="space-y-2 p-4">
            {containment.ok ? (
              <>
                <p className="text-ios-headline">{RELATION_TEXT[containment.relation]}</p>
                <p className="text-ios-subhead text-muted tabular-nums">
                  İlk {containment.commonPrefixLength} bit eynidir.
                  {containment.divergeBit !== null &&
                    ` ${containment.divergeBit + 1}-ci bitdən etibarən fərqlənirlər.`}
                </p>
              </>
            ) : (
              <ToolNote tone="accent">{containment.error}</ToolNote>
            )}
          </div>
        </ToolResultPanel>
      )}
    </div>
  );
}
