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
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import {
  buildCspHeaderLine,
  buildCspMetaTag,
  buildCspString,
  CSP_DIRECTIVE_ORDER,
  CSP_PRESETS,
  DIRECTIVE_LABELS,
  findWeaknesses,
  FETCH_DIRECTIVES,
  isNonInheritingDirectiveSet,
  NON_INHERITING_DIRECTIVES,
  parseCspString,
  resolveFetchDirectives,
  SCHEME_SOURCES,
  SOURCE_KEYWORDS,
  type CspDirective,
  type CspDirectiveMap,
} from "../lib/csp-qurucu";

/*
 * A CSP directive's value is a space-separated list, so it is edited here as
 * one raw text field per active directive rather than as a token array with
 * its own add/remove UI — a visitor who already knows CSP syntax types
 * `'self' https://cdn.example.com` directly, and the keyword chips below the
 * field are for the visitor who does not.
 *
 * `rawByDirective` holding a key at all (even `""`) is what "this directive
 * is on" means; deleting the key is what turns it back off. Two directives
 * — `upgrade-insecure-requests` (a bare flag) and `report-to` (a single
 * group name, not a source list) — are edited differently below, so they are
 * excluded from the generic editor loop.
 */
type RawDirectives = Partial<Record<CspDirective, string>>;

/** Directives whose value is a CSP source list — where offering the keyword/scheme chips below the raw field makes sense. `report-uri` and `report-to` take URLs and a group name instead, not CSP source keywords. */
const SOURCE_LIST_DIRECTIVES: CspDirective[] = [...FETCH_DIRECTIVES, ...NON_INHERITING_DIRECTIVES];

function toDirectiveMap(raw: RawDirectives): CspDirectiveMap {
  const map: CspDirectiveMap = {};
  for (const name of CSP_DIRECTIVE_ORDER) {
    const value = raw[name];
    if (value === undefined) continue;
    map[name] = value.split(/\s+/).filter((token) => token !== "");
  }
  return map;
}

function fromDirectiveMap(directives: CspDirectiveMap): RawDirectives {
  const raw: RawDirectives = {};
  for (const name of CSP_DIRECTIVE_ORDER) {
    const value = directives[name];
    if (value === undefined) continue;
    raw[name] = value.join(" ");
  }
  return raw;
}

function appendToken(current: string, token: string): string {
  const tokens = current.split(/\s+/).filter((t) => t !== "");
  if (tokens.includes(token)) return current;
  return [...tokens, token].join(" ");
}

const INITIAL_RAW: RawDirectives = fromDirectiveMap(CSP_PRESETS[0].directives);

type Mode = "qurucu" | "izahci";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "qurucu", label: "Qurucu" },
  { value: "izahci", label: "İzahçı" },
];

