"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ToolButton, ToolResultPanel } from "./ui";
import {
  answersFromQuery,
  answersToQuery,
  DEADLINES,
  DEFAULT_ANSWERS,
  estimate,
  FEATURES,
  MAX_INTEGRATIONS,
  normaliseIntegrations,
  PROJECT_KINDS,
  SCALES,
  type Answers,
  type FeatureId,
} from "../lib/estimate";

/*
 * The four questions and the result. Everything it knows is in the URL, so a
 * visitor can send the page to a colleague and the browser's back button walks
 * back through the questions instead of leaving the tool.
 *
 * The arithmetic is not here — it is in `lib/tools/estimate.ts`, where it can
 * be proved by `pnpm verify:tools`.
 */

const STEPS = ["Nə qurulur?", "İçində nə var?", "Miqyas", "Tarix"] as const;

const card =
  "w-full rounded border border-rule bg-surface px-3 py-2.5 text-left text-sm transition-colors duration-200 ease-out hover:bg-hover focus-visible:bg-hover";
const chosen = "border-accent";

function Choice({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`${card} ${selected ? chosen : ""}`}
    >
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`grid size-4 shrink-0 place-items-center rounded-xs border text-[0.6rem] leading-none ${
            selected ? "border-accent text-accent" : "border-rule text-transparent"
          }`}
        >
          ✓
        </span>
        {label}
      </span>
    </button>
  );
}

function StepHeading({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <p className="font-ui text-xs text-muted">
      <span className="tabular-nums">
        {index + 1}/{STEPS.length}
      </span>{" "}
      · {children}
    </p>
  );
}

