"use client";

import { useMemo, useState } from "react";
import { ToolTabs, type ToolTabItem } from "./tabs";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import { formatBytes, formatCompact, formatNumber } from "../shared/format";
import {
  calculateScale,
  defaultScaleInput,
  normaliseScaleInput,
  parseAmount,
  scalePresets,
  type ScaleInput,
} from "../lib/miqyas";

/*
 * Back-of-the-envelope capacity planning, arranged for a window rather than
 * for a page.
 *
 * Nothing here computes: the arithmetic is in `lib/miqyas` and every
 * number is printed through `shared/format`. What this file decides is where
 * ten inputs and eleven derived numbers go, so the tool stays about one screen
 * tall inside a window that may be 800px wide. The same arrangement is what
 * took the standalone page from 7318px on a phone down to a form and a rail:
 * the inputs collapse into four named groups that carry their values in the
 * summary line, the four numbers a decision turns on sit in the rail, and the
 * rest — the remaining numbers, the assumptions, the formulas — is one tab
 * away instead of one screen down.
 *
 * The layout measures its own container, not the viewport: this widget also
 * runs inside a floating window, where the viewport says nothing about how
 * much room the tool actually has.
 */

type FormState = Record<keyof ScaleInput, string>;

type FieldSpec = { key: keyof ScaleInput; label: string; hint: string };

type GroupSpec = {
  id: string;
  title: string;
  fields: FieldSpec[];
  /** Collapsed-state summary, so a finished group can be shut and still read. */
  summarise: (applied: ScaleInput) => string;
};

/** An input echoed back: 24 stays "24", 2.5 keeps the digit that matters. */
function amount(value: number): string {
  return formatNumber(value, Number.isInteger(value) ? 0 : 1);
}

/** Under 100 a rate needs one decimal to stay readable; above it that digit is noise. */
function rate(value: number): string {
  if (value === 0) return "0";
  return formatNumber(value, value < 100 ? 1 : 0);
}

/**
 * Ten inputs stacked in one column is what made this page nine screens tall.
 * They are grouped by the question they answer — how much load, how big is one
 * item, how long is it kept, what absorbs it — so three of the four groups can
 * stay shut while a single number is being tried out.
 */
const groups: GroupSpec[] = [
  {
    id: "trafik",
    title: "Trafik",
    summarise: (applied) =>
      `${formatCompact(applied.dau)} DAU · ×${amount(applied.peakFactor)} pik`,
    fields: [
      {
        key: "dau",
        label: "Gündəlik aktiv istifadəçi",
        hint: "DAU — bir gün ərzində servisə toxunan istifadəçi sayı.",
      },
      {
        key: "actionsPerUser",
        label: "İstifadəçi başına əməliyyat",
        hint: "Bir istifadəçinin gündə göndərdiyi sorğu sayı.",
      },
      {
        key: "readsPerWrite",
        label: "Oxu / yazma nisbəti",
        hint: "100 yazsan: hər yazmaya 100 oxu düşür.",
      },
      {
        key: "peakFactor",
        label: "Pik əmsalı",
        hint: "Pik saatın orta yükə nisbəti — adətən 2–5.",
      },
    ],
  },
  {
    id: "olcu",
    title: "Məlumat ölçüsü",
    summarise: (applied) =>
      `yazı ${amount(applied.writeSizeKb)} KB · cavab ${amount(applied.responseSizeKb)} KB`,
    fields: [
      {
        key: "writeSizeKb",
        label: "Orta yazı ölçüsü (KB)",
        hint: "Diskə düşən bir qeydin gövdəsi.",
      },
      {
        key: "responseSizeKb",
        label: "Orta cavab ölçüsü (KB)",
        hint: "Bir oxu sorğusuna qayıdan cavabın ölçüsü.",
      },
    ],
  },
  {
    id: "saxlama",
    title: "Saxlama və etibarlılıq",
    summarise: (applied) =>
      `${amount(applied.retentionMonths)} ay · ${amount(applied.replication)} nüsxə`,
    fields: [
      {
        key: "retentionMonths",
        label: "Saxlama müddəti (ay)",
        hint: "Məlumat neçə ay saxlanılır. Ay = 30 gün.",
      },
      {
        key: "replication",
        label: "Replikasiya faktoru",
        hint: "Hər qeydin neçə nüsxəsi saxlanılır.",
      },
    ],
  },
  {
    id: "infra",
    title: "Keş və node",
    summarise: (applied) =>
      `keş ${amount(applied.cacheHitPercent)}% · node ${formatCompact(applied.nodeCapacityRps)} RPS`,
    fields: [
      {
        key: "cacheHitPercent",
        label: "Keş hit faizi (%)",
        hint: "Oxuların neçə faizi bazaya çatmadan qayıdır.",
      },
      {
        key: "nodeCapacityRps",
        label: "Bir node-un tutumu (RPS)",
        hint: "Bir serverin rahat çəkdiyi saniyəlik sorğu sayı.",
      },
    ],
  },
];

