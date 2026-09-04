"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { withInlineCode } from "./inline-code";
import { ToolSegmented } from "./tabs";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import {
  buildDmarc,
  buildDmarcFindings,
  explainDmarcTags,
  parseDmarcRecord,
  type DmarcAlignment,
  type DmarcBuildFields,
  type DmarcFinding,
  type DmarcPolicyValue,
} from "../lib/dmarc-oxucu";

type Mode = "oxu" | "qur";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "oxu", label: "Oxu" },
  { value: "qur", label: "Qur" },
];

const POLICY_OPTIONS: { value: DmarcPolicyValue; label: string }[] = [
  { value: "none", label: "none" },
  { value: "quarantine", label: "quarantine" },
  { value: "reject", label: "reject" },
];

type SpMode = "inherit" | DmarcPolicyValue;

const SP_OPTIONS: { value: SpMode; label: string }[] = [
  { value: "inherit", label: "p-dən miras" },
  ...POLICY_OPTIONS,
];

const ALIGNMENT_OPTIONS: { value: DmarcAlignment; label: string }[] = [
  { value: "r", label: "r: yumşaq" },
  { value: "s", label: "s: sərt" },
];

/*
 * A worked example, not a blank box: `pct=50` triggers the sample finding, a
 * `rua` address at `partner.com` (the domain field below is `sirket.az`)
 * triggers the cross-domain one, and `adkim=s` triggers the strict-alignment
 * one — three of the eight findings fire without the visitor typing anything.
 */
const SAMPLE_DOMAIN = "sirket.az";
const SAMPLE_RECORD =
  "v=DMARC1; p=quarantine; pct=50; rua=mailto:dmarc@sirket.az,mailto:audit@partner.com; adkim=s";

function splitAddresses(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((address) => address.trim())
    .filter((address) => address !== "");
}

function severityTone(severity: DmarcFinding["severity"]): "info" | "accent" {
  return severity === "info" ? "info" : "accent";
}

function severityTitle(severity: DmarcFinding["severity"]): string {
  return { critical: "Kritik", warning: "Diqqət", info: "Məlumat" }[severity];
}

function FindingList({ findings }: { findings: DmarcFinding[] }) {
  if (findings.length === 0) {
    return <ToolNote tone="info">Tapılan problem yoxdur.</ToolNote>;
  }
  return (
    <div className="space-y-3">
      {findings.map((finding) => (
        <ToolNote key={finding.id} tone={severityTone(finding.severity)} title={severityTitle(finding.severity)}>
          {withInlineCode(finding.text)}
        </ToolNote>
      ))}
    </div>
  );
}

function TagAccordion({ tags }: { tags: ReturnType<typeof explainDmarcTags> }) {
  return (
    <ToolAccordion>
      {tags.map((tag) => (
        <ToolAccordionItem
          key={tag.tag}
          summary={withInlineCode(tag.label)}
          hint={tag.explicit ? "yazılıb" : "defolt"}
          defaultOpen={!tag.explicit}
        >
          <p>{withInlineCode(tag.meaning)}</p>
          <p className="mt-2 text-ink">{withInlineCode(tag.hereText)}</p>
          {tag.defaultText !== null && (
            <p className="mt-2 text-ios-footnote">{withInlineCode(tag.defaultText)}</p>
          )}
        </ToolAccordionItem>
      ))}
    </ToolAccordion>
  );
}

