"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
} from "./ui";
import {
  generateAnimation,
  type AnimationConfig,
  type AnimationDirection,
  type AnimationFillMode,
  type TransformOp,
} from "../lib/animasiya";

type StepForm = {
  id: number;
  offset: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotate: number;
  opacityEnabled: boolean;
  opacity: number;
};

const DEFAULT_STEPS: StepForm[] = [
  { id: 1, offset: 0, translateX: 0, translateY: -20, scale: 1, rotate: 0, opacityEnabled: true, opacity: 0 },
  { id: 2, offset: 100, translateX: 0, translateY: 0, scale: 1, rotate: 0, opacityEnabled: true, opacity: 1 },
];

const TIMING_PRESETS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out"];

function stepToKeyframeStep(step: StepForm): { offset: number; transforms: TransformOp[]; opacity?: number } {
  const transforms: TransformOp[] = [];
  if (step.translateX !== 0) transforms.push({ kind: "translateX", value: step.translateX });
  if (step.translateY !== 0) transforms.push({ kind: "translateY", value: step.translateY });
  if (step.scale !== 1) transforms.push({ kind: "scale", value: step.scale });
  if (step.rotate !== 0) transforms.push({ kind: "rotate", value: step.rotate });
  return { offset: step.offset, transforms, opacity: step.opacityEnabled ? step.opacity : undefined };
}

