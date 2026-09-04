"use client";

import { useEffect, useMemo, useState } from "react";
import { formatAzDate } from "../shared/az-date";
import { formatNumber } from "../shared/format";
import {
  cbarDateToIso,
  convertAmount,
  crossRate,
  invertRate,
  parseAmount,
  stripNominalPrefix,
  WORLD_CURRENCIES,
  type CbarRate,
} from "../lib/valyuta";
import {
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolStat,
} from "./ui";
import { ToolSegmented } from "./tabs";

type Mode = "cbar" | "world";
type Direction = "toAzn" | "fromAzn";

type TableState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: T };

type CbarData = { date: string; rates: CbarRate[] };
type WorldData = { date: string; usdRates: Record<string, number> };

/*
 * One fetch per table. Each hook call below owns its own state, and both
 * tables load independently so switching to the world mode never waits on
 * the AZN bulletin that mode does not use.
 */
async function fetchTable<T>(mode: Mode): Promise<TableState<T>> {
  try {
    const response = await fetch(`/api/alet/valyuta?mode=${mode}`);
    const body = (await response.json()) as { ok: true; data: T } | { ok: false; message: string };
    return body.ok ? { status: "success", data: body.data } : { status: "error", message: body.message };
  } catch {
    return { status: "error", message: "Sorğu göndərilmədi. İnternet bağlantısını yoxla." };
  }
}