export function DmarcOxucuTool() {
  const [mode, setMode] = useState<Mode>("oxu");

  /* ---------- read ---------- */
  const [readDomain, setReadDomain] = useState("");
  const [readRecord, setReadRecord] = useState("");

  const readParsed = useMemo(
    () => (readRecord.trim() === "" ? null : parseDmarcRecord(readRecord)),
    [readRecord],
  );
  const readTags = useMemo(
    () => (readParsed?.ok ? explainDmarcTags(readParsed.record) : []),
    [readParsed],
  );
  const readFindings = useMemo(
    () => (readParsed?.ok ? buildDmarcFindings(readParsed.record, readDomain.trim() || undefined) : []),
    [readParsed, readDomain],
  );

  const fillReadSample = () => {
    setReadDomain(SAMPLE_DOMAIN);
    setReadRecord(SAMPLE_RECORD);
  };

  /* ---------- build ---------- */
  const [buildDomain, setBuildDomain] = useState(SAMPLE_DOMAIN);
  const [buildP, setBuildP] = useState<DmarcPolicyValue>("none");
  const [buildSp, setBuildSp] = useState<SpMode>("inherit");
  const [buildPctText, setBuildPctText] = useState("100");
  const [buildRuaText, setBuildRuaText] = useState("dmarc@sirket.az");
  const [buildRufText, setBuildRufText] = useState("");
  const [buildAdkim, setBuildAdkim] = useState<DmarcAlignment>("r");
  const [buildAspf, setBuildAspf] = useState<DmarcAlignment>("r");
  const [buildFo, setBuildFo] = useState("0");
  const [buildRiText, setBuildRiText] = useState("86400");

  const fillBuildSample = () => {
    setBuildDomain(SAMPLE_DOMAIN);
    setBuildP("quarantine");
    setBuildSp("reject");
    setBuildPctText("50");
    setBuildRuaText("dmarc@sirket.az, audit@partner.com");
    setBuildRufText("forensics@sirket.az");
    setBuildAdkim("s");
    setBuildAspf("r");
    setBuildFo("1");
    setBuildRiText("43200");
  };

  const buildFields: DmarcBuildFields = useMemo(
    () => ({
      domain: buildDomain,
      p: buildP,
      sp: buildSp === "inherit" ? null : buildSp,
      pct: Number(buildPctText),
      ruaAddresses: splitAddresses(buildRuaText),
      rufAddresses: splitAddresses(buildRufText),
      adkim: buildAdkim,
      aspf: buildAspf,
      fo: buildFo,
      ri: Number(buildRiText),
    }),
    [buildDomain, buildP, buildSp, buildPctText, buildRuaText, buildRufText, buildAdkim, buildAspf, buildFo, buildRiText],
  );

  const buildResult = useMemo(() => buildDmarc(buildFields), [buildFields]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="DMARC"
          action={<ToolSegmented options={MODE_OPTIONS} value={mode} onChange={setMode} />}
        />

        {mode === "oxu" ? (
          <div className="space-y-4 p-4">
            <div className="flex items-end gap-3">
              <ToolField label="Domen (könüllü)" htmlFor="dmarc-domain" hint="cross-domain yoxlaması üçün" className="flex-1">
                <ToolInput
                  id="dmarc-domain"
                  value={readDomain}
                  onChange={(event) => setReadDomain(event.target.value)}
                  placeholder="sirket.az"
                />
              </ToolField>
              <ToolButton size="chip" onClick={fillReadSample}>
                Nümunə
              </ToolButton>
            </div>

            <ToolField label="DMARC qeydi" htmlFor="dmarc-record" note="_dmarc.<domen> altında saxlanan TXT dəyəri">
              <ToolTextArea
                id="dmarc-record"
                value={readRecord}
                onChange={(event) => setReadRecord(event.target.value)}
                rows={4}
                className="font-mono"
                spellCheck={false}
                placeholder="v=DMARC1; p=reject; rua=mailto:dmarc@sayt.com"
              />
            </ToolField>

            {readParsed === null && (
              <ToolNote tone="info">Yoxlamaq üçün DMARC qeydini yapışdır.</ToolNote>
            )}

            {readParsed !== null && !readParsed.ok && (
              <ToolNote tone="accent" title="Qeyd etibarsızdır">
                {withInlineCode(readParsed.error)}
              </ToolNote>
            )}

            {readParsed !== null && readParsed.ok && (
              <div className="space-y-4">
                <FindingList findings={readFindings} />
                <ToolResultPanel title="Teqlər" hint="11 teq (yazılan və defolt)">
                  <div className="p-3">
                    <TagAccordion tags={readTags} />
                  </div>
                </ToolResultPanel>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex justify-end">
              <ToolButton size="chip" onClick={fillBuildSample}>
                Nümunə
              </ToolButton>
            </div>

            <ToolNote tone="info" title="Yayım pilləsi">
              Tövsiyə olunan yol: əvvəlcə <code className="font-mono text-[0.94em]">p=none</code> və{" "}
              <code className="font-mono text-[0.94em]">rua</code> ilə başla, hesabatları oxu; sonra{" "}
              <code className="font-mono text-[0.94em]">p=quarantine</code>-ə keç və{" "}
              <code className="font-mono text-[0.94em]">pct</code>-i tədricən artır; ən sonda{" "}
              <code className="font-mono text-[0.94em]">p=reject</code>. Birbaşa <code className="font-mono text-[0.94em]">reject</code>-ə
              keçmək öz hesab-fakturalarının sənə çatmasını dayandıra bilər.
            </ToolNote>

            <div className="grid gap-4 md:grid-cols-2">
              <ToolField label="Domen" htmlFor="dmarc-build-domain">
                <ToolInput
                  id="dmarc-build-domain"
                  value={buildDomain}
                  onChange={(event) => setBuildDomain(event.target.value)}
                  placeholder="sayt.com"
                />
              </ToolField>

              <ToolField label="pct" htmlFor="dmarc-build-pct" suffix="%">
                <ToolInput
                  id="dmarc-build-pct"
                  type="number"
                  min={0}
                  max={100}
                  value={buildPctText}
                  onChange={(event) => setBuildPctText(event.target.value)}
                />
              </ToolField>

              <ToolField label="p: siyasət">
                <ToolSegmented options={POLICY_OPTIONS} value={buildP} onChange={setBuildP} fill />
              </ToolField>

              <ToolField label="sp: subdomen siyasəti">
                <ToolSegmented options={SP_OPTIONS} value={buildSp} onChange={setBuildSp} fill />
              </ToolField>

              <ToolField label="adkim: DKIM uyğunlaşma">
                <ToolSegmented options={ALIGNMENT_OPTIONS} value={buildAdkim} onChange={setBuildAdkim} fill />
              </ToolField>

              <ToolField label="aspf: SPF uyğunlaşma">
                <ToolSegmented options={ALIGNMENT_OPTIONS} value={buildAspf} onChange={setBuildAspf} fill />
              </ToolField>

              <ToolField label="fo: uğursuzluq hesabat seçimi" htmlFor="dmarc-build-fo" hint="0, 1, d, s">
                <ToolInput
                  id="dmarc-build-fo"
                  value={buildFo}
                  onChange={(event) => setBuildFo(event.target.value)}
                  placeholder="0"
                />
              </ToolField>

              <ToolField label="ri: hesabat intervalı" htmlFor="dmarc-build-ri" suffix="saniyə">
                <ToolInput
                  id="dmarc-build-ri"
                  type="number"
                  min={0}
                  value={buildRiText}
                  onChange={(event) => setBuildRiText(event.target.value)}
                />
              </ToolField>

              <div className="md:col-span-2">
                <ToolField
                  label="rua: məcmu hesabat ünvanları"
                  htmlFor="dmarc-build-rua"
                  note="vergül və ya yeni sətir ilə ayır, mailto: özü əlavə olunur"
                >
                  <ToolTextArea
                    id="dmarc-build-rua"
                    value={buildRuaText}
                    onChange={(event) => setBuildRuaText(event.target.value)}
                    rows={2}
                    className="font-mono"
                    spellCheck={false}
                    placeholder="dmarc@sayt.com"
                  />
                </ToolField>
              </div>

              <div className="md:col-span-2">
                <ToolField
                  label="ruf: uğursuzluq hesabat ünvanları"
                  htmlFor="dmarc-build-ruf"
                  note="könüllü: boş buraxsan ruf teqi yazılmır"
                >
                  <ToolTextArea
                    id="dmarc-build-ruf"
                    value={buildRufText}
                    onChange={(event) => setBuildRufText(event.target.value)}
                    rows={2}
                    className="font-mono"
                    spellCheck={false}
                    placeholder="forensics@sayt.com"
                  />
                </ToolField>
              </div>
            </div>

            {!buildResult.ok && (
              <ToolNote tone="accent" title="Qura bilmədim">
                {withInlineCode(buildResult.error)}
              </ToolNote>
            )}

            {buildResult.ok && (
              <div className="space-y-4">
                <ToolResultPanel
                  title="DMARC qeydi"
                  action={<CopyButton value={buildResult.record} label="qeydi kopyala" />}
                >
                  <ToolOutput className="m-3">{buildResult.record}</ToolOutput>
                </ToolResultPanel>

                <ToolResultPanel
                  title="DNS sətri"
                  hint="_dmarc altında, apex-də yox"
                  action={<CopyButton value={buildResult.dnsRecordLine} label="DNS sətrini kopyala" />}
                >
                  <ToolOutput className="m-3">{buildResult.dnsRecordLine}</ToolOutput>
                </ToolResultPanel>

                <FindingList findings={buildResult.findings} />

                <ToolResultPanel title="Teqlər" hint="11 teq (yazılan və defolt)">
                  <div className="p-3">
                    <TagAccordion tags={buildResult.tags} />
                  </div>
                </ToolResultPanel>
              </div>
            )}
          </div>
        )}
      </ToolPanel>
    </div>
  );
}