const fields: FieldSpec[] = groups.flatMap((group) => group.fields);

function toForm(input: ScaleInput): FormState {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, String(value)]),
  ) as FormState;
}

function NumberRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-ui text-xs">{label}</p>
        <p className="shrink-0 font-ui text-xs tabular-nums">{value}</p>
      </div>
      <p className="mt-1 font-ui text-[11px]/5 text-muted">{note}</p>
    </div>
  );
}

function FormulaRow({ label, body }: { label: string; body: string }) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <p className="font-ui text-xs">{label}</p>
      <p className="mt-1 font-ui text-[11px]/5 tabular-nums text-muted">{body}</p>
    </div>
  );
}

export function MiqyasTool() {
  const [form, setForm] = useState<FormState>(() => toForm(defaultScaleInput));

  const { input, broken } = useMemo(() => {
    const values = {} as ScaleInput;
    const unreadable = new Set<keyof ScaleInput>();

    for (const field of fields) {
      const parsed = parseAmount(form[field.key]);
      if (parsed === null) unreadable.add(field.key);
      values[field.key] = parsed ?? 0;
    }

    return { input: values, broken: unreadable };
  }, [form]);

  // The clamped copy, so the notes describe the values the sum actually used.
  const applied = useMemo(() => normaliseScaleInput(input), [input]);
  const result = useMemo(() => calculateScale(input), [input]);

  /* Not every unreadable field becomes zero: `peakFactor` and `replication`
     have a floor of 1 in `limits`, so the sum used 1 for them. `applied` is the
     clamped copy the calculation actually ran on, so it can say which. */
  const invalid = fields
    .filter((field) => broken.has(field.key))
    .map((field) => `${field.label} (${amount(applied[field.key])})`);

  const activePreset = scalePresets.find((preset) =>
    fields.every((field) => form[field.key] === String(preset.input[field.key])),
  );

  const set = (key: keyof ScaleInput, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const numbers = [
    {
      label: "Əməliyyat / gün",
      value: formatCompact(result.totalActionsPerDay),
      note: `oxu ${formatCompact(result.readsPerDay)} · yazma ${formatCompact(result.writesPerDay)}`,
    },
    {
      label: "Orta RPS",
      value: `${rate(result.avgRps)} RPS`,
      note: `oxu ${rate(result.readRps)} · yazma ${rate(result.writeRps)}`,
    },
    {
      label: "Bazaya düşən oxu (pik)",
      value: `${rate(result.dbPeakReadRps)} RPS`,
      note: `keş ${formatNumber(applied.cacheHitPercent)}% tutur · orta ${rate(result.dbReadRps)}`,
    },
    {
      label: "Gündəlik trafik",
      value: formatBytes(result.dailyTrafficBytes),
      note: `çıxış ${formatBytes(result.dailyEgressBytes)} · giriş ${formatBytes(result.dailyIngressBytes)}`,
    },
    {
      label: "Gündəlik saxlama artımı",
      value: formatBytes(result.dailyStorageBytes),
      note: "yalnız yazılan gövdə — oxu disk yeri tutmur",
    },
    {
      label: "Saxlama — replikasiyasız",
      value: formatBytes(result.storageBytes),
      note: `${formatNumber(result.retentionDays)} gün saxlanır`,
    },
    {
      label: "Pik / orta fərqi",
      value: `×${rate(applied.peakFactor)}`,
      note: "pik saat orta yükdən bu qədər ağırdır",
    },
  ];

  const tabs: ToolTabItem[] = [
    {
      id: "reqemler",
      label: "Rəqəmlər",
      content: (
        /*
         * The seven derived readings — the only one of the three tabs that
         * changes when an input does. The assumptions and the formulas beside
         * it are constant text explaining how the sum works, so they stay
         * explanation and keep the input surface.
         *
         * The result panel wraps the tab's CONTENT and never the tab strip
         * above it. An unselected tab is `text-muted` on the skin's own button
         * face, and on ios that face is translucent
         * (`rgba(235, 235, 245, .12)`): over the lighter result ground it
         * lifts to rgb(70, 72, 80) and the label measured 4.31:1 against the
         * 4.5 AA needs. A readout panel holds readouts, not controls.
         */
        <ToolResultPanel title="Rəqəmlər">
          <div className="divide-y divide-rule p-3">
            {numbers.map((row) => (
              <NumberRow
                key={row.label}
                label={row.label}
                value={row.value}
                note={row.note}
              />
            ))}
          </div>
        </ToolResultPanel>
      ),
    },
    {
      id: "ferziyyeler",
      label: "Fərziyyələr",
      content: (
        <div>
          <ul className="list-disc space-y-2 pl-4 text-sm/6 text-muted marker:text-muted">
            <li>«Ay» hər yerdə 30 gün sayılır.</li>
            <li>
              Gündəlik yük 86 400 saniyəyə bərabər paylanır; günün içindəki
              sıxlıq yalnız pik əmsalı ilə verilir.
            </li>
            <li>
              Diskdə yalnız yazılan gövdə qalır — indeks, WAL, sıxılma və backup
              bu hesaba daxil deyil.
            </li>
            <li>Keş yalnız oxuya təsir edir, yazma həmişə bazaya düşür.</li>
            <li>
              Node sayı pik ümumi RPS-ə görə çıxır; deploy və nasazlıq ehtiyatı
              üstünə ayrıca qoyulur.
            </li>
          </ul>
          <div className="mt-4">
            <ToolNote tone="info">
              Bu rəqəmlər dəqiq deyil,{" "}
              <strong className="font-semibold text-ink">
                böyüklük tərtibidir
              </strong>
              : 40 RPS ilə 400 RPS arasındakı fərq qərar dəyişdirir, 38 ilə 42
              arasındakı fərq isə yox.
            </ToolNote>
          </div>
        </div>
      ),
    },
    {
      id: "dusturlar",
      label: "Düsturlar",
      content: (
        <div className="divide-y divide-rule">
          <FormulaRow
            label="Əməliyyat / gün"
            body="DAU × istifadəçi başına əməliyyat"
          />
          <FormulaRow
            label="Yazma / gün"
            body="əməliyyat ÷ (oxu/yazma nisbəti + 1)"
          />
          <FormulaRow label="Oxu / gün" body="əməliyyat − yazma" />
          <FormulaRow label="Orta RPS" body="əməliyyat / gün ÷ 86 400" />
          <FormulaRow label="Pik RPS" body="orta RPS × pik əmsalı" />
          <FormulaRow
            label="Bazaya düşən oxu"
            body="oxu RPS × (1 − keş hit ÷ 100)"
          />
          <FormulaRow
            label="Lazım olan node"
            body="pik RPS ÷ node tutumu, yuxarı yuvarlaqlaşdırılıb"
          />
          <FormulaRow
            label="Gündəlik trafik"
            body="oxu × cavab ölçüsü + yazma × yazı ölçüsü"
          />
          <FormulaRow
            label="Saxlama"
            body="yazma / gün × yazı ölçüsü × saxlama günü × replikasiya"
          />
        </div>
      ),
    },
  ];

  return (
    /* The container, not the viewport: inside a window the two are unrelated.
       items-start, or the rail column stretches to the height of the form. */
    <div className="@container">
      <div className="grid gap-4 @min-[56rem]:grid-cols-[minmax(0,1fr)_19rem] @min-[56rem]:items-start">
        <div className="flex flex-col gap-4">
          <ToolPanel>
            <ToolPanelHeader
              title="Giriş dəyərləri"
              hint={activePreset?.name}
              action={
                <ToolButton size="chip" onClick={() => setForm(toForm(defaultScaleInput))}>
                  Sıfırla
                </ToolButton>
              }
            />

            {/* No bottom rule here: `ToolAccordion` draws its own top and
                bottom edges, and two adjacent 1px rules read as one thick one. */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <ToolLabel>Hazır ssenari</ToolLabel>
              {scalePresets.map((preset) => (
                <ToolButton
                  key={preset.id}
                  size="chip"
                  title={preset.note}
                  selected={activePreset?.id === preset.id}
                  onClick={() => setForm(toForm(preset.input))}
                >
                  {preset.name}
                </ToolButton>
              ))}
            </div>

            <ToolAccordion className="mx-3 mb-3">
              {groups.map((group, index) => {
                const groupBroken = group.fields.some((field) =>
                  broken.has(field.key),
                );

                return (
                  <ToolAccordionItem
                    key={group.id}
                    summary={group.title}
                    // Only the first group opens: the others carry their values
                    // in the hint, which is what makes the form a screen tall
                    // again.
                    defaultOpen={index === 0}
                    /* A shut group has to stay readable, so one unreadable
                       field marks the summary instead of replacing it: the
                       values beside it are still the ones the sum used. */
                    hint={
                      <span className="tabular-nums">
                        {group.summarise(applied)}
                        {groupBroken && (
                          <span className="ml-1.5 text-accent-text">· rəqəm deyil</span>
                        )}
                      </span>
                    }
                  >
                    {/* Its own container: the field pair splits when the
                        accordion body is wide enough, not when the page is. */}
                    <div className="@container">
                      <div className="grid gap-4 @min-[26rem]:grid-cols-2">
                        {group.fields.map((field) => (
                          <ToolField
                            key={field.key}
                            label={field.label}
                            htmlFor={`miqyas-${field.key}`}
                            note={field.hint}
                          >
                            <ToolInput
                              id={`miqyas-${field.key}`}
                              value={form[field.key]}
                              onChange={(event) =>
                                set(field.key, event.target.value)
                              }
                              inputMode="decimal"
                              autoComplete="off"
                              className="tabular-nums"
                            />
                          </ToolField>
                        ))}
                      </div>
                    </div>
                  </ToolAccordionItem>
                );
              })}
            </ToolAccordion>
          </ToolPanel>

          <ToolPanel>
            <div className="p-3">
              {invalid.length > 0 && (
                <div className="mb-3">
                  <ToolNote tone="accent" title="Rəqəm oxunmadı">
                    Bu sahələr rəqəm kimi başa düşülmədi — mötərizədə hesabın
                    onların yerinə işlətdiyi dəyər var:{" "}
                    <strong className="font-semibold text-ink">
                      {invalid.join(", ")}
                    </strong>
                    . Yalnız rəqəm yaz, vahid və hərf yazma.
                  </ToolNote>
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="mb-3 grid gap-2">
                  {result.warnings.map((warning) => (
                    <ToolNote key={warning} tone="accent">
                      {warning}
                    </ToolNote>
                  ))}
                </div>
              )}

              <ToolTabs idPrefix="miqyas-netice" items={tabs} />
            </div>
          </ToolPanel>
        </div>

        {/* The rail is pure readout — four computed numbers and a header that
            carries no control — so it takes the result ground whole. */}
        <ToolResultPanel
          title="Nəticə"
          hint={`${formatCompact(result.totalActionsPerDay)} əməliyyat / gün`}
        >
          {/* The four numbers a capacity decision turns on. The other seven are
              one tab away rather than one screen down.

              gap-3 rather than gap-4: a stat is a filled, padded card now, so
              its own padding supplies part of the air the bare gap had to. */}
          <div className="grid grid-cols-2 gap-3 p-3 @min-[56rem]:grid-cols-1">
            <ToolStat
              label="Pik RPS"
              value={`${rate(result.peakRps)} RPS`}
              note={`oxu ${rate(result.peakReadRps)} · yazma ${rate(result.peakWriteRps)}`}
              tone="accent"
            />
            {/* Past a hundred machines the answer stops being a capacity
                number and starts being an architecture question, which is the
                one reading on this rail that deserves the louder tone. */}
            <ToolStat
              label="Lazım olan node"
              value={result.nodes === null ? "—" : formatNumber(result.nodes)}
              /* With no capacity there is no division to describe: the note
                 used to read "pik RPS ÷ 0 RPS" under a value of "—". */
              note={
                result.nodes === null
                  ? "node tutumu sıfırdır — bölünəcək tutum yoxdur"
                  : `pik RPS ÷ ${formatNumber(applied.nodeCapacityRps)} RPS, yuxarı yuvarlaqlaşdırılıb`
              }
              tone={result.nodes !== null && result.nodes > 100 ? "warning" : "accent"}
            />
            <ToolStat
              label="Saxlama — replikasiya ilə"
              value={formatBytes(result.replicatedStorageBytes)}
              note={`hər qeyd ${formatNumber(applied.replication)} nüsxədə`}
              tone="accent"
            />
            <ToolStat
              label="Aylıq trafik"
              value={formatBytes(result.monthlyTrafficBytes)}
              note="30 gün üzrə"
            />
          </div>
        </ToolResultPanel>
      </div>
    </div>
  );
}
