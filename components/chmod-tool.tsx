"use client";

import { useId, useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ReferenceTable } from "./reference-table";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import {
  chmodCommand,
  chmodRows,
  chmodSections,
  describeMode,
  EMPTY_MODE,
  modeWarnings,
  parseOctal,
  parseSymbolic,
  toOctal,
  toSymbolic,
  type ChmodMode,
  type Permission,
} from "../lib/chmod";

/*
 * The mode is the state; the number, the `rwx` string and the nine boxes are
 * three views of it.
 *
 * The two text fields keep their own text alongside it, and that is the whole
 * subtlety here: a field whose value is re-derived from the mode on every
 * keystroke cannot be half-typed, so `7` would snap to `0007` under the
 * visitor's cursor before they reached `755`. The typed text is therefore kept
 * as written, and the mode is updated only when the text parses. An
 * unparseable field says so and leaves every other view alone rather than
 * blanking the result.
 */

type ActorKey = "owner" | "group" | "other";

/* `octalDigit` indexes into the four-digit string `toOctal` returns, so the
   per-row number comes from the same function as the headline one. */
const ACTOR_ROWS: { key: ActorKey; label: string; octalDigit: number }[] = [
  { key: "owner", label: "Sahib", octalDigit: 1 },
  { key: "group", label: "Qrup", octalDigit: 2 },
  { key: "other", label: "Digərləri", octalDigit: 3 },
];

const PERMISSION_COLUMNS: { key: keyof Permission; label: string }[] = [
  { key: "read", label: "oxu" },
  { key: "write", label: "yazma" },
  { key: "execute", label: "icra" },
];

const SPECIAL_BITS: { key: "setuid" | "setgid" | "sticky"; label: string; hint: string }[] = [
  { key: "setuid", label: "setuid", hint: "4000" },
  { key: "setgid", label: "setgid", hint: "2000" },
  { key: "sticky", label: "sticky", hint: "1000" },
];

const PRESETS = ["644", "755", "600", "700", "664", "775", "400", "777"];

const DEFAULT_OCTAL = "755";
const DEFAULT_TARGET = "fayl.sh";

/** Replaces one actor's permissions without a computed key TypeScript has to widen. */
function withPermission(mode: ChmodMode, actor: ActorKey, permission: Permission): ChmodMode {
  return {
    ...mode,
    owner: actor === "owner" ? permission : mode.owner,
    group: actor === "group" ? permission : mode.group,
    other: actor === "other" ? permission : mode.other,
  };
}

