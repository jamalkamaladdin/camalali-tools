"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented } from "./tabs";
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
  buildAclLines,
  convertMaskInput,
  DEFAULT_TEXT_FOR_KIND,
  MASK_KIND_LABELS,
  MASK_KIND_ORDER,
  parseDottedQuadText,
  parseNonNegativeIntText,
  type MaskKind,
} from "../lib/wildcard-maska";

const KIND_OPTIONS = MASK_KIND_ORDER.map((kind) => ({ value: kind, label: MASK_KIND_LABELS[kind] }));

/* The non-contiguous wildcard is the tool's one genuinely new idea, so it gets
   its own one-click demo rather than waiting to be discovered by accident. */
const NON_CONTIGUOUS_EXAMPLE: { kind: MaskKind; text: string } = {
  kind: "wildcard-mask",
  text: "0.0.0.254",
};

function AclLineRow({
  label,
  value,
  unavailableNote,
}: {
  label: string;
  value: string | null;
  unavailableNote?: string;
}) {
  return (
    <div>
      <ToolLabel>{label}</ToolLabel>
      {value === null ? (
        <p className="mt-1 text-ios-subhead text-muted">{unavailableNote}</p>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <ToolOutput className="flex-1">{value}</ToolOutput>
          <CopyButton value={value} label="kopyala" />
        </div>
      )}
    </div>
  );
}

export function WildcardMaskaTool() {
  const [kind, setKind] = useState<MaskKind>("subnet-mask");
  const [text, setText] = useState(DEFAULT_TEXT_FOR_KIND["subnet-mask"]);
  const [networkText, setNetworkText] = useState("10.1.1.0");
  const [aclNumberText, setAclNumberText] = useState("10");
  const [areaText, setAreaText] = useState("0");

  const changeKind = (nextKind: MaskKind) => {
    setKind(nextKind);
    setText(DEFAULT_TEXT_FOR_KIND[nextKind]);
  };

  const showNonContiguousExample = () => {
    setKind(NON_CONTIGUOUS_EXAMPLE.kind);
    setText(NON_CONTIGUOUS_EXAMPLE.text);
  };

  const networkValue = useMemo(() => {
    const parsed = parseDottedQuadText(networkText);
    return parsed.ok ? parsed.value : 0;
  }, [networkText]);

  const result = useMemo(
    () => convertMaskInput(kind, text, networkValue),
    [kind, text, networkValue],
  );

  const acl = useMemo(() => {
    if (!result.ok) return null;
    const prefix = result.contiguous ? result.forms.prefix : null;
    const wildcardText = result.contiguous ? result.forms.wildcardMask : result.wildcardMask;
    const aclNumber = parseNonNegativeIntText(aclNumberText, 10);
    const area = parseNonNegativeIntText(areaText, 0);
    return buildAclLines(networkText, wildcardText, prefix, aclNumber, area);
  }, [result, networkText, aclNumberText, areaText]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Maska"
          action={
            <>
              <ToolSegmented
                label="Maska forması"
                options={KIND_OPTIONS}
                value={kind}
                onChange={changeKind}
              />
              <ToolButton size="chip" onClick={showNonContiguousExample}>
                Nümunə: qeyri-ardıcıl wildcard
              </ToolButton>
            </>
          }
        />
        <div className="p-4">
          <ToolField label={MASK_KIND_LABELS[kind]} htmlFor="wildcard-maska-value">
            <ToolInput
              id="wildcard-maska-value"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="font-mono"
              spellCheck={false}
              placeholder={DEFAULT_TEXT_FOR_KIND[kind]}
            />
          </ToolField>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Router sətirləri üçün" hint="ACL və OSPF nümunəsi bunlardan qurulur" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <ToolField label="Şəbəkə ünvanı" htmlFor="wildcard-maska-network">
            <ToolInput
              id="wildcard-maska-network"
              value={networkText}
              onChange={(event) => setNetworkText(event.target.value)}
              className="font-mono"
              spellCheck={false}
            />
          </ToolField>
          <ToolField label="ACL nömrəsi" htmlFor="wildcard-maska-acl-number">
            <ToolInput
              id="wildcard-maska-acl-number"
              value={aclNumberText}
              onChange={(event) => setAclNumberText(event.target.value)}
              inputMode="numeric"
              className="font-mono"
            />
          </ToolField>
          <ToolField label="OSPF area" htmlFor="wildcard-maska-area">
            <ToolInput
              id="wildcard-maska-area"
              value={areaText}
              onChange={(event) => setAreaText(event.target.value)}
              inputMode="numeric"
              className="font-mono"
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!result.ok && <ToolNote tone="accent">{result.error}</ToolNote>}

      {result.ok && result.contiguous && (
        <ToolResultPanel title="Bərabər formalar" hint={`/${result.forms.prefix}`}>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            <ToolStat label="Prefiks" value={`/${result.forms.prefix}`} />
            <ToolStat label="Subnet maska" value={result.forms.subnetMask} />
            <ToolStat label="Wildcard maska" value={result.forms.wildcardMask} />
            <ToolStat label="Hex maska" value={result.forms.hexMask} />
            <ToolStat label="Binary" value={result.forms.binaryMask} />
            <ToolStat label="Ünvan sayı" value={String(result.forms.totalHosts)} />
            <ToolStat label="İstifadə edilə bilən host" value={String(result.forms.usableHosts)} />
          </div>
        </ToolResultPanel>
      )}

      {result.ok && !result.contiguous && (
        <ToolResultPanel title="Qeyri-ardıcıl wildcard" hint={`${result.matchedCount} ünvan`}>
          <div className="space-y-3 p-4">
            <ToolNote tone="accent" title="Bu wildcard-ın subnet maska qarşılığı yoxdur">
              {`«${result.wildcardMask}» bit-bit naxışdır, soldan-sağa ardıcıl 1-0 formasında deyil: ona görə heç bir /prefiks onu ifadə edə bilmir. Cisco ACL və OSPF sətirlərində istifadəyə tam yararlıdır, sadəcə CIDR və iptables kimi prefiks tələb edən formatlara çevrilə bilmir.`}
            </ToolNote>
            <ToolStat label="Uyğun gələn ünvan sayı" value={String(result.matchedCount)} tone="accent" />
            <div>
              <ToolLabel>{`İlk ${result.sampleAddresses.length} ünvan`}</ToolLabel>
              <ToolOutput className="mt-1.5">{result.sampleAddresses.join("\n")}</ToolOutput>
            </div>
          </div>
        </ToolResultPanel>
      )}

      {acl &&
        (acl.ok ? (
          <ToolResultPanel title="Router sətirləri" hint="kopyala və yapışdır">
            <div className="space-y-3 p-4">
              <AclLineRow label="Cisco IOS ACL" value={acl.lines.ciscoAcl} />
              <AclLineRow label="Cisco OSPF" value={acl.lines.ciscoOspf} />
              <AclLineRow
                label="CIDR"
                value={acl.lines.cidr}
                unavailableNote="Bu wildcard-ın prefiks ekvivalenti yoxdur: CIDR onu ifadə edə bilmir."
              />
              <AclLineRow
                label="iptables"
                value={acl.lines.iptables}
                unavailableNote="Bu wildcard-ın prefiks ekvivalenti yoxdur: iptables onu ifadə edə bilmir."
              />
            </div>
          </ToolResultPanel>
        ) : (
          <ToolNote tone="accent">{acl.error}</ToolNote>
        ))}
    </div>
  );
}
