"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import { ToolSegmented } from "./tabs";
import {
  BIT_WIDTHS,
  bitsToValue,
  bitwiseAnd,
  bitwiseNot,
  bitwiseOr,
  bitwiseXor,
  formatAllBases,
  parseInBase,
  shiftLeft,
  shiftRight,
  toTwosComplementBits,
  toUnsignedBits,
  toggleBit,
  type BitWidth,
} from "../lib/say-sistemi";

type BaseOption = "2" | "8" | "10" | "16" | "custom";
const BASE_OPTIONS: { value: BaseOption; label: string }[] = [
  { value: "2", label: "ikilik" },
  { value: "8", label: "səkkizlik" },
  { value: "10", label: "onluq" },
  { value: "16", label: "on altılıq" },
  { value: "custom", label: "başqa" },
];

type SignedOption = "signed" | "unsigned";

type BitOperation = "and" | "or" | "xor" | "not" | "shl" | "shr";
const OPERATION_OPTIONS: { value: BitOperation; label: string }[] = [
  { value: "and", label: "AND" },
  { value: "or", label: "OR" },
  { value: "xor", label: "XOR" },
  { value: "not", label: "NOT" },
  { value: "shl", label: "sola sürüşdür" },
  { value: "shr", label: "sağa sürüşdür" },
];

function clampBase(raw: number): number {
  if (!Number.isFinite(raw)) return 10;
  return Math.min(36, Math.max(2, Math.trunc(raw)));
}

function BitGrid({
  bits,
  onToggle,
}: {
  bits: string;
  onToggle: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Bit qutuları">
      {[...bits].map((bit, index) => (
        <ToolButton
          key={index}
          size="chip"
          selected={bit === "1"}
          className={`w-8 justify-center font-mono tabular-nums ${
            index > 0 && index % 8 === 0 ? "ml-2" : ""
          }`}
          onClick={() => onToggle(index)}
          aria-label={`Bit ${bits.length - index}, dəyər ${bit}`}
        >
          {bit}
        </ToolButton>
      ))}
    </div>
  );
}

function FourBaseGrid({ value }: { value: bigint }) {
  const bases = formatAllBases(value);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <ToolStat label="İkilik" value={bases.base2} />
      <ToolStat label="Səkkizlik" value={bases.base8} />
      <ToolStat label="Onluq" value={bases.base10} />
      <ToolStat label="On altılıq" value={bases.base16} />
    </div>
  );
}