export function ChmodTool() {
  const [mode, setMode] = useState<ChmodMode>(() => parseOctal(DEFAULT_OCTAL) ?? EMPTY_MODE);
  const [octalText, setOctalText] = useState(DEFAULT_OCTAL);
  const [symbolicText, setSymbolicText] = useState(() => toSymbolic(parseOctal(DEFAULT_OCTAL) ?? EMPTY_MODE));
  const [target, setTarget] = useState(DEFAULT_TARGET);

  const octalId = useId();
  const symbolicId = useId();
  const targetId = useId();

  const octal = toOctal(mode);
  const symbolic = toSymbolic(mode);
  /* The three-digit form is what a person types; the leading zero is only
     worth printing when a special bit is actually set. */
  const shortOctal = octal.startsWith("0") ? octal.slice(1) : octal;

  const command = chmodCommand(mode, target);
  const sentence = useMemo(() => describeMode(mode), [mode]);
  const warnings = useMemo(() => modeWarnings(mode), [mode]);

  const octalBroken = parseOctal(octalText) === null;
  const symbolicBroken = parseSymbolic(symbolicText) === null;

  /* The directory caveat is shown rather than warned about: read without
     execute is the correct mode for nearly every file on a server, and only
     becomes a mistake when the thing is a directory. */
  const readWithoutExecute = ACTOR_ROWS.some((row) => {
    const permission = mode[row.key];
    return permission.read && !permission.execute;
  });

  const applyMode = (next: ChmodMode) => {
    setMode(next);
    setOctalText(toOctal(next));
    setSymbolicText(toSymbolic(next));
  };

  const onOctalChange = (value: string) => {
    setOctalText(value);
    const parsed = parseOctal(value);
    if (parsed === null) return;
    setMode(parsed);
    setSymbolicText(toSymbolic(parsed));
  };

  const onSymbolicChange = (value: string) => {
    setSymbolicText(value);
    const parsed = parseSymbolic(value);
    if (parsed === null) return;
    setMode(parsed);
    setOctalText(toOctal(parsed));
  };

  return (
    <>
      <div className="mt-8 space-y-5" data-spec="chmod-tool">
        <ToolPanel>
          <ToolPanelHeader
            title="Rejim"
            hint={<span className="tabular-nums">{shortOctal}</span>}
            action={
              <>
                {PRESETS.map((preset) => (
                  <ToolButton
                    key={preset}
                    size="chip"
                    selected={shortOctal === preset}
                    onClick={() => {
                      const parsed = parseOctal(preset);
                      if (parsed !== null) applyMode(parsed);
                    }}
                  >
                    {preset}
                  </ToolButton>
                ))}
                <ToolButton size="chip" onClick={() => applyMode(EMPTY_MODE)}>
                  sıfırla
                </ToolButton>
              </>
            }
          />

          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div className="space-y-4">
              <table className="w-full border-collapse font-ui text-xs">
                <caption className="pb-2 text-left text-[11px] text-muted">
                  Kim nə edə bilər
                </caption>
                <thead>
                  <tr className="border-b border-rule">
                    <th scope="col" className="pb-2 text-left font-normal text-muted">
                      kim
                    </th>
                    {PERMISSION_COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className="pb-2 text-center font-normal text-muted"
                      >
                        {column.label}
                      </th>
                    ))}
                    <th scope="col" className="pb-2 text-right font-normal text-muted">
                      rəqəm
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {ACTOR_ROWS.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="py-2.5 text-left font-normal">
                        {row.label}
                      </th>
                      {PERMISSION_COLUMNS.map((column) => (
                        <td key={column.key} className="py-2.5 text-center">
                          {/* Native, like the subnet slider: the skin layer
                              draws buttons and fields, and a checkbox is
                              neither. `accent-color` is what makes the tick
                              follow the active accent. */}
                          <input
                            type="checkbox"
                            checked={mode[row.key][column.key]}
                            aria-label={`${row.label} — ${column.label}`}
                            onChange={(event) =>
                              applyMode(
                                withPermission(mode, row.key, {
                                  ...mode[row.key],
                                  [column.key]: event.target.checked,
                                }),
                              )
                            }
                            className="size-4 accent-[var(--color-accent)]"
                          />
                        </td>
                      ))}
                      <td className="py-2.5 text-right tabular-nums">{octal[row.octalDigit]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div>
                <p className="font-ui text-[11px] text-muted">
                  Xüsusi bitlər
                </p>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                  {SPECIAL_BITS.map((bit) => (
                    <label
                      key={bit.key}
                      className="flex items-center gap-2 font-mono text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={mode[bit.key]}
                        onChange={(event) =>
                          applyMode({ ...mode, [bit.key]: event.target.checked })
                        }
                        className="size-4 accent-[var(--color-accent)]"
                      />
                      {bit.label}
                      <span className="tabular-nums text-muted">{bit.hint}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <ToolField
                label="Səkkizlik"
                htmlFor={octalId}
                hint="0–7777"
                note={
                  octalBroken
                    ? "Yalnız 0–7 rəqəmləri, ən çoxu dörd ədəd: 755, 0644, 4755."
                    : "Buraxılan rəqəm baş sıfır sayılır: 75 yazsan 075 alınır."
                }
              >
                <ToolInput
                  id={octalId}
                  value={octalText}
                  onChange={(event) => onOctalChange(event.target.value)}
                  aria-invalid={octalBroken}
                  placeholder="755"
                  inputMode="numeric"
                  spellCheck={false}
                  autoComplete="off"
                />
              </ToolField>

              <ToolField
                label="Simvolik"
                htmlFor={symbolicId}
                hint="9 simvol"
                note={
                  symbolicBroken
                    ? "rwxr-xr-x formatında doqquz simvol gözlənilir; s, S, t və T də qəbul edilir."
                    : "ls -l sətrini olduğu kimi yapışdıra bilərsən — baş hərf özü kəsilir."
                }
              >
                <ToolInput
                  id={symbolicId}
                  value={symbolicText}
                  onChange={(event) => onSymbolicChange(event.target.value)}
                  aria-invalid={symbolicBroken}
                  placeholder="rwxr-xr-x"
                  spellCheck={false}
                  autoComplete="off"
                />
              </ToolField>

              <ToolField
                label="Fayl və ya qovluq"
                htmlFor={targetId}
                note="Yalnız aşağıdakı əmrdə görünür, başqa heç nəyə təsir etmir."
              >
                <ToolInput
                  id={targetId}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder={DEFAULT_TARGET}
                  spellCheck={false}
                  autoComplete="off"
                />
              </ToolField>
            </div>
          </div>
        </ToolPanel>

        <ToolResultPanel
          title="Nəticə"
          hint={<span className="tabular-nums">{symbolic}</span>}
          action={<CopyButton value={command} label="əmri kopyala" />}
        >
          <div className="space-y-3 p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <ToolStat
                label="Səkkizlik"
                value={shortOctal}
                tone={warnings.length > 0 ? "warning" : "accent"}
                note={warnings.length > 0 ? "Aşağıdakı xəbərdarlığa bax." : undefined}
              />
              <ToolStat label="Simvolik" value={symbolic} note="ls -l sətrindəki forma." />
              <ToolStat
                label="Dörd rəqəmli forma"
                value={octal}
                note="Baş rəqəm xüsusi bitləri saxlayır."
              />
            </div>

            <ToolOutput>{command}</ToolOutput>

            <p className="font-ui text-[0.82rem]/6">{sentence}</p>
          </div>
        </ToolResultPanel>

        {warnings.length > 0 && (
          <ToolNote tone="accent" title="Xəbərdarlıq">
            <ul className="space-y-2">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </ToolNote>
        )}

        {readWithoutExecute && (
          <ToolNote title="Bu, qovluqdursa">
            Qovluqda oxu bayrağı yalnız adları göstərir. Qovluğa girmək, ora cd etmək və
            içindəki fayla toxunmaq üçün icra bayrağı lazımdır — ona görə qovluqlar demək
            olar həmişə 755 və ya 700 olur. Fayl ilə qovluğa eyni əmrdə rejim verəndə
            simvolik böyük X işlədilir: o, icra bayrağını yalnız qovluqlara qoyur.
          </ToolNote>
        )}
      </div>

      <ReferenceTable
        rows={chmodRows}
        sections={chmodSections}
        placeholder="Rejim, əmr və ya bit adı: 755, u+x, sticky"
        footnote="Cədvəl GNU coreutils chmod davranışına görə yazılıb. Fayl sistemi ACL, bağlama seçimi və ya konteyner qatı ilə məhdudlaşdırılıbsa, effektiv icazə bu bitlərdən dar ola bilər."
      />
    </>
  );
}
