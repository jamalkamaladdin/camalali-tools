"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolTabs } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolTextArea,
} from "./ui";
import {
  buildZoneFile,
  countByType,
  formatRdata,
  parseZoneFile,
  ZONE_RECORD_TYPES,
  type ZoneIssue,
  type ZoneRecord,
  type ZoneRecordType,
} from "../lib/zone-fayl";

/* One of every supported type, with a paren-wrapped SOA so the round trip a
   visitor sees on first load already demonstrates the multi-line join. */
const SAMPLE_ZONE = `$ORIGIN example.com.
$TTL 3600
@       IN SOA  ns1.example.com. hostmaster.example.com. (
                2026090401 ; serial
                3600       ; refresh
                900        ; retry
                1209600    ; expire
                300 )      ; minimum
@       IN NS   ns1.example.com.
@       IN A    93.184.216.34
@       IN AAAA 2606:2800:220:1::248
www     IN CNAME @
mail    600 IN A 93.184.216.35
        IN MX 10 mail.example.com.
@       IN TXT  "v=spf1 include:_spf.example.com ~all"
_sip._tcp IN SRV 10 5 5060 sip.example.com.
@       IN CAA  0 issue "letsencrypt.org"
`;

const SEVERITY_WORDS: Record<ZoneIssue["severity"], string> = {
  xeta: "xəta",
  xeberdarliq: "xəbərdarlıq",
  melumat: "məlumat",
};

export function ZoneFaylTool() {
  return (
    <div className="mt-8">
      <ToolTabs
        idPrefix="zone-fayl"
        items={[
          { id: "parcala", label: "Parçala", content: <ParseTab /> },
          { id: "qur", label: "Qur", content: <BuildTab /> },
        ]}
      />
    </div>
  );
}