export function ValyutaTool() {
  const [mode, setMode] = useState<Mode>("cbar");
  const [cbarState, setCbarState] = useState<TableState<CbarData>>({ status: "loading" });
  const [worldState, setWorldState] = useState<TableState<WorldData>>({ status: "loading" });

  // The AZN bulletin is the tool's whole point, so it loads immediately. The
  // world table is the secondary mode and only costs a request once a
  // visitor actually asks for it.
  useEffect(() => {
    let cancelled = false;
    fetchTable<CbarData>("cbar").then((result) => {
      if (!cancelled) setCbarState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== "world" || worldState.status !== "loading") return;
    let cancelled = false;
    fetchTable<WorldData>("world").then((result) => {
      if (!cancelled) setWorldState(result);
    });
    return () => {
      cancelled = true;
    };
    // `worldState.status` is read only to gate the first fetch, not to
    // trigger a refetch on every state change it itself causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="mt-8 space-y-5">
      <ToolNote>
        Bu alət heç bir mətn göndərmir — server Mərkəzi Bank (cbar.az) və Frankfurter
        (frankfurter.dev) cədvəllərini bütöv çəkir, çevirmə isə brauzerdə aparılır.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="valyuta"
          action={
            <ToolSegmented
              label="Rejim"
              value={mode}
              onChange={setMode}
              options={[
                { value: "cbar", label: "AZN məzənnəsi" },
                { value: "world", label: "Dünya valyutaları" },
              ]}
            />
          }
        />
        <div className="p-4">
          {mode === "cbar" ? <CbarConverter state={cbarState} /> : <WorldConverter state={worldState} />}
        </div>
      </ToolPanel>
    </div>
  );
}

function CbarConverter({ state }: { state: TableState<CbarData> }) {
  const [code, setCode] = useState("USD");
  const [direction, setDirection] = useState<Direction>("fromAzn");
  const [amountRaw, setAmountRaw] = useState("100");

  if (state.status === "loading") return <p className="font-ui text-sm text-muted">Yüklənir…</p>;
  if (state.status === "error") {
    return (
      <ToolNote tone="accent" title="Cədvəl gətirilmədi">
        {state.message}
      </ToolNote>
    );
  }

  const rates = state.data.rates;
  const selected = rates.find((rate) => rate.code === code) ?? rates[0];

  return (
    <div className="space-y-4">
      <ToolNote tone="info" title="Rəsmi tarix">
        {formatAzDate(cbarDateToIso(state.data.date))} tarixli Mərkəzi Bank məzənnəsi.
      </ToolNote>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
        <ToolField label="Valyuta" htmlFor="cbar-currency-select">
          <ToolSelect
            id="cbar-currency-select"
            value={selected?.code ?? ""}
            onChange={(event) => setCode(event.target.value)}
          >
            {rates.map((rate) => (
              <option key={rate.code} value={rate.code}>
                {rate.code} — {stripNominalPrefix(rate.nameAz, rate.nominal)}
              </option>
            ))}
          </ToolSelect>
        </ToolField>

        <ToolSegmented
          label="İstiqamət"
          value={direction}
          onChange={setDirection}
          options={[
            { value: "fromAzn", label: "AZN →" },
            { value: "toAzn", label: "→ AZN" },
          ]}
        />

        <ToolField label="Məbləğ" htmlFor="cbar-amount-input">
          <ToolInput
            id="cbar-amount-input"
            inputMode="decimal"
            value={amountRaw}
            onChange={(event) => setAmountRaw(event.target.value)}
          />
        </ToolField>
      </div>

      {selected && <CbarResult rate={selected} direction={direction} amountRaw={amountRaw} />}
    </div>
  );
}

function CbarResult({
  rate,
  direction,
  amountRaw,
}: {
  rate: CbarRate;
  direction: Direction;
  amountRaw: string;
}) {
  const amount = useMemo(() => parseAmount(amountRaw), [amountRaw]);
  const label = stripNominalPrefix(rate.nameAz, rate.nominal);

  if (!amount.ok) {
    return (
      <ToolNote tone="accent" title="Məbləğ yanlışdır">
        {amount.error}
      </ToolNote>
    );
  }

  // "fromAzn" means the field the visitor typed is the AZN side, so reaching
  // the foreign currency divides by the rate; "toAzn" multiplies the foreign
  // amount by it instead — the asymmetry `invertRate` exists to name.
  const result =
    direction === "fromAzn"
      ? convertAmount(amount.value, invertRate(rate.aznPerUnit))
      : convertAmount(amount.value, rate.aznPerUnit);

  return (
    <ToolResultPanel title="Nəticə">
      <div className="grid grid-cols-2 gap-3 p-4">
        <ToolStat
          label={direction === "fromAzn" ? "AZN" : label}
          value={formatNumber(amount.value, 2)}
        />
        <ToolStat
          label={direction === "fromAzn" ? label : "AZN"}
          value={formatNumber(result, 2)}
          tone="accent"
        />
      </div>
      <p className="px-4 pb-4 font-ui text-[11px] tabular-nums text-muted">
        1 {rate.code} = {formatNumber(rate.aznPerUnit, 4)} AZN
      </p>
    </ToolResultPanel>
  );
}

function WorldConverter({ state }: { state: TableState<WorldData> }) {
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("EUR");
  const [amountRaw, setAmountRaw] = useState("100");

  if (state.status === "loading") return <p className="font-ui text-sm text-muted">Yüklənir…</p>;
  if (state.status === "error") {
    return (
      <ToolNote tone="accent" title="Cədvəl gətirilmədi">
        {state.message}
      </ToolNote>
    );
  }

  return (
    <div className="space-y-4">
      <ToolNote tone="info" title="Mənbə tarixi">
        {formatAzDate(state.data.date)} tarixli Frankfurter kotirovkaları.
      </ToolNote>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
        <CurrencySelect id="world-from-select" label="Nədən" value={from} onChange={setFrom} />
        <button
          type="button"
          aria-label="İstiqaməti dəyiş"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          className="h-9 self-end border border-rule px-2 font-ui text-xs transition-colors duration-200 ease-out hover:text-accent-text"
        >
          ⇄
        </button>
        <CurrencySelect id="world-to-select" label="Nəyə" value={to} onChange={setTo} />

        <ToolField label="Məbləğ" htmlFor="world-amount-input">
          <ToolInput
            id="world-amount-input"
            inputMode="decimal"
            value={amountRaw}
            onChange={(event) => setAmountRaw(event.target.value)}
          />
        </ToolField>
      </div>

      <WorldResult usdRates={state.data.usdRates} from={from} to={to} amountRaw={amountRaw} />
    </div>
  );
}

function CurrencySelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ToolField label={label} htmlFor={id}>
      <ToolSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {WORLD_CURRENCIES.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.code} — {currency.nameAz}
          </option>
        ))}
      </ToolSelect>
    </ToolField>
  );
}

function WorldResult({
  usdRates,
  from,
  to,
  amountRaw,
}: {
  usdRates: Record<string, number>;
  from: string;
  to: string;
  amountRaw: string;
}) {
  const amount = useMemo(() => parseAmount(amountRaw), [amountRaw]);

  if (!amount.ok) {
    return (
      <ToolNote tone="accent" title="Məbləğ yanlışdır">
        {amount.error}
      </ToolNote>
    );
  }

  if (from === to) {
    return (
      <ToolResultPanel title="Nəticə">
        <div className="p-4">
          <ToolStat label={to} value={formatNumber(amount.value, 2)} tone="accent" />
        </div>
      </ToolResultPanel>
    );
  }

  const rate = crossRate(usdRates, from, to);
  const result = convertAmount(amount.value, rate);

  return (
    <ToolResultPanel title="Nəticə">
      <div className="grid grid-cols-2 gap-3 p-4">
        <ToolStat label={from} value={formatNumber(amount.value, 2)} />
        <ToolStat label={to} value={formatNumber(result, 2)} tone="accent" />
      </div>
      <p className="px-4 pb-4 font-ui text-[11px] tabular-nums text-muted">
        1 {from} = {formatNumber(rate, 4)} {to}
      </p>
    </ToolResultPanel>
  );
}
