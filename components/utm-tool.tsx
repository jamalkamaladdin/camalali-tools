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
  auditUtm,
  buildUtmUrl,
  EMPTY_UTM,
  parseUtmUrl,
  UTM_PRESETS,
  type UtmFields,
} from "../lib/utm";

/*
 * Six value fields, one row each, in the order a visitor thinks about them:
 * the mandatory triple GA4 needs to bucket the hit at all, then the three
 * that refine it. `required` only drives the hint text — buildUtmUrl is the
 * one place the mandatory check actually runs.
 */
const FIELD_ROWS: {
  field: Exclude<keyof UtmFields, "url">;
  label: string;
  param: string;
  placeholder: string;
  required: boolean;
}[] = [
  { field: "source", label: "Mənbə", param: "utm_source", placeholder: "facebook", required: true },
  { field: "medium", label: "Kanal", param: "utm_medium", placeholder: "social", required: true },
  {
    field: "campaign",
    label: "Kampaniya",
    param: "utm_campaign",
    placeholder: "yay-endirimi",
    required: true,
  },
  { field: "term", label: "Açar söz", param: "utm_term", placeholder: "qapı", required: false },
  {
    field: "content",
    label: "Məzmun",
    param: "utm_content",
    placeholder: "sekil-linki",
    required: false,
  },
  { field: "id", label: "Kampaniya ID", param: "utm_id", placeholder: "12345", required: false },
];

const SAMPLE_FIELDS: UtmFields = {
  url: "https://sayt.az/mehsullar/yay-kolleksiyasi",
  source: "Facebook",
  medium: "social",
  campaign: "yay kampaniyası",
  term: "",
  content: "",
  id: "",
};

// Already carries a repeated utm_source and a non-UTM tracking parameter, so
// pasting it straight in shows both the override rule and the extras table
// at once instead of a visitor having to imagine either.
const SAMPLE_SHARED_LINK =
  "https://sayt.az/mehsullar/yay-kolleksiyasi?fbclid=abc123&utm_source=old&utm_source=facebook&utm_medium=social&utm_campaign=yay-endirimi#endirim";