export function AnimasiyaTool() {
  const reactId = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const nextId = useRef(3);

  const [name, setName] = useState("menim-animasiyam");
  const [steps, setSteps] = useState<StepForm[]>(DEFAULT_STEPS);
  const [durationMs, setDurationMs] = useState(600);
  const [delayMs, setDelayMs] = useState(0);
  const [infinite, setInfinite] = useState(false);
  const [iterationCount, setIterationCount] = useState(1);
  const [direction, setDirection] = useState<AnimationDirection>("normal");
  const [fillMode, setFillMode] = useState<AnimationFillMode>("both");
  const [timingFunction, setTimingFunction] = useState("ease-out");
  const [replayKey, setReplayKey] = useState(0);

  const config: AnimationConfig = useMemo(
    () => ({
      name,
      steps: steps.map(stepToKeyframeStep),
      durationMs,
      delayMs,
      iterationCount: infinite ? "infinite" : iterationCount,
      direction,
      fillMode,
      timingFunction,
    }),
    [name, steps, durationMs, delayMs, infinite, iterationCount, direction, fillMode, timingFunction],
  );

  const result = useMemo(() => generateAnimation(config), [config]);

  const previewName = `animasiya-onizleme-${reactId}`;
  const previewResult = useMemo(
    () => generateAnimation({ ...config, name: previewName }),
    [config, previewName],
  );

  const updateStep = (id: number, patch: Partial<StepForm>) => {
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  };

  const addStep = () => {
    const id = nextId.current++;
    setSteps((prev) => [
      ...prev,
      { id, offset: 50, translateX: 0, translateY: 0, scale: 1, rotate: 0, opacityEnabled: false, opacity: 1 },
    ]);
  };

  const removeStep = (id: number) => {
    setSteps((prev) => (prev.length > 1 ? prev.filter((step) => step.id !== id) : prev));
  };

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Ad və vaxtlama" />
        <div className="grid grid-cols-2 gap-3 p-4 min-[560px]:grid-cols-4">
          <ToolField label="Animasiya adı" htmlFor="animasiya-name">
            <ToolInput
              id="animasiya-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              spellCheck={false}
            />
          </ToolField>
          <ToolField label="Müddət" htmlFor="animasiya-duration" suffix="ms">
            <ToolInput
              id="animasiya-duration"
              type="number"
              min={0}
              step={50}
              value={durationMs}
              onChange={(event) => setDurationMs(Number(event.target.value))}
            />
          </ToolField>
          <ToolField label="Gecikmə" htmlFor="animasiya-delay" suffix="ms">
            <ToolInput
              id="animasiya-delay"
              type="number"
              min={0}
              step={50}
              value={delayMs}
              onChange={(event) => setDelayMs(Number(event.target.value))}
            />
          </ToolField>
          <ToolField label="Təkrar sayı" htmlFor="animasiya-iteration">
            <div className="flex items-center gap-2">
              <ToolInput
                id="animasiya-iteration"
                type="number"
                min={1}
                step={1}
                disabled={infinite}
                value={iterationCount}
                onChange={(event) => setIterationCount(Number(event.target.value))}
                className="w-20"
              />
              <label className="flex items-center gap-1.5 font-ui text-ios-footnote text-muted">
                <input
                  type="checkbox"
                  checked={infinite}
                  onChange={(event) => setInfinite(event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                sonsuz
              </label>
            </div>
          </ToolField>

          <ToolField label="İstiqamət" htmlFor="animasiya-direction">
            <ToolSelect
              id="animasiya-direction"
              value={direction}
              onChange={(event) => setDirection(event.target.value as AnimationDirection)}
            >
              <option value="normal">normal</option>
              <option value="reverse">reverse</option>
              <option value="alternate">alternate</option>
              <option value="alternate-reverse">alternate-reverse</option>
            </ToolSelect>
          </ToolField>
          <ToolField label="Son vəziyyət" htmlFor="animasiya-fill">
            <ToolSelect
              id="animasiya-fill"
              value={fillMode}
              onChange={(event) => setFillMode(event.target.value as AnimationFillMode)}
            >
              <option value="none">none</option>
              <option value="forwards">forwards</option>
              <option value="backwards">backwards</option>
              <option value="both">both</option>
            </ToolSelect>
          </ToolField>
          <ToolField label="Asanlıq" htmlFor="animasiya-timing" className="col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <ToolInput
                id="animasiya-timing"
                value={timingFunction}
                onChange={(event) => setTimingFunction(event.target.value)}
                className="min-w-32 flex-1 font-mono"
                spellCheck={false}
              />
              {TIMING_PRESETS.map((preset) => (
                <ToolButton
                  key={preset}
                  size="chip"
                  selected={timingFunction === preset}
                  onClick={() => setTimingFunction(preset)}
                >
                  {preset}
                </ToolButton>
              ))}
            </div>
          </ToolField>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Addımlar"
          hint={`${steps.length} addım`}
          action={
            <ToolButton size="chip" onClick={addStep}>
              + Addım
            </ToolButton>
          }
        />
        <div className="space-y-3 p-4">
          {steps.map((step) => (
            <div key={step.id} className="rounded border border-rule p-3">
              <div className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-6">
                <ToolField label="Faiz" htmlFor={`step-${step.id}-offset`} suffix="%">
                  <ToolInput
                    id={`step-${step.id}-offset`}
                    type="number"
                    min={0}
                    max={100}
                    value={step.offset}
                    onChange={(event) => updateStep(step.id, { offset: Number(event.target.value) })}
                  />
                </ToolField>
                <ToolField label="X sürüşmə" htmlFor={`step-${step.id}-tx`} suffix="px">
                  <ToolInput
                    id={`step-${step.id}-tx`}
                    type="number"
                    step={1}
                    value={step.translateX}
                    onChange={(event) => updateStep(step.id, { translateX: Number(event.target.value) })}
                  />
                </ToolField>
                <ToolField label="Y sürüşmə" htmlFor={`step-${step.id}-ty`} suffix="px">
                  <ToolInput
                    id={`step-${step.id}-ty`}
                    type="number"
                    step={1}
                    value={step.translateY}
                    onChange={(event) => updateStep(step.id, { translateY: Number(event.target.value) })}
                  />
                </ToolField>
                <ToolField label="Böyütmə" htmlFor={`step-${step.id}-scale`}>
                  <ToolInput
                    id={`step-${step.id}-scale`}
                    type="number"
                    step={0.05}
                    value={step.scale}
                    onChange={(event) => updateStep(step.id, { scale: Number(event.target.value) })}
                  />
                </ToolField>
                <ToolField label="Fırlanma" htmlFor={`step-${step.id}-rotate`} suffix="deg">
                  <ToolInput
                    id={`step-${step.id}-rotate`}
                    type="number"
                    step={5}
                    value={step.rotate}
                    onChange={(event) => updateStep(step.id, { rotate: Number(event.target.value) })}
                  />
                </ToolField>
                <div className="flex items-end justify-between gap-2">
                  <ToolField label="Şəffaflıq" htmlFor={`step-${step.id}-opacity`}>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={step.opacityEnabled}
                        onChange={(event) => updateStep(step.id, { opacityEnabled: event.target.checked })}
                        className="size-4 accent-[var(--color-accent)]"
                      />
                      <ToolInput
                        id={`step-${step.id}-opacity`}
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        disabled={!step.opacityEnabled}
                        value={step.opacity}
                        onChange={(event) => updateStep(step.id, { opacity: Number(event.target.value) })}
                        className="w-20"
                      />
                    </div>
                  </ToolField>
                  <ToolButton size="chip" onClick={() => removeStep(step.id)} disabled={steps.length <= 1}>
                    Sil
                  </ToolButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ToolPanel>

      {result.errors.length > 0 ? (
        <ToolNote tone="accent" title="Düzəlt">
          <ul className="list-disc space-y-1 pl-4">
            {result.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </ToolNote>
      ) : (
        <>
          <ToolPanel>
            <ToolPanelHeader
              title="Canlı önizləmə"
              action={
                <ToolButton size="chip" onClick={() => setReplayKey((value) => value + 1)}>
                  Yenidən oynat
                </ToolButton>
              }
            />
            <div className="flex min-h-32 items-center justify-center p-6">
              {previewResult.keyframes && (
                <style>{previewResult.keyframes}</style>
              )}
              <div
                key={replayKey}
                className="flex size-16 items-center justify-center rounded-lg bg-accent text-ios-footnote accent-text"
                style={{
                  animationName: previewName,
                  animationDuration: `${config.durationMs}ms`,
                  animationDelay: `${config.delayMs}ms`,
                  animationTimingFunction: config.timingFunction,
                  animationIterationCount: config.iterationCount === "infinite" ? "infinite" : config.iterationCount,
                  animationDirection: config.direction,
                  animationFillMode: config.fillMode,
                }}
              >
                qutu
              </div>
            </div>
          </ToolPanel>

          <ToolResultPanel title="CSS" action={result.css && <CopyButton value={result.css} />}>
            <div className="p-4">
              <ToolOutput>{result.css}</ToolOutput>
            </div>
          </ToolResultPanel>
        </>
      )}
    </div>
  );
}
