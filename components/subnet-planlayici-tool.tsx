"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { ToolSegmented } from "./tabs";
import { formatNumber } from "../shared/format";
import {
  parseRequirements,
  planToText,
  planVlsm,
  splitByCount,
  splitByPrefix,
  type EqualSplitResult,
  type PlanResult,
} from "../lib/subnet-planlayici";

/*
 * The default example carries the point-to-point edge case on purpose:
 * "link 2" is small enough that a naive implementation reaches for a /30 (4
 * addresses, 2 wasted) instead of the /31 RFC 3021 actually allows. Seeing it
 * land as /31 on first load is the fastest way to trust the rest of the plan.
 */
const SAMPLE_NETWORK = "10.0.0.0/22";
const SAMPLE_REQUIREMENTS = `ofis 500
wifi 200
server 30
link 2`;

type Mode = "vlsm" | "equal";
type EqualTarget = "count" | "prefix";

export function SubnetPlanlayiciTool() {
  const [networkText, setNetworkText] = useState(SAMPLE_NETWORK);
  const [requirementsText, setRequirementsText] = useState(SAMPLE_REQUIREMENTS);
  const [mode, setMode] = useState<Mode>("vlsm");
  const [equalTarget, setEqualTarget] = useState<EqualTarget>("count");
  const [equalCount, setEqualCount] = useState("4");
  const [equalPrefix, setEqualPrefix] = useState("26");

  const requirementsParse = useMemo(() => parseRequirements(requirementsText), [requirementsText]);
  const canPlan = requirementsParse.issues.length === 0 && requirementsParse.requirements.length > 0;

  const planResult: PlanResult | null = useMemo(() => {
    if (mode !== "vlsm" || !canPlan) return null;
    const segments = requirementsParse.requirements.map((r) => ({ name: r.name, hosts: r.hosts }));
    return planVlsm(networkText, segments);
  }, [mode, canPlan, requirementsParse, networkText]);

  const equalResult: EqualSplitResult | null = useMemo(() => {
    if (mode !== "equal") return null;
    if (equalTarget === "count") {
      const parsed = Number(equalCount.trim());
      if (!Number.isFinite(parsed)) {
        return { ok: false, error: `Say düzgün deyil: «${equalCount}».` };
      }
      return splitByCount(networkText, parsed);
    }
    const parsed = Number(equalPrefix.trim());
    if (!Number.isFinite(parsed)) {
      return { ok: false, error: `Prefiks düzgün deyil: «${equalPrefix}».` };
    }
    return splitByPrefix(networkText, parsed);
  }, [mode, equalTarget, equalCount, equalPrefix, networkText]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Şəbəkə" hint="CIDR formatında" />
        <div className="p-4">
          <ToolField label="IPv4 şəbəkə" htmlFor="planlayici-network" note="Məsələn: 10.0.0.0/16 və ya 192.168.1.0/24.">
            <ToolInput
              id="planlayici-network"
              value={networkText}
              onChange={(event) => setNetworkText(event.target.value)}
              className="font-mono"
              spellCheck={false}
              placeholder="10.0.0.0/16"
            />
          </ToolField>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Rejim"
          action={
            <ToolSegmented
              label="Rejim"
              value={mode}
              onChange={setMode}
              options={[
                { value: "vlsm", label: "Seqmentlərə görə (VLSM)" },
                { value: "equal", label: "Bərabər bölgü" },
              ]}
            />
          }
        />
      </ToolPanel>

      {mode === "vlsm" ? (
        <>
          <ToolPanel>
            <ToolPanelHeader
              title="Seqmentlər"
              hint="hər sətirdə: ad say"
              action={
                <ToolButton size="chip" onClick={() => setRequirementsText(SAMPLE_REQUIREMENTS)}>
                  Nümunə
                </ToolButton>
              }
            />
            <div className="p-4">
              <ToolField label="Seqment siyahısı" htmlFor="planlayici-requirements">
                <ToolTextArea
                  id="planlayici-requirements"
                  value={requirementsText}
                  onChange={(event) => setRequirementsText(event.target.value)}
                  rows={6}
                  className="font-mono"
                  spellCheck={false}
                  placeholder={"ofis 500\nwifi 200\nserver 30\nlink 2"}
                />
              </ToolField>
            </div>
          </ToolPanel>

          {(requirementsParse.requirements.length > 0 || requirementsParse.issues.length > 0) && (
            <ToolPanel>
              <ToolPanelHeader
                title="Anlaşılan seqmentlər"
                hint={`${requirementsParse.requirements.length} tanındı${requirementsParse.issues.length > 0 ? `, ${requirementsParse.issues.length} sətirdə xəta` : ""}`}
              />
              <div className="space-y-3 p-4">
                {requirementsParse.requirements.length > 0 && (
                  <ul className="space-y-1 font-ui text-ios-subhead">
                    {requirementsParse.requirements.map((r) => (
                      <li key={r.line} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate">{r.name}</span>
                        <span className="shrink-0 tabular-nums text-muted">{formatNumber(r.hosts)} host</span>
                      </li>
                    ))}
                  </ul>
                )}
                {requirementsParse.issues.map((issue, index) => (
                  <p key={index} className="text-ios-footnote text-muted">
                    {issue.line > 0 ? `Sətir ${issue.line}: ` : ""}
                    {issue.error}
                  </p>
                ))}
              </div>
            </ToolPanel>
          )}

          {planResult && planResult.ok && (
            <ToolResultPanel
              title="Ayırma planı"
              hint={`${planResult.rows.length} blok`}
              action={<CopyButton value={planToText(planResult)} label="planı kopyala" />}
            >
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
                <ToolStat label="Şəbəkə" value={planResult.network} tone="accent" />
                <ToolStat label="Tutum" value={`${formatNumber(planResult.totalAddresses)} ünvan`} />
                <ToolStat label="İstifadə" value={`${formatNumber(planResult.utilisationPercent, 1)}%`} />
                <ToolStat label="Boş qalan" value={`${formatNumber(planResult.freeAddresses)} ünvan`} />
              </div>
              <div className="overflow-x-auto border-t border-result-rule p-4 pt-3">
                <table className="w-full border-collapse font-ui text-xs">
                  <thead>
                    <tr className="border-b border-result-rule text-left text-muted">
                      <th scope="col" className="p-2 font-normal">
                        Ad
                      </th>
                      <th scope="col" className="p-2 font-normal">
                        CIDR
                      </th>
                      <th scope="col" className="p-2 font-normal">
                        Host aralığı
                      </th>
                      <th scope="col" className="p-2 font-normal">
                        Broadcast
                      </th>
                      <th scope="col" className="p-2 text-right font-normal">
                        İstifadə oluna bilən
                      </th>
                      <th scope="col" className="p-2 text-right font-normal">
                        İstənilən
                      </th>
                      <th scope="col" className="p-2 text-right font-normal">
                        İtki
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {planResult.rows.map((row) => (
                      <tr key={row.name} className="border-b border-result-rule align-top last:border-0">
                        <td className="max-w-32 p-2 break-words">{row.name}</td>
                        <td className="p-2 font-mono whitespace-nowrap">{row.cidr}</td>
                        <td className="p-2 font-mono whitespace-nowrap">
                          {row.firstHost === null ? "yoxdur" : `${row.firstHost} – ${row.lastHost}`}
                        </td>
                        <td className="p-2 font-mono whitespace-nowrap">{row.broadcast ?? "yoxdur"}</td>
                        <td className="p-2 text-right tabular-nums">{formatNumber(row.usableHosts)}</td>
                        <td className="p-2 text-right tabular-nums">{formatNumber(row.requestedHosts)}</td>
                        <td className="p-2 text-right tabular-nums">{formatNumber(row.wasted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-result-rule p-4 pt-3">
                <ToolLabel>Qalan boş bloklar</ToolLabel>
                <p className="mt-1 font-mono text-sm">
                  {planResult.freeBlocks.length === 0
                    ? "yoxdur: şəbəkə tam dolub"
                    : planResult.freeBlocks.map((block) => block.cidr).join(", ")}
                </p>
              </div>
            </ToolResultPanel>
          )}

          {planResult && !planResult.ok && <ToolNote tone="accent" title="Sığmadı">{planResult.error}</ToolNote>}
        </>
      ) : (
        <>
          <ToolPanel>
            <ToolPanelHeader
              title="Bölgü"
              action={
                <ToolSegmented
                  label="Bölgü növü"
                  value={equalTarget}
                  onChange={setEqualTarget}
                  options={[
                    { value: "count", label: "N hissəyə" },
                    { value: "prefix", label: "/n ölçüsünə" },
                  ]}
                />
              }
            />
            <div className="p-4">
              {equalTarget === "count" ? (
                <ToolField label="Alt şəbəkə sayı" htmlFor="planlayici-equal-count">
                  <ToolInput
                    id="planlayici-equal-count"
                    inputMode="numeric"
                    value={equalCount}
                    onChange={(event) => setEqualCount(event.target.value)}
                  />
                </ToolField>
              ) : (
                <ToolField label="Yeni prefiks" htmlFor="planlayici-equal-prefix" suffix="/n">
                  <ToolInput
                    id="planlayici-equal-prefix"
                    inputMode="numeric"
                    value={equalPrefix}
                    onChange={(event) => setEqualPrefix(event.target.value)}
                  />
                </ToolField>
              )}
            </div>
          </ToolPanel>

          {equalResult && equalResult.ok && (
            <ToolResultPanel
              title="Bərabər bölgü"
              hint={`${equalResult.actualCount} alt şəbəkə, hər biri /${equalResult.newPrefix}`}
            >
              {equalResult.actualCount !== equalResult.requestedCount && (
                <div className="p-4 pb-0">
                  <ToolNote tone="info">
                    {`${equalResult.requestedCount} deyil, ${equalResult.actualCount} bərabər hissəyə bölündü: CIDR yalnız 2-nin qüvvətlərini dəstəkləyir.`}
                  </ToolNote>
                </div>
              )}
              <div className="overflow-x-auto p-4">
                <table className="w-full border-collapse font-ui text-xs">
                  <thead>
                    <tr className="border-b border-result-rule text-left text-muted">
                      <th scope="col" className="p-2 font-normal">
                        CIDR
                      </th>
                      <th scope="col" className="p-2 font-normal">
                        Host aralığı
                      </th>
                      <th scope="col" className="p-2 font-normal">
                        Broadcast
                      </th>
                      <th scope="col" className="p-2 text-right font-normal">
                        İstifadə oluna bilən
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {equalResult.parts.map((part) => (
                      <tr key={part.cidr} className="border-b border-result-rule align-top last:border-0">
                        <td className="p-2 font-mono whitespace-nowrap">{part.cidr}</td>
                        <td className="p-2 font-mono whitespace-nowrap">
                          {part.firstHost === null ? "yoxdur" : `${part.firstHost} – ${part.lastHost}`}
                        </td>
                        <td className="p-2 font-mono whitespace-nowrap">{part.broadcast ?? "yoxdur"}</td>
                        <td className="p-2 text-right tabular-nums">{formatNumber(part.usableHosts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ToolResultPanel>
          )}

          {equalResult && !equalResult.ok && <ToolNote tone="accent" title="Olmadı">{equalResult.error}</ToolNote>}
        </>
      )}

      <ToolNote tone="info" title="İki kənar qayda">
        «/31» iki ünvanlıq blokdur və hər ikisi host sayılır (RFC 3021-ə görə nöqtə-nöqtə kanalın iki ucu). «/32»
        tək ünvandır, tək bir hostu bildirir. Hər ikisi «0 host» deyil: alət onları elə hesablayır.
      </ToolNote>
    </div>
  );
}
