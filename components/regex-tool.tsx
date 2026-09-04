"use client";

import { useMemo, useState } from "react";
import { formatNumber } from "../shared/format";
import { MAX_MATCHES, runRegex } from "../lib/regex";
import { CopyButton } from "../shared/copy-button";
import {
  accentWash,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import { ToolTabs, type ToolTabItem } from "./tabs";

type FlagKey = "g" | "i" | "m" | "s" | "u" | "y";
const FLAG_ORDER: FlagKey[] = ["g", "i", "m", "s", "u", "y"];

const FLAG_INFO: { key: FlagKey; hint: string }[] = [
  { key: "g", hint: "Bütün uyğunluqlar (global)" },
  { key: "i", hint: "Böyük/kiçik hərf fərqsiz" },
  { key: "m", hint: "^ və $ hər sətir başında/sonunda" },
  { key: "s", hint: ". simvolu sətir sonunu da tutur" },
  { key: "u", hint: "Unicode rejimi" },
  { key: "y", hint: "Yalnız əvvəlki uyğunluğun bitdiyi yerdən" },
];

type Preset = {
  label: string;
  pattern: string;
  flags: FlagKey[];
  text: string;
};

const PRESETS: Preset[] = [
  {
    label: "E-poçt",
    pattern: "[\\w.+-]+@[\\w-]+\\.[a-zA-Z]{2,}",
    flags: ["g"],
    text: "Yazın: info@camalali.com və ya destek@numune.az ünvanına.",
  },
  {
    label: "Mobil nömrə",
    pattern:
      "\\+994[\\s-]?(?<operator>5\\d|7\\d|9\\d)[\\s-]?\\d{3}[\\s-]?\\d{2}[\\s-]?\\d{2}",
    flags: ["g"],
    text: "Zəng et: +994 50 123 45 67 və ya +994-77-505-44-45.",
  },
  {
    label: "IBAN",
    pattern: "AZ\\d{2}[A-Z]{4}[A-Z0-9]{20}",
    flags: ["g"],
    text: "Hesab: AZ21NABZ00000000137010001944",
  },
  {
    label: "VÖEN",
    pattern: "\\b\\d{10}\\b",
    flags: ["g"],
    text: "VÖEN: 1234567890, sifariş kodu 987654321 deyil.",
  },
  {
    label: "URL",
    pattern: "https?:\\/\\/[^\\s]+",
    flags: ["g"],
    text: "Sayt: https://camalali.com/bloq və http://example.com/yol?a=1",
  },
  {
    label: "ISO tarix",
    pattern: "\\d{4}-\\d{2}-\\d{2}",
    flags: ["g"],
    text: "Başlanğıc 2026-01-15, bitmə 2026-09-01.",
  },
  {
    label: "HTML teq",
    pattern: "<\\/?[a-zA-Z][a-zA-Z0-9]*(?:\\s[^>]*)?>",
    flags: ["g"],
    text: '<p class="lead">Salam</p><br/>',
  },
];

const emptyFlags: Record<FlagKey, boolean> = {
  g: false,
  i: false,
  m: false,
  s: false,
  u: false,
  y: false,
};

function flagsFromList(list: FlagKey[]): Record<FlagKey, boolean> {
  return { ...emptyFlags, ...Object.fromEntries(list.map((f) => [f, true])) };
}

export function RegexTool() {
  const first = PRESETS[0]!;
  const [pattern, setPattern] = useState(first.pattern);
  const [flags, setFlags] = useState<Record<FlagKey, boolean>>(
    flagsFromList(first.flags),
  );
  const [text, setText] = useState(first.text);
  const [replacement, setReplacement] = useState("");
  /*
   * Whether a replacement was asked for at all, which is not the same question
   * as whether the box has anything in it. An empty box used to mean "no
   * replacement", so deleting every match — the commonest replacement there is
   * — could not be expressed: clearing the field hid the result panel instead
   * of showing the text with the matches gone.
   */
  const [replacing, setReplacing] = useState(false);

  const flagString = useMemo(
    () => FLAG_ORDER.filter((key) => flags[key]).join(""),
    [flags],
  );

  const result = useMemo(
    () =>
      runRegex({
        pattern,
        flags: flagString,
        text,
        replacement: replacing ? replacement : undefined,
      }),
    [pattern, flagString, text, replacement, replacing],
  );

  const applyPreset = (preset: Preset) => {
    setPattern(preset.pattern);
    setFlags(flagsFromList(preset.flags));
    setText(preset.text);
    setReplacement("");
    setReplacing(false);
  };

  const matchesTabContent = (
    <div className="space-y-4">
      {!result.ok ? (
        <p className="font-ui text-sm text-muted">
          İfadə düzgün olduqda uyğunluqlar burada görünəcək.
        </p>
      ) : (
        <>
          {result.truncated && (
            <ToolNote tone="accent" title="Uyğunluq sayı hədddən keçdi">
              İlk {formatNumber(MAX_MATCHES)} uyğunluq göstərilir, qalanı bu
              siyahıda kəsildi: mətnin özü toxunulmayıb.
            </ToolNote>
          )}

          {result.matches.length === 0 ? (
            <p className="font-ui text-xs text-muted">Uyğunluq tapılmadı</p>
          ) : (
            <ToolResultPanel
              title="Uyğunluqlar"
              hint={
                <span className="tabular-nums">
                  {`${formatNumber(result.matches.length)} uyğunluq`}
                </span>
              }
            >
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  {/* The head used to carry `bg-surface`; on the result ground
                      that reads as an input strip inside a readout. The first
                      body row's own top rule already divides the two. */}
                  <thead className="text-muted">
                    <tr>
                      <th className="px-3 py-2 font-mono text-xs font-semibold">#</th>
                      <th className="px-3 py-2 font-mono text-xs font-semibold">Mövqe</th>
                      <th className="px-3 py-2 font-mono text-xs font-semibold">Dəyər</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matches.map((match, i) => (
                      <tr key={i} className="border-t border-rule">
                        <td className="px-3 py-2 font-mono text-muted tabular-nums">
                          {i + 1}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted tabular-nums">
                          {match.index}
                        </td>
                        <td className="px-3 py-2 font-mono text-ink">
                          {match.value === "" ? (
                            <span className="text-muted">(boş)</span>
                          ) : (
                            match.value
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ToolResultPanel>
          )}
        </>
      )}

      <div>
        <ToolField
          label="Əvəzetmə (opsional)"
          htmlFor="regex-replacement"
          hint="$1, $2… və ya adlandırılmış qrup üçün $<ad>."
          note="Sahəni boşaltsan uyğunluqlar mətndən silinir: nəticə aşağıda qalır."
        >
          <ToolInput
            id="regex-replacement"
            value={replacement}
            onChange={(event) => {
              setReplacement(event.target.value);
              setReplacing(true);
            }}
            placeholder="$1 [at] $<domain>"
            className="font-mono"
            spellCheck={false}
          />
        </ToolField>

        {result.ok && result.replacement !== null && (
          <ToolResultPanel
            title="Əvəzetmə nəticəsi"
            action={<CopyButton value={result.replacement} label="nəticəni kopyala" />}
            className="mt-3"
          >
            <ToolOutput className="m-3">{result.replacement}</ToolOutput>
          </ToolResultPanel>
        )}
      </div>
    </div>
  );

  const groupsTabContent = !result.ok ? (
    <p className="font-ui text-sm text-muted">
      İfadə düzgün olduqda qruplar burada görünəcək.
    </p>
  ) : result.matches.every((match) => match.groups.length === 0) ? (
    <p className="font-ui text-sm text-muted">Bu ifadədə tutma qrupu yoxdur.</p>
  ) : (
    <ToolResultPanel title="Qruplar">
      <div className="space-y-4 p-3">
        {result.matches.map((match, i) =>
          match.groups.length === 0 ? null : (
            <div key={i} className="border-t border-rule pt-3 first:border-t-0 first:pt-0">
              <p className="font-mono text-sm tabular-nums text-ink">
                <span className="mr-2 text-muted">#{i + 1}</span>
                {match.value === "" ? (
                  <span className="text-muted">(boş)</span>
                ) : (
                  match.value
                )}
              </p>
              <ul className="mt-1.5 space-y-0.5 pl-1 font-mono text-xs text-muted">
                {match.groups.map((group) => (
                  <li key={group.number}>
                    {group.name ? `${group.number} (${group.name})` : group.number}
                    : {group.value ?? "(yoxdur)"}
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </ToolResultPanel>
  );

  const examplesTabContent = (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map((preset) => (
        <ToolButton key={preset.label} onClick={() => applyPreset(preset)}>
          {preset.label}
        </ToolButton>
      ))}
    </div>
  );

  const tabItems: ToolTabItem[] = [
    { id: "uygunluqlar", label: "Uyğunluqlar", content: matchesTabContent },
    { id: "qruplar", label: "Qruplar", content: groupsTabContent },
    { id: "numuneler", label: "Nümunələr", content: examplesTabContent },
  ];

  return (
    <ToolPanel className="mt-8">
      <div className="flex flex-wrap items-end gap-4 border-b border-rule px-4 py-3.5">
        <div className="min-w-[220px] flex-1">
          <ToolField label="İfadə (pattern)" htmlFor="regex-pattern">
            <ToolInput
              id="regex-pattern"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder="\d+"
              className="font-mono"
              spellCheck={false}
            />
          </ToolField>
        </div>

        <div className="flex flex-wrap gap-4 pb-2.5">
          {FLAG_INFO.map(({ key, hint }) => (
            <label
              key={key}
              title={hint}
              className="flex items-center gap-1.5 font-mono text-xs text-muted"
            >
              <input
                type="checkbox"
                checked={flags[key]}
                onChange={(event) =>
                  setFlags((prev) => ({ ...prev, [key]: event.target.checked }))
                }
                className="size-4 accent-[var(--color-accent)]"
              />
              {key}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-2">
        <div className="min-w-0">
          <ToolField label="Test mətni" htmlFor="regex-text">
            <ToolTextArea
              id="regex-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Yoxlanacaq mətni bura yapışdır…"
              className="min-h-48"
            />
          </ToolField>
        </div>

        <div className="min-w-0">
          {!result.ok ? (
            <ToolNote tone="accent" title="Xəta">
              {result.error}
            </ToolNote>
          ) : (
            /* The highlighted text is what the expression produced; the
               pattern, the flags and the test text beside it are not. */
            <ToolResultPanel title="Nəticə">
              <ToolOutput className="m-3 max-h-72 overflow-auto leading-6">
                {text === "" ? (
                  <span className="text-muted">Test mətni boşdur.</span>
                ) : (
                  result.segments.map((segment, i) =>
                    segment.isMatch ? (
                      /* Both sides of the pair are stated: `bg-accent/25`
                         was an alpha tint that resolved against whatever the
                         parent happened to be, which measured as low as
                         3.71:1. `accentWash` pins the ground it mixes into. */
                      <mark
                        key={i}
                        className="rounded-[2px] text-ink"
                        style={{ backgroundColor: accentWash }}
                      >
                        {segment.text}
                      </mark>
                    ) : (
                      <span key={i}>{segment.text}</span>
                    ),
                  )
                )}
              </ToolOutput>
            </ToolResultPanel>
          )}
        </div>
      </div>

      <div className="border-t border-rule p-4">
        <ToolTabs idPrefix="regex" items={tabItems} />
      </div>
    </ToolPanel>
  );
}