export function SaySistemiTool() {
  const [value, setValue] = useState<bigint>(42n);
  const [baseOption, setBaseOption] = useState<BaseOption>("10");
  const [customBaseText, setCustomBaseText] = useState("36");
  const [inputText, setInputText] = useState("42");
  const [inputError, setInputError] = useState<string | null>(null);
  const [signedOption, setSignedOption] = useState<SignedOption>("signed");
  const [width, setWidth] = useState<BitWidth>(8);

  const [operation, setOperation] = useState<BitOperation>("and");
  const [operandText, setOperandText] = useState("15");
  const [shiftAmountText, setShiftAmountText] = useState("1");

  const signed = signedOption === "signed";
  const effectiveBase =
    baseOption === "custom" ? clampBase(Number(customBaseText)) : Number(baseOption);

  const applyText = (text: string, base: number) => {
    setInputText(text);
    const parsed = parseInBase(text, base);
    if (parsed.ok) {
      setValue(parsed.value);
      setInputError(null);
    } else {
      setInputError(parsed.error);
    }
  };

  const changeBaseOption = (next: BaseOption) => {
    setBaseOption(next);
    const base = next === "custom" ? clampBase(Number(customBaseText)) : Number(next);
    setInputText(value.toString(base));
    setInputError(null);
  };

  const changeCustomBaseText = (text: string) => {
    setCustomBaseText(text);
    if (baseOption === "custom") {
      const base = clampBase(Number(text));
      setInputText(value.toString(base));
      setInputError(null);
    }
  };

  const bitsResult = useMemo(
    () => (signed ? toTwosComplementBits(value, width) : toUnsignedBits(value, width)),
    [value, width, signed],
  );

  const onToggleBit = (index: number) => {
    if (!bitsResult.ok) return;
    const nextBits = toggleBit(bitsResult.bits, index);
    const nextValue = bitsToValue(nextBits, signed);
    setValue(nextValue);
    setInputText(nextValue.toString(effectiveBase));
    setInputError(null);
  };

  const operand = useMemo(
    () => parseInBase(operandText, effectiveBase),
    [operandText, effectiveBase],
  );
  const shiftAmount = Math.max(0, Math.min(width - 1, Math.trunc(Number(shiftAmountText)) || 0));

  const operationResult = useMemo((): bigint | null => {
    if (operation === "not") return bitwiseNot(value, width);
    if (operation === "shl") return shiftLeft(value, shiftAmount, width);
    if (operation === "shr") return shiftRight(value, shiftAmount, width, signed);
    if (!operand.ok) return null;
    if (operation === "and") return bitwiseAnd(value, operand.value, width);
    if (operation === "or") return bitwiseOr(value, operand.value, width);
    return bitwiseXor(value, operand.value, width);
  }, [operation, value, operand, width, shiftAmount, signed]);

  const operationValue =
    operationResult === null
      ? null
      : bitsToValue(operationResult.toString(2).padStart(width, "0"), signed);

  const needsOperand = operation === "and" || operation === "or" || operation === "xor";
  const needsAmount = operation === "shl" || operation === "shr";

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Giriş"
          action={
            <>
              <ToolSegmented
                label="Baza"
                value={baseOption}
                onChange={changeBaseOption}
                options={BASE_OPTIONS}
              />
              <ToolSegmented
                label="İşarə"
                value={signedOption}
                onChange={setSignedOption}
                options={[
                  { value: "signed", label: "işarəli" },
                  { value: "unsigned", label: "işarəsiz" },
                ]}
              />
              <ToolSegmented
                label="Bit eni"
                value={String(width) as `${BitWidth}`}
                onChange={(next) => setWidth(Number(next) as BitWidth)}
                options={BIT_WIDTHS.map((w) => ({ value: String(w) as `${BitWidth}`, label: `${w} bit` }))}
              />
            </>
          }
        />
        <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <ToolField
            label="Ədəd"
            hint={`${effectiveBase} bazasında`}
            note={inputError ?? undefined}
          >
            <ToolInput
              value={inputText}
              onChange={(event) => applyText(event.target.value, effectiveBase)}
              spellCheck={false}
              aria-invalid={inputError !== null}
            />
          </ToolField>
          {baseOption === "custom" && (
            <ToolField label="Xüsusi baza" hint="2–36">
              <ToolInput
                type="number"
                min={2}
                max={36}
                value={customBaseText}
                onChange={(event) => changeCustomBaseText(event.target.value)}
              />
            </ToolField>
          )}
        </div>
      </ToolPanel>

      <ToolResultPanel
        title="Dörd bazada"
        action={<CopyButton value={formatAllBases(value).base16} label="on altılıq kopyala" />}
      >
        <div className="p-4">
          <FourBaseGrid value={value} />
        </div>
      </ToolResultPanel>

      <ToolPanel>
        <ToolPanelHeader title="Bit görünüşü" hint={`${width} bit`} />
        <div className="space-y-3 p-4">
          {bitsResult.ok ? (
            <BitGrid bits={bitsResult.bits} onToggle={onToggleBit} />
          ) : (
            <ToolNote tone="accent">{bitsResult.error}</ToolNote>
          )}
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader
          title="Bit əməliyyatları"
          action={
            <ToolSegmented
              label="Əməliyyat"
              value={operation}
              onChange={setOperation}
              options={OPERATION_OPTIONS}
            />
          }
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {needsOperand && (
            <ToolField
              label="İkinci ədəd"
              hint={`${effectiveBase} bazasında`}
              note={!operand.ok ? operand.error : undefined}
            >
              <ToolInput
                value={operandText}
                onChange={(event) => setOperandText(event.target.value)}
                spellCheck={false}
                aria-invalid={!operand.ok}
              />
            </ToolField>
          )}
          {needsAmount && (
            <ToolField label="Sürüşdürmə miqdarı" hint={`0–${width - 1}`}>
              <ToolInput
                type="number"
                min={0}
                max={width - 1}
                value={shiftAmountText}
                onChange={(event) => setShiftAmountText(event.target.value)}
              />
            </ToolField>
          )}
        </div>

        {operationValue !== null && (
          <div className="space-y-3 p-4 pt-0">
            <FourBaseGrid value={operationValue} />
            <p className="font-mono text-sm break-all">
              {operationResult?.toString(2).padStart(width, "0")}
            </p>
          </div>
        )}
      </ToolPanel>
    </div>
  );
}