function ParseTab() {
  const [text, setText] = useState(SAMPLE_ZONE);
  const result = useMemo(() => parseZoneFile(text), [text]);
  const counts = useMemo(() => countByType(result.records), [result.records]);

  return (
    <div className="space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Zona faylı"
          hint={`${text.split("\n").length} sətir`}
          action={
            <ToolButton size="chip" onClick={() => setText(SAMPLE_ZONE)}>
              Nümunə
            </ToolButton>
          }
        />
        <div className="p-4">
          <ToolField label="BIND formatlı mətn" htmlFor="zone-fayl-parse">
            <ToolTextArea
              id="zone-fayl-parse"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={14}
              spellCheck={false}
            />
          </ToolField>
        </div>
      </ToolPanel>

      {result.origin || result.ttl !== null ? (
        <p className="font-ui text-xs text-muted">
          {result.origin && (
            <>
              $ORIGIN <span className="font-mono">{result.origin}</span>
            </>
          )}
          {result.origin && result.ttl !== null && " · "}
          {result.ttl !== null && (
            <>
              $TTL <span className="font-mono tabular-nums">{result.ttl}</span>
            </>
          )}
        </p>
      ) : null}

      {result.issues.length > 0 && (
        <ToolResultPanel title="Problemlər" hint={`${result.issues.length} bənd`}>
          <div className="space-y-2 p-3">
            {result.issues.map((issue, index) => (
              <div key={index} className={`border-l-2 pl-3 ${issue.severity === "xeta" ? "border-l-accent" : "border-l-rule"}`}>
                <p className="font-ui text-[11px] text-muted">
                  {SEVERITY_WORDS[issue.severity]}
                  {issue.line !== null && ` · ${issue.line}. sətir`}
                </p>
                <p className="mt-0.5 text-sm/6">{issue.message}</p>
              </div>
            ))}
          </div>
        </ToolResultPanel>
      )}

      <ToolResultPanel
        title="Qeydlər"
        hint={`${result.records.length} ədəd — ${ZONE_RECORD_TYPES.filter((type) => counts[type]).map((type) => `${type} ${counts[type]}`).join(", ") || "yoxdur"}`}
      >
        {result.records.length === 0 ? (
          <p className="p-3 text-sm/6 text-muted">Cədvələ düşəcək düzgün qeyd tapılmadı.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-ui text-xs">
              <thead>
                <tr className="border-b border-result-rule text-left text-muted">
                  <th scope="col" className="p-2 font-normal">Ad</th>
                  <th scope="col" className="p-2 font-normal">TTL</th>
                  <th scope="col" className="p-2 font-normal">Tip</th>
                  <th scope="col" className="p-2 font-normal">Dəyər</th>
                </tr>
              </thead>
              <tbody>
                {result.records.map((record, index) => (
                  <tr key={index} className="border-b border-result-rule align-top last:border-0">
                    <td className="p-2 font-mono break-all">{record.name}</td>
                    <td className="p-2 font-mono tabular-nums text-muted">{record.ttl ?? "—"}</td>
                    <td className="p-2 font-mono">{record.type}</td>
                    <td className="p-2 font-mono break-all">{formatRdata(record)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ToolResultPanel>
    </div>
  );
}

/* Text state per field rather than a mutated ZoneRecord: a discriminated union
   is awkward to edit in place from a form, and the draft is invalid input
   until "Əlavə et" is pressed anyway — the strings are what a form actually
   holds. */
function BuildTab() {
  const [origin, setOrigin] = useState("example.com.");
  const [ttl, setTtl] = useState("3600");
  const [records, setRecords] = useState<ZoneRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<ZoneRecordType>("A");
  const [name, setName] = useState("@");
  const [rowTtl, setRowTtl] = useState("");
  const [address, setAddress] = useState("93.184.216.34");
  const [target, setTarget] = useState("");
  const [priorityText, setPriorityText] = useState("10");
  const [weightText, setWeightText] = useState("5");
  const [portText, setPortText] = useState("443");
  const [value, setValue] = useState("");
  const [flagText, setFlagText] = useState("0");
  const [tag, setTag] = useState("issue");
  const [mname, setMname] = useState("");
  const [rname, setRname] = useState("");
  const [serialText, setSerialText] = useState("1");
  const [refreshText, setRefreshText] = useState("3600");
  const [retryText, setRetryText] = useState("900");
  const [expireText, setExpireText] = useState("1209600");
  const [minimumText, setMinimumText] = useState("300");

  const output = useMemo(
    () => buildZoneFile(records, { origin: origin.trim() || null, ttl: ttl.trim() === "" ? null : Number(ttl) }),
    [records, origin, ttl],
  );

  function addRecord() {
    const ttlValue = rowTtl.trim() === "" ? null : Number(rowTtl);
    if (rowTtl.trim() !== "" && !Number.isInteger(ttlValue)) {
      setError("TTL boş və ya tam ədəd olmalıdır.");
      return;
    }
    const common = { name: name.trim() || "@", ttl: ttlValue };

    let record: ZoneRecord;
    switch (type) {
      case "A":
      case "AAAA":
        if (address.trim() === "") return setError("Ünvan sahəsi boşdur.");
        record = { ...common, type, address: address.trim() };
        break;
      case "CNAME":
      case "NS":
        if (target.trim() === "") return setError("Hədəf sahəsi boşdur.");
        record = { ...common, type, target: target.trim() };
        break;
      case "MX": {
        const priority = Number(priorityText);
        if (!Number.isInteger(priority) || target.trim() === "") return setError("MX prioriteti tam ədəd, hədəf boş olmamalıdır.");
        record = { ...common, type, priority, target: target.trim() };
        break;
      }
      case "TXT":
        if (value.trim() === "") return setError("TXT mətni boşdur.");
        record = { ...common, type, value };
        break;
      case "SRV": {
        const priority = Number(priorityText);
        const weight = Number(weightText);
        const port = Number(portText);
        if (![priority, weight, port].every(Number.isInteger) || target.trim() === "") {
          return setError("SRV prioritet/çəki/port sahələri tam ədəd, hədəf boş olmamalıdır.");
        }
        record = { ...common, type, priority, weight, port, target: target.trim() };
        break;
      }
      case "CAA": {
        const flag = Number(flagText);
        if (!Number.isInteger(flag) || tag.trim() === "" || value.trim() === "") {
          return setError("CAA bayrağı tam ədəd, tağ və dəyər boş olmamalıdır.");
        }
        record = { ...common, type, flag, tag: tag.trim(), value: value.trim() };
        break;
      }
      case "SOA": {
        const serial = Number(serialText);
        const refresh = Number(refreshText);
        const retry = Number(retryText);
        const expire = Number(expireText);
        const minimum = Number(minimumText);
        if (
          mname.trim() === "" ||
          rname.trim() === "" ||
          ![serial, refresh, retry, expire, minimum].every(Number.isInteger)
        ) {
          return setError("SOA sahələrindən biri boşdur və ya tam ədəd deyil.");
        }
        record = { ...common, type, mname: mname.trim(), rname: rname.trim(), serial, refresh, retry, expire, minimum };
        break;
      }
    }

    setRecords((prev) => [...prev, record]);
    setError(null);
  }

  return (
    <div className="space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Zona başlıqları" />
        <div className="@container">
          <div className="grid gap-4 p-4 @min-[30rem]:grid-cols-2">
            <ToolField label="$ORIGIN" htmlFor="zone-fayl-origin">
              <ToolInput id="zone-fayl-origin" value={origin} onChange={(event) => setOrigin(event.target.value)} spellCheck={false} />
            </ToolField>
            <ToolField label="$TTL" htmlFor="zone-fayl-ttl" suffix="saniyə">
              <ToolInput id="zone-fayl-ttl" value={ttl} onChange={(event) => setTtl(event.target.value)} inputMode="numeric" />
            </ToolField>
          </div>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Qeyd əlavə et" />
        <div className="@container">
          <div className="grid gap-4 p-4 @min-[34rem]:grid-cols-3">
            <ToolField label="Tip" htmlFor="zone-fayl-type">
              <ToolSelect id="zone-fayl-type" value={type} onChange={(event) => setType(event.target.value as ZoneRecordType)}>
                {ZONE_RECORD_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </ToolSelect>
            </ToolField>
            <ToolField label="Ad" htmlFor="zone-fayl-name">
              <ToolInput id="zone-fayl-name" value={name} onChange={(event) => setName(event.target.value)} spellCheck={false} />
            </ToolField>
            <ToolField label="TTL" htmlFor="zone-fayl-row-ttl" note="boş — $TTL dəyərini miras alır">
              <ToolInput id="zone-fayl-row-ttl" value={rowTtl} onChange={(event) => setRowTtl(event.target.value)} inputMode="numeric" />
            </ToolField>
          </div>

          <div className="grid gap-4 border-t border-rule p-4 @min-[34rem]:grid-cols-3">
            <TypeFields
              type={type}
              address={address}
              setAddress={setAddress}
              target={target}
              setTarget={setTarget}
              priorityText={priorityText}
              setPriorityText={setPriorityText}
              weightText={weightText}
              setWeightText={setWeightText}
              portText={portText}
              setPortText={setPortText}
              value={value}
              setValue={setValue}
              flagText={flagText}
              setFlagText={setFlagText}
              tag={tag}
              setTag={setTag}
              mname={mname}
              setMname={setMname}
              rname={rname}
              setRname={setRname}
              serialText={serialText}
              setSerialText={setSerialText}
              refreshText={refreshText}
              setRefreshText={setRefreshText}
              retryText={retryText}
              setRetryText={setRetryText}
              expireText={expireText}
              setExpireText={setExpireText}
              minimumText={minimumText}
              setMinimumText={setMinimumText}
            />
          </div>

          <div className="flex items-center gap-3 border-t border-rule p-4">
            <ToolButton onClick={addRecord}>Əlavə et</ToolButton>
            {error && <span className="text-xs text-accent-text">{error}</span>}
          </div>
        </div>
      </ToolPanel>

      {records.length > 0 && (
        <ToolResultPanel
          title="Cədvəl"
          hint={`${records.length} qeyd`}
          action={<ToolButton size="chip" onClick={() => setRecords([])}>Hamısını sil</ToolButton>}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-ui text-xs">
              <thead>
                <tr className="border-b border-result-rule text-left text-muted">
                  <th scope="col" className="p-2 font-normal">Ad</th>
                  <th scope="col" className="p-2 font-normal">TTL</th>
                  <th scope="col" className="p-2 font-normal">Tip</th>
                  <th scope="col" className="p-2 font-normal">Dəyər</th>
                  <th scope="col" className="p-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => (
                  <tr key={index} className="border-b border-result-rule align-top last:border-0">
                    <td className="p-2 font-mono break-all">{record.name}</td>
                    <td className="p-2 font-mono tabular-nums text-muted">{record.ttl ?? "—"}</td>
                    <td className="p-2 font-mono">{record.type}</td>
                    <td className="p-2 font-mono break-all">{formatRdata(record)}</td>
                    <td className="p-2">
                      <ToolButton size="chip" onClick={() => setRecords((prev) => prev.filter((_, i) => i !== index))}>
                        sil
                      </ToolButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolResultPanel>
      )}

      <ToolResultPanel title="Qurulan zona faylı" action={<CopyButton value={output} label="mətni kopyala" disabled={output === ""} />}>
        <div className="p-3">
          <ToolOutput>{output === "" ? "(hələ qeyd yoxdur)" : output}</ToolOutput>
        </div>
      </ToolResultPanel>
    </div>
  );
}

function TypeFields(props: {
  type: ZoneRecordType;
  address: string;
  setAddress: (value: string) => void;
  target: string;
  setTarget: (value: string) => void;
  priorityText: string;
  setPriorityText: (value: string) => void;
  weightText: string;
  setWeightText: (value: string) => void;
  portText: string;
  setPortText: (value: string) => void;
  value: string;
  setValue: (value: string) => void;
  flagText: string;
  setFlagText: (value: string) => void;
  tag: string;
  setTag: (value: string) => void;
  mname: string;
  setMname: (value: string) => void;
  rname: string;
  setRname: (value: string) => void;
  serialText: string;
  setSerialText: (value: string) => void;
  refreshText: string;
  setRefreshText: (value: string) => void;
  retryText: string;
  setRetryText: (value: string) => void;
  expireText: string;
  setExpireText: (value: string) => void;
  minimumText: string;
  setMinimumText: (value: string) => void;
}) {
  const { type } = props;

  if (type === "A" || type === "AAAA") {
    return (
      <ToolField label="Ünvan" htmlFor="zone-fayl-address" className="@min-[34rem]:col-span-3">
        <ToolInput id="zone-fayl-address" value={props.address} onChange={(event) => props.setAddress(event.target.value)} spellCheck={false} />
      </ToolField>
    );
  }

  if (type === "CNAME" || type === "NS") {
    return (
      <ToolField label="Hədəf" htmlFor="zone-fayl-target" className="@min-[34rem]:col-span-3">
        <ToolInput id="zone-fayl-target" value={props.target} onChange={(event) => props.setTarget(event.target.value)} spellCheck={false} />
      </ToolField>
    );
  }

  if (type === "MX") {
    return (
      <>
        <ToolField label="Prioritet" htmlFor="zone-fayl-priority">
          <ToolInput id="zone-fayl-priority" value={props.priorityText} onChange={(event) => props.setPriorityText(event.target.value)} inputMode="numeric" />
        </ToolField>
        <ToolField label="Hədəf" htmlFor="zone-fayl-target" className="@min-[34rem]:col-span-2">
          <ToolInput id="zone-fayl-target" value={props.target} onChange={(event) => props.setTarget(event.target.value)} spellCheck={false} />
        </ToolField>
      </>
    );
  }

  if (type === "TXT") {
    return (
      <ToolField label="Mətn" htmlFor="zone-fayl-value" className="@min-[34rem]:col-span-3">
        <ToolTextArea id="zone-fayl-value" value={props.value} onChange={(event) => props.setValue(event.target.value)} rows={3} />
      </ToolField>
    );
  }

  if (type === "SRV") {
    return (
      <>
        <ToolField label="Prioritet" htmlFor="zone-fayl-priority">
          <ToolInput id="zone-fayl-priority" value={props.priorityText} onChange={(event) => props.setPriorityText(event.target.value)} inputMode="numeric" />
        </ToolField>
        <ToolField label="Çəki" htmlFor="zone-fayl-weight">
          <ToolInput id="zone-fayl-weight" value={props.weightText} onChange={(event) => props.setWeightText(event.target.value)} inputMode="numeric" />
        </ToolField>
        <ToolField label="Port" htmlFor="zone-fayl-port">
          <ToolInput id="zone-fayl-port" value={props.portText} onChange={(event) => props.setPortText(event.target.value)} inputMode="numeric" />
        </ToolField>
        <ToolField label="Hədəf" htmlFor="zone-fayl-target" className="@min-[34rem]:col-span-3">
          <ToolInput id="zone-fayl-target" value={props.target} onChange={(event) => props.setTarget(event.target.value)} spellCheck={false} />
        </ToolField>
      </>
    );
  }

  if (type === "CAA") {
    return (
      <>
        <ToolField label="Bayraq" htmlFor="zone-fayl-flag">
          <ToolInput id="zone-fayl-flag" value={props.flagText} onChange={(event) => props.setFlagText(event.target.value)} inputMode="numeric" />
        </ToolField>
        <ToolField label="Tağ" htmlFor="zone-fayl-tag">
          <ToolSelect id="zone-fayl-tag" value={props.tag} onChange={(event) => props.setTag(event.target.value)}>
            <option value="issue">issue</option>
            <option value="issuewild">issuewild</option>
            <option value="iodef">iodef</option>
          </ToolSelect>
        </ToolField>
        <ToolField label="Dəyər" htmlFor="zone-fayl-value">
          <ToolInput id="zone-fayl-value" value={props.value} onChange={(event) => props.setValue(event.target.value)} spellCheck={false} />
        </ToolField>
      </>
    );
  }

  return (
    <>
      <ToolField label="MNAME (əsas ad server)" htmlFor="zone-fayl-mname">
        <ToolInput id="zone-fayl-mname" value={props.mname} onChange={(event) => props.setMname(event.target.value)} spellCheck={false} />
      </ToolField>
      <ToolField label="RNAME (admin e-poçtu)" htmlFor="zone-fayl-rname">
        <ToolInput id="zone-fayl-rname" value={props.rname} onChange={(event) => props.setRname(event.target.value)} spellCheck={false} />
      </ToolField>
      <ToolField label="Seriya" htmlFor="zone-fayl-serial">
        <ToolInput id="zone-fayl-serial" value={props.serialText} onChange={(event) => props.setSerialText(event.target.value)} inputMode="numeric" />
      </ToolField>
      <ToolField label="Refresh" htmlFor="zone-fayl-refresh" suffix="san">
        <ToolInput id="zone-fayl-refresh" value={props.refreshText} onChange={(event) => props.setRefreshText(event.target.value)} inputMode="numeric" />
      </ToolField>
      <ToolField label="Retry" htmlFor="zone-fayl-retry" suffix="san">
        <ToolInput id="zone-fayl-retry" value={props.retryText} onChange={(event) => props.setRetryText(event.target.value)} inputMode="numeric" />
      </ToolField>
      <ToolField label="Expire" htmlFor="zone-fayl-expire" suffix="san">
        <ToolInput id="zone-fayl-expire" value={props.expireText} onChange={(event) => props.setExpireText(event.target.value)} inputMode="numeric" />
      </ToolField>
      <ToolField label="Minimum" htmlFor="zone-fayl-minimum" suffix="san">
        <ToolInput id="zone-fayl-minimum" value={props.minimumText} onChange={(event) => props.setMinimumText(event.target.value)} inputMode="numeric" />
      </ToolField>
    </>
  );
}