export function CspQurucuTool() {
  const [mode, setMode] = useState<Mode>("qurucu");
  const [raw, setRaw] = useState<RawDirectives>(INITIAL_RAW);
  const [pasted, setPasted] = useState("");

  const directives = useMemo(() => toDirectiveMap(raw), [raw]);
  const headerLine = useMemo(() => buildCspHeaderLine(directives), [directives]);
  const policyString = useMemo(() => buildCspString(directives), [directives]);
  const metaTag = useMemo(() => buildCspMetaTag(directives), [directives]);
  const inheritance = useMemo(() => resolveFetchDirectives(directives), [directives]);
  const weaknesses = useMemo(() => findWeaknesses(directives), [directives]);

  function setDirectiveActive(name: CspDirective, active: boolean) {
    setRaw((prev) => {
      const next = { ...prev };
      if (active) {
        next[name] = next[name] ?? "";
      } else {
        delete next[name];
      }
      return next;
    });
  }

  function setDirectiveValue(name: CspDirective, value: string) {
    setRaw((prev) => ({ ...prev, [name]: value }));
  }

  function insertKeyword(name: CspDirective, token: string) {
    setRaw((prev) => ({ ...prev, [name]: appendToken(prev[name] ?? "", token) }));
  }

  const parsed = pasted.trim() !== "" ? parseCspString(pasted) : null;
  const parsedInheritance = parsed !== null && parsed.ok ? resolveFetchDirectives(parsed.directives) : [];
  const parsedWeaknesses = parsed !== null && parsed.ok ? findWeaknesses(parsed.directives) : [];

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title={mode === "qurucu" ? "CSP qurucusu" : "Mövcud CSP-ni yapışdır"}
          action={<ToolSegmented label="Rejim" options={MODE_OPTIONS} value={mode} onChange={setMode} />}
        />

        {mode === "qurucu" ? (
          <div className="space-y-5 p-4">
            <div>
              <ToolLabel>Hazır qəliblər</ToolLabel>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {CSP_PRESETS.map((preset) => (
                  <ToolButton key={preset.id} size="chip" onClick={() => setRaw(fromDirectiveMap(preset.directives))}>
                    {preset.label}
                  </ToolButton>
                ))}
              </div>
            </div>

            <div>
              <ToolLabel>Direktivlər</ToolLabel>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {CSP_DIRECTIVE_ORDER.map((name) => (
                  <ToolButton
                    key={name}
                    size="chip"
                    selected={raw[name] !== undefined}
                    onClick={() => setDirectiveActive(name, raw[name] === undefined)}
                  >
                    {name}
                  </ToolButton>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {CSP_DIRECTIVE_ORDER.filter((name) => raw[name] !== undefined).map((name) => (
                <DirectiveEditor
                  key={name}
                  name={name}
                  value={raw[name] ?? ""}
                  onChange={(value) => setDirectiveValue(name, value)}
                  onInsert={(token) => insertKeyword(name, token)}
                  onRemove={() => setDirectiveActive(name, false)}
                />
              ))}
              {CSP_DIRECTIVE_ORDER.every((name) => raw[name] === undefined) && (
                <ToolNote tone="info">
                  {withInlineCode("Yuxarıdan ən azı bir direktiv seç — məsələn `default-src`.")}
                </ToolNote>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <ToolField
              label="CSP başlığı və ya content dəyəri"
              htmlFor="csp-qurucu-paste"
              note={withInlineCode("`Content-Security-Policy:` etiketi ilə də, onsuz da yapışdıra bilərsən.")}
            >
              <ToolTextArea
                id="csp-qurucu-paste"
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="default-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'none'"
              />
            </ToolField>
            {parsed === null && <ToolNote tone="info">Nəticəni görmək üçün bir CSP yapışdır.</ToolNote>}
            {parsed !== null && !parsed.ok && (
              <ToolNote tone="accent" title="Alınmadı">
                {withInlineCode(parsed.error)}
              </ToolNote>
            )}
          </div>
        )}
      </ToolPanel>

      {mode === "qurucu" && (
        <>
          <ToolResultPanel
            title="HTTP başlığı"
            action={<CopyButton value={headerLine} label="Başlığı kopyala" className="shrink-0" />}
          >
            <ToolOutput className="m-4 break-all">{policyString === "" ? "(direktiv seçilməyib)" : headerLine}</ToolOutput>
          </ToolResultPanel>

          <ToolResultPanel
            title="<meta> teqi"
            hint={metaTag.droppedDirectives.length > 0 ? `${metaTag.droppedDirectives.length} direktiv düşdü` : undefined}
            action={<CopyButton value={metaTag.tag} label="Teqi kopyala" className="shrink-0" />}
          >
            <ToolOutput className="m-4 break-all">{metaTag.tag}</ToolOutput>
            {metaTag.droppedDirectives.length > 0 && (
              <p className="px-4 pb-4 text-ios-footnote text-muted">
                {withInlineCode(
                  `\`<meta>\` bunları daşıya bilmir, ona görə teqdən çıxarıldı: ${metaTag.droppedDirectives.map((d) => `\`${d}\``).join(", ")}. Bunlar lazımdırsa yuxarıdakı HTTP başlığını işlət.`,
                )}
              </p>
            )}
          </ToolResultPanel>

          <InheritanceTable rows={inheritance} directives={directives} />
          <WeaknessList weaknesses={weaknesses} />
        </>
      )}

      {mode === "izahci" && parsed !== null && parsed.ok && (
        <>
          <ToolResultPanel title="Direktiv-direktiv" hint={`${parsed.parsed.length} direktiv`}>
            <ToolAccordion>
              {parsed.parsed.map((entry, index) => (
                <ToolAccordionItem
                  key={`${entry.name}-${index}`}
                  summary={<span className="font-mono text-sm">{entry.name}</span>}
                  hint={entry.values.length > 0 ? `${entry.values.length} mənbə` : "bayraq"}
                  defaultOpen={index === 0}
                  group="csp-qurucu-parsed"
                >
                  {isKnownDirective(entry.name) ? (
                    <p>{withInlineCode(DIRECTIVE_LABELS[entry.name])}</p>
                  ) : (
                    <p>Bu direktiv bu alət tərəfindən tanınmır, olduğu kimi saxlanılır.</p>
                  )}
                  {entry.values.length > 0 && (
                    <ToolOutput className="mt-2 break-all">{entry.values.join(" ")}</ToolOutput>
                  )}
                </ToolAccordionItem>
              ))}
            </ToolAccordion>
            {parsed.unknownDirectives.length > 0 && (
              <p className="p-3 text-ios-footnote text-muted">
                {withInlineCode(
                  `Tanınmayan direktiv(lər): ${parsed.unknownDirectives.map((d) => `\`${d}\``).join(", ")} — siyahıda saxlanılır, amma miras və zəiflik yoxlamasına daxil edilmir.`,
                )}
              </p>
            )}
          </ToolResultPanel>

          <InheritanceTable rows={parsedInheritance} directives={parsed.directives} />
          <WeaknessList weaknesses={parsedWeaknesses} />
        </>
      )}
    </div>
  );
}

function isKnownDirective(name: string): name is CspDirective {
  return (CSP_DIRECTIVE_ORDER as string[]).includes(name);
}

function DirectiveEditor({
  name,
  value,
  onChange,
  onInsert,
  onRemove,
}: {
  name: CspDirective;
  value: string;
  onChange: (value: string) => void;
  onInsert: (token: string) => void;
  onRemove: () => void;
}) {
  const isFlag = name === "upgrade-insecure-requests";
  const isSourceList = SOURCE_LIST_DIRECTIVES.includes(name);

  return (
    <div className="rounded border border-rule p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm">{name}</p>
          <p className="mt-0.5 text-ios-footnote text-muted">{withInlineCode(DIRECTIVE_LABELS[name])}</p>
        </div>
        <ToolButton size="chip" onClick={onRemove} className="shrink-0">
          Sil
        </ToolButton>
      </div>

      {!isFlag && (
        <div className="mt-3">
          <ToolInput
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={name === "report-to" ? "csp-hesabat-qrupu" : "'self' https://example.com"}
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
          />
        </div>
      )}

      {isSourceList && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SOURCE_KEYWORDS.map((keyword) => (
            <ToolButton key={keyword} size="chip" onClick={() => onInsert(keyword)}>
              {keyword}
            </ToolButton>
          ))}
          {SCHEME_SOURCES.map((scheme) => (
            <ToolButton key={scheme} size="chip" onClick={() => onInsert(scheme)}>
              {scheme}
            </ToolButton>
          ))}
        </div>
      )}

      {isFlag && <p className="mt-2 text-ios-footnote text-muted">Mənbə siyahısı götürmür — yalnız aktivdir/deyil.</p>}
    </div>
  );
}

function InheritanceTable({
  rows,
  directives,
}: {
  rows: { directive: CspDirective; effectiveValues: string[]; inherited: boolean }[];
  directives: CspDirectiveMap;
}) {
  return (
    <ToolPanel>
      <ToolPanelHeader title="Miras statusu" hint="fetch direktivləri default-src-dən miras alır" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-ui text-xs">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th scope="col" className="p-2 font-normal">
                Direktiv
              </th>
              <th scope="col" className="p-2 font-normal">
                Qüvvədə olan mənbələr
              </th>
              <th scope="col" className="p-2 font-normal">
                Mənbə
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.directive} className="border-b border-rule align-top last:border-0">
                <td className="p-2 font-mono">{row.directive}</td>
                <td className="p-2 font-mono break-all">
                  {row.effectiveValues.length > 0 ? row.effectiveValues.join(" ") : "— (məhdudiyyətsiz)"}
                </td>
                <td className="p-2 text-muted">{row.inherited ? "default-src-dən miras" : "özü təyin olunub"}</td>
              </tr>
            ))}
            {NON_INHERITING_DIRECTIVES.map((name) => (
              <tr key={name} className="border-b border-rule align-top last:border-0">
                <td className="p-2 font-mono">{name}</td>
                <td className="p-2 font-mono break-all">
                  {directives[name] !== undefined ? (directives[name] ?? []).join(" ") || "(boş)" : "— (məhdudiyyətsiz)"}
                </td>
                <td className="p-2 text-muted">
                  {isNonInheritingDirectiveSet(directives, name) ? "özü təyin olunub" : "miras almır — heç vaxt"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ToolPanel>
  );
}

function WeaknessList({ weaknesses }: { weaknesses: { directive: CspDirective; message: string }[] }) {
  if (weaknesses.length === 0) {
    return (
      <ToolNote tone="info" title="Aşkar edilmiş zəiflik yoxdur">
        Bu, siyasətin təhlükəsiz olduğunu sübut etmir — yalnız bu alətin tanıdığı naxışlardan heç biri tapılmadı.
      </ToolNote>
    );
  }

  return (
    <ToolResultPanel title="Zəifliklər" hint={`${weaknesses.length} bənd`}>
      <ul className="space-y-3 p-3">
        {weaknesses.map((weakness, index) => (
          <li key={index} className="border-l-2 border-l-accent pl-3 text-sm/6">
            {withInlineCode(weakness.message)}
          </li>
        ))}
      </ul>
    </ToolResultPanel>
  );
}