export function Estimator() {
  /*
   * The link is the starting state, and it is read through the framework's
   * hook rather than from `window`: the page is prerendered, so reading the
   * location during the first render would make the server's HTML and the
   * browser's disagree. Until the visitor touches something, the answers are
   * whatever the link said; after that the local state wins, because from then
   * on the tool is the one writing the URL.
   */
  const params = useSearchParams();
  const [chosenAnswers, setChosenAnswers] = useState<Answers | null>(null);
  const [chosenDone, setChosenDone] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);

  /* Memoised, so the effect below is not handed a freshly built object on
     every render and does not rewrite the URL for nothing. */
  const linkAnswers = useMemo(() => answersFromQuery(params.toString()), [params]);
  const answers = chosenAnswers ?? linkAnswers;
  const done = chosenDone ?? params.get("s") === "1";

  const setAnswers = (next: Answers | ((current: Answers) => Answers)) =>
    setChosenAnswers(typeof next === "function" ? next(answers) : next);
  const setDone = setChosenDone;

  /*
   * The answers are written back into the link, but only once the visitor has
   * actually chosen something, and keyed on the query *string* rather than on
   * the answers object.
   *
   * Both halves of that sentence are a bug that happened. The app router
   * intercepts `history.replaceState`, so writing the URL updates
   * `useSearchParams`, which rebuilt the answers object, which re-ran the
   * effect, which wrote the URL again — the page span until the first click
   * timed out. A string does not change identity, and an untouched form has no
   * business rewriting the address bar at all.
   */
  const query = answersToQuery(answers) + (done ? "&s=1" : "");
  const touched = chosenAnswers !== null || chosenDone !== null;

  useEffect(() => {
    if (!touched) return;
    /*
     * Only where the tool is the page. The same component also runs inside a
     * window on the desktop, and there the address bar belongs to the desktop:
     * it carries which windows are open, and writing answers over that would
     * close them on the next reload.
     */
    if (!window.location.pathname.startsWith("/alet")) return;
    /* `replaceState`, not `push`: one history entry per checkbox would turn the
       back button into an undo key. */
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [query, touched]);

  const result = estimate(answers);

  function toggleFeature(id: FeatureId) {
    setAnswers((current) => ({
      ...current,
      features: current.features.includes(id)
        ? current.features.filter((f) => f !== id)
        : [...current.features, id],
    }));
  }

  if (done) {
    return (
      <div className="mt-8 space-y-8">
        {/* The estimate itself, and the one block on this screen that was
            drawn on `bg-surface` — the colour of something you type into,
            for a number nobody typed. The three lists under it carry no
            surface at all, so they were never mistakable for input and stay
            plain sections: giving every one of them the result ground would
            flatten the page back out. */}
        <ToolResultPanel title="Təxmini müddət">
          <div className="p-5">
            <p className="font-ui text-[2rem]/[1.1] font-semibold">
              <span className="tabular-nums">
                {result.total.min}–{result.total.max}
              </span>{" "}
              iş günü
            </p>
            <p className="mt-2 text-sm text-muted">
              Aralıqdır, söz deyil. Ölçü iş günüdür: bir nəfərin süni intellektlə işlədiyi
              templə hesablanır, komanda norması ilə yox.
            </p>
          </div>
        </ToolResultPanel>

        <section>
          <h2 className="font-ui text-sm text-muted">Mərhələlər</h2>
          <ul className="mt-4">
            {result.phases.map((phase) => (
              <li
                key={phase.id}
                className="flex items-baseline justify-between gap-4 border-b border-rule py-2 text-sm"
              >
                <span>{phase.name}</span>
                <span className="shrink-0 font-ui text-xs text-muted">
                  <span className="tabular-nums">
                    {phase.days.min}–{phase.days.max}
                  </span>{" "}
                  gün
                </span>
              </li>
            ))}
          </ul>
        </section>

        {result.risks.length > 0 && (
          <section>
            <h2 className="font-ui text-sm text-muted">Nəyə diqqət etmək lazımdır</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {result.risks.map((risk) => (
                <li key={risk} className="border-b border-rule py-2">
                  {risk}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="font-ui text-sm text-muted">Bu aralığa nə daxil deyil</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {result.assumptions.map((line) => (
              <li key={line} className="border-b border-rule py-2">
                {line}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-ui text-sm text-muted">Bu təxmini göndərmək istəyirsən?</h2>
          <p className="mt-2 text-sm text-muted">
            Bu forma əsas saytdadır:{" "}
            <a
              href="https://camalali.com/alet/qiymetlendirici"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-rule underline-offset-4 hover:text-accent"
            >
              camalali.com/alet/qiymetlendirici
            </a>
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <ToolButton
            onClick={() => {
              setDone(false);
              setStep(0);
            }}
          >
            cavabları dəyiş
          </ToolButton>
          <ToolButton
            onClick={() => {
              setAnswers(DEFAULT_ANSWERS);
              setDone(false);
              setStep(0);
            }}
          >
            yenidən başla
          </ToolButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <StepHeading index={step}>{STEPS[step]}</StepHeading>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {step === 0 &&
          PROJECT_KINDS.map((kind) => (
            <Choice
              key={kind.id}
              label={kind.label}
              selected={answers.kind === kind.id}
              onSelect={() => setAnswers((c) => ({ ...c, kind: kind.id }))}
            />
          ))}

        {step === 1 &&
          FEATURES.map((feature) => (
            <Choice
              key={feature.id}
              label={feature.label}
              selected={answers.features.includes(feature.id)}
              onSelect={() => toggleFeature(feature.id)}
            />
          ))}

        {step === 2 &&
          SCALES.map((scale) => (
            <Choice
              key={scale.id}
              label={scale.label}
              selected={answers.scale === scale.id}
              onSelect={() => setAnswers((c) => ({ ...c, scale: scale.id }))}
            />
          ))}

        {step === 3 &&
          DEADLINES.map((deadline) => (
            <Choice
              key={deadline.id}
              label={deadline.label}
              selected={answers.deadline === deadline.id}
              onSelect={() => setAnswers((c) => ({ ...c, deadline: deadline.id }))}
            />
          ))}
      </div>

      {step === 1 && (
        <label className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-ui text-xs text-muted">Neçə xarici xidmətə bağlanır?</span>
          <input
            type="number"
            min={0}
            max={MAX_INTEGRATIONS}
            value={answers.integrations}
            /* Clamped where it is typed, not only where it is priced. The field
               used to accept 999: the estimate was computed at the ceiling of
               6, the link carried i=999 and the enquiry sent to the contact
               form said "İnteqrasiya sayı: 999". */
            onChange={(event) =>
              setAnswers((c) => ({
                ...c,
                integrations: normaliseIntegrations(Number(event.target.value)),
              }))
            }
            className="w-20 rounded border border-rule bg-paper px-2.5 py-1.5 text-sm outline-none focus-visible:border-accent"
          />
        </label>
      )}

      {step === 2 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Choice
            label="İşləyən sistem var, ona toxunulacaq"
            selected={answers.existingSystem}
            onSelect={() => setAnswers((c) => ({ ...c, existingSystem: !c.existingSystem }))}
          />
          <Choice
            label="Köhnə məlumat köçürülməlidir"
            selected={answers.migration}
            onSelect={() => setAnswers((c) => ({ ...c, migration: !c.migration }))}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ToolButton disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          geri
        </ToolButton>
        <ToolButton
          className="font-semibold"
          onClick={() => (step === STEPS.length - 1 ? setDone(true) : setStep((s) => s + 1))}
        >
          {step === STEPS.length - 1 ? "nəticəni göstər" : "növbəti"}
        </ToolButton>
        <span className="font-ui text-xs text-muted">
          hazırkı aralıq:{" "}
          <span className="tabular-nums">
            {result.total.min}–{result.total.max}
          </span>{" "}
          iş günü
        </span>
      </div>
    </div>
  );
}