export function UtmTool() {
  const [fields, setFields] = useState<UtmFields>(EMPTY_UTM);
  const updateField = (field: keyof UtmFields, value: string) =>
    setFields((prev) => ({ ...prev, [field]: value }));

  const built = useMemo(() => buildUtmUrl(fields), [fields]);
  const warnings = useMemo(() => auditUtm(fields), [fields]);

  const applyPreset = (source: string, medium: string) =>
    setFields((prev) => ({ ...prev, source, medium }));

  const [parseInput, setParseInput] = useState("");
  const parsed = useMemo(
    () => (parseInput.trim() === "" ? null : parseUtmUrl(parseInput)),
    [parseInput],
  );

  const sendParsedToBuilder = () => {
    if (parsed && parsed.error === null) setFields(parsed.fields);
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Kampaniya linki qur"
          action={
            <ToolButton size="chip" onClick={() => setFields(SAMPLE_FIELDS)}>
              Nümunə
            </ToolButton>
          }
        />

        <div className="space-y-5 p-4">
          <ToolField label="Hədəf URL" htmlFor="utm-target-url">
            <ToolInput
              id="utm-target-url"
              value={fields.url}
              onChange={(event) => updateField("url", event.target.value)}
              placeholder="https://sayt.az/mehsullar/yay-kolleksiyasi"
              spellCheck={false}
            />
          </ToolField>

          <div>
            <ToolLabel>Hazır mənbə</ToolLabel>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {UTM_PRESETS.map((preset) => (
                <ToolButton
                  key={preset.label}
                  size="chip"
                  selected={fields.source === preset.source && fields.medium === preset.medium}
                  onClick={() => applyPreset(preset.source, preset.medium)}
                >
                  {preset.label}
                </ToolButton>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FIELD_ROWS.map((row) => (
              <ToolField
                key={row.field}
                label={row.label}
                hint={row.required ? "məcburi" : "opsional"}
                htmlFor={`utm-field-${row.field}`}
              >
                <ToolInput
                  id={`utm-field-${row.field}`}
                  value={fields[row.field]}
                  onChange={(event) => updateField(row.field, event.target.value)}
                  placeholder={row.placeholder}
                  className="font-mono"
                  spellCheck={false}
                />
              </ToolField>
            ))}
          </div>

          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((warning, index) => {
                const suggestion = warning.suggestion;
                return (
                  <ToolNote key={`${warning.field}-${index}`} tone="accent" title="Xəbərdarlıq">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{warning.message}</span>
                      {suggestion !== null && (
                        <ToolButton size="chip" onClick={() => updateField(warning.field, suggestion)}>
                          «{suggestion}» et
                        </ToolButton>
                      )}
                    </div>
                  </ToolNote>
                );
              })}
            </div>
          )}

          <ToolResultPanel
            title="Hazır link"
            action={built.url ? <CopyButton value={built.url} label="linki kopyala" /> : undefined}
          >
            <div className="p-3">
              {built.url ? (
                <ToolOutput className="break-all">{built.url}</ToolOutput>
              ) : (
                <ToolNote tone="accent" title="Hələ hazır deyil">
                  {built.error}
                </ToolNote>
              )}
            </div>
          </ToolResultPanel>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Linki hissələrə ayır"
          action={
            <ToolButton size="chip" onClick={() => setParseInput(SAMPLE_SHARED_LINK)}>
              Nümunə
            </ToolButton>
          }
        />

        <div className="space-y-5 p-4">
          <ToolField label="Hazır kampaniya linki" htmlFor="utm-parse-input">
            <ToolInput
              id="utm-parse-input"
              value={parseInput}
              onChange={(event) => setParseInput(event.target.value)}
              placeholder="https://sayt.az/b?utm_source=facebook&utm_medium=social&utm_campaign=yay"
              className="font-mono"
              spellCheck={false}
            />
          </ToolField>

          {parsed === null ? (
            <p className="font-ui text-sm text-muted">
              Kampaniya linki yapışdır: utm_ parametrləri və təmiz ünvan burada görünəcək.
            </p>
          ) : parsed.error !== null ? (
            <ToolNote tone="accent" title="Düzgün URL deyil">
              {parsed.error}
            </ToolNote>
          ) : (
            <div className="space-y-4">
              <ToolField label="Təmiz ünvan (UTM-siz)" htmlFor="utm-clean-url">
                <div className="flex items-center gap-2">
                  <ToolInput
                    id="utm-clean-url"
                    readOnly
                    value={parsed.cleanUrl}
                    className="font-mono"
                  />
                  <CopyButton value={parsed.cleanUrl} label="ünvanı kopyala" />
                </div>
              </ToolField>

              <div>
                <ToolLabel>Tapılan UTM parametrləri</ToolLabel>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {FIELD_ROWS.filter((row) => parsed.fields[row.field].trim() !== "").map((row) => (
                    <ToolStat key={row.field} label={row.param} value={parsed.fields[row.field]} />
                  ))}
                </div>
                {FIELD_ROWS.every((row) => parsed.fields[row.field].trim() === "") && (
                  <p className="mt-1.5 font-ui text-xs text-muted">
                    Bu linkdə utm_ parametri tapılmadı.
                  </p>
                )}
              </div>

              {parsed.extras.length > 0 && (
                <div>
                  <ToolLabel>Digər sorğu parametrləri</ToolLabel>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {parsed.extras.map(([key, value]) => (
                      <ToolStat key={key} label={key} value={value || ""} />
                    ))}
                  </div>
                </div>
              )}

              <ToolButton size="chip" onClick={sendParsedToBuilder}>
                Yuxarıdakı qurucuya köçür
              </ToolButton>
            </div>
          )}
        </div>
      </ToolPanel>
    </div>
  );
}
