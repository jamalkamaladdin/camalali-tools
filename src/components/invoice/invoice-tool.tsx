"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { addDays, todayIso } from "@/lib/az-date";
import { calculateInvoice } from "@/lib/invoice/calc";
import { formatMoney } from "@/lib/invoice/money";
import { emptyParty, UNITS, type Invoice, type LineItem, type Party } from "@/lib/invoice/types";
import { Field, Select, TextArea, TextInput } from "./fields";
import { InvoicePreview } from "./invoice-preview";

const SELLER_KEY = "faktura.satici.v1";

const emptyItem = (id: string): LineItem => ({
  id,
  description: "",
  unit: "ədəd",
  quantity: 1,
  unitPrice: 0,
});

// Server-rendered starting point: no `Date` call here, otherwise the static HTML
// and the first client render disagree.
const baseInvoice: Invoice = {
  number: "1",
  date: "",
  dueDate: "",
  seller: emptyParty(),
  buyer: emptyParty(),
  items: [emptyItem("line-1")],
  vatRate: 18,
  vatIncluded: false,
  discountPercent: 0,
  note: "",
};

const sampleSeller: Party = {
  name: 'MMC "Nümunə"',
  taxId: "1234567891",
  address: "Bakı, Nizami küç. 10",
  phone: "+994 12 000 00 00",
  email: "info@numune.az",
  bankName: "Nümunə Bank ASC",
  iban: "AZ00NABZ00000000000000000000",
  bankCode: "000000",
  swift: "NUMNAZ22",
};

type PartyKey = "seller" | "buyer";

type ClientDefaults = { today: string; seller: Party | null };

// Today's date and the remembered seller live outside React, so they are read
// through useSyncExternalStore instead of an effect that writes state back.
// The result is cached: getSnapshot must return a stable reference.
let cachedDefaults: ClientDefaults | null = null;

function readClientDefaults(): ClientDefaults {
  if (cachedDefaults) return cachedDefaults;

  let seller: Party | null = null;
  try {
    const raw = window.localStorage.getItem(SELLER_KEY);
    if (raw) seller = { ...emptyParty(), ...JSON.parse(raw) } as Party;
  } catch {
    seller = null;
  }

  cachedDefaults = { today: todayIso(), seller };
  return cachedDefaults;
}

const subscribeToNothing = () => () => {};

export function InvoiceTool() {
  const defaults = useSyncExternalStore(
    subscribeToNothing,
    readClientDefaults,
    () => null,
  );
  const [edited, setEdited] = useState<Invoice | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const prefilled = useMemo<Invoice>(() => {
    if (!defaults) return baseInvoice;
    return {
      ...baseInvoice,
      date: defaults.today,
      dueDate: addDays(defaults.today, 14),
      seller: defaults.seller ?? baseInvoice.seller,
    };
  }, [defaults]);

  const invoice = edited ?? prefilled;
  const restored = justSaved || Boolean(defaults?.seller);
  const setInvoice = (next: (current: Invoice) => Invoice) =>
    setEdited(next(invoice));

  const totals = calculateInvoice(invoice);

  const setParty = (key: PartyKey, field: keyof Party, value: string) =>
    setInvoice((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));

  const setItem = (id: string, field: keyof LineItem, value: string) =>
    setInvoice((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]:
                field === "quantity" || field === "unitPrice"
                  ? Number(value.replace(",", "."))
                  : value,
            }
          : item,
      ),
    }));

  const addItem = () =>
    setInvoice((current) => ({
      ...current,
      items: [...current.items, emptyItem(`line-${Date.now()}`)],
    }));

  const removeItem = (id: string) =>
    setInvoice((current) => ({
      ...current,
      items:
        current.items.length > 1
          ? current.items.filter((item) => item.id !== id)
          : current.items,
    }));

  const saveSeller = () => {
    try {
      window.localStorage.setItem(SELLER_KEY, JSON.stringify(invoice.seller));
      cachedDefaults = { ...readClientDefaults(), seller: invoice.seller };
      setJustSaved(true);
    } catch {
      // Private mode or a full quota — the invoice still works, only the
      // convenience of remembering the seller is lost.
    }
  };

  const fillSample = () =>
    setInvoice((current) => ({
      ...current,
      seller: current.seller.name ? current.seller : sampleSeller,
      buyer: {
        ...emptyParty(),
        name: 'MMC "Alıcı"',
        taxId: "9876543211",
        address: "Bakı, Xaqani küç. 5",
      },
      items: [
        {
          id: "line-1",
          description: "Veb saytın hazırlanması",
          unit: "xidmət",
          quantity: 1,
          unitPrice: 2500,
        },
        {
          id: "line-2",
          description: "Aylıq texniki dəstək",
          unit: "ay",
          quantity: 3,
          unitPrice: 300,
        },
      ],
    }));

  const partyFields: [keyof Party, string, string?][] = [
    ["name", "Ad / şirkət"],
    ["taxId", "VÖEN"],
    ["address", "Ünvan"],
    ["phone", "Telefon"],
    ["email", "E-poçt"],
    ["bankName", "Bank"],
    ["iban", "IBAN"],
    ["bankCode", "Bank kodu"],
    ["swift", "SWIFT"],
  ];

  return (
    <div className="print-shell grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="no-print space-y-6">
        <section className="rounded-md border border-line bg-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold">Faktura</h2>
            <button
              type="button"
              onClick={fillSample}
              className="text-[13px] font-medium text-accent hover:underline"
            >
              Nümunə ilə doldur
            </button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Nömrə">
              <TextInput
                value={invoice.number}
                onChange={(event) =>
                  setInvoice((current) => ({ ...current, number: event.target.value }))
                }
              />
            </Field>
            <Field label="Tarix">
              <TextInput
                type="date"
                value={invoice.date}
                onChange={(event) =>
                  setInvoice((current) => ({ ...current, date: event.target.value }))
                }
              />
            </Field>
            <Field label="Ödəniş tarixi">
              <TextInput
                type="date"
                value={invoice.dueDate}
                onChange={(event) =>
                  setInvoice((current) => ({ ...current, dueDate: event.target.value }))
                }
              />
            </Field>
          </div>
        </section>

        {(["seller", "buyer"] as PartyKey[]).map((key) => (
          <section
            key={key}
            className="rounded-md border border-line bg-surface p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold">
                {key === "seller" ? "Satıcı" : "Alıcı"}
              </h2>
              {key === "seller" && (
                <button
                  type="button"
                  onClick={saveSeller}
                  className="text-[13px] font-medium text-accent hover:underline"
                >
                  {restored ? "Yadda saxlanılıb ✓" : "Bu brauzerdə yadda saxla"}
                </button>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {partyFields.map(([field, label]) => (
                <Field key={field} label={label}>
                  <TextInput
                    value={invoice[key][field]}
                    onChange={(event) => setParty(key, field, event.target.value)}
                  />
                </Field>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-md border border-line bg-surface p-6">
          <h2 className="text-[16px] font-semibold">Sətirlər</h2>
          <div className="mt-4 space-y-4">
            {invoice.items.map((item, index) => (
              <div
                key={item.id}
                className="rounded-md border border-line bg-subtle/60 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-ink-faint">
                    {index + 1}. sətir
                  </span>
                  {invoice.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-[13px] text-ink-faint transition-colors hover:text-danger"
                    >
                      Sil
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Təsvir">
                      <TextInput
                        value={item.description}
                        placeholder="Xidmətin və ya malın adı"
                        onChange={(event) =>
                          setItem(item.id, "description", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Miqdar">
                    <TextInput
                      inputMode="decimal"
                      value={String(item.quantity)}
                      onChange={(event) =>
                        setItem(item.id, "quantity", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Vahid">
                    <Select
                      value={item.unit}
                      onChange={(event) => setItem(item.id, "unit", event.target.value)}
                    >
                      {UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Vahidin qiyməti (₼)">
                    <TextInput
                      inputMode="decimal"
                      value={String(item.unitPrice)}
                      onChange={(event) =>
                        setItem(item.id, "unitPrice", event.target.value)
                      }
                    />
                  </Field>
                  <div className="flex items-end">
                    <p className="text-[13px] text-ink-muted">
                      Sətrin məbləği:{" "}
                      <span className="font-semibold text-ink tabular-nums">
                        {formatMoney(totals.lineTotals[index] ?? 0)} ₼
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
            onClick={addItem}
          >
            + Sətir əlavə et
          </Button>
        </section>

        <section className="rounded-md border border-line bg-surface p-6">
          <h2 className="text-[16px] font-semibold">ƏDV və endirim</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="ƏDV">
              <Select
                value={invoice.vatRate === 0 ? "yox" : invoice.vatIncluded ? "daxil" : "elave"}
                onChange={(event) => {
                  const mode = event.target.value;
                  setInvoice((current) => ({
                    ...current,
                    vatRate: mode === "yox" ? 0 : 18,
                    vatIncluded: mode === "daxil",
                  }));
                }}
              >
                <option value="elave">18% — qiymətin üstünə əlavə olunur</option>
                <option value="daxil">18% — qiymətə daxildir</option>
                <option value="yox">ƏDV tutulmur</option>
              </Select>
            </Field>
            <Field label="Endirim (%)">
              <TextInput
                inputMode="decimal"
                value={String(invoice.discountPercent)}
                onChange={(event) =>
                  setInvoice((current) => ({
                    ...current,
                    discountPercent: Number(event.target.value.replace(",", ".")),
                  }))
                }
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Qeyd" hint="Fakturanın altında görünür — ödəniş şərti, müqavilə nömrəsi.">
              <TextArea
                rows={3}
                value={invoice.note}
                onChange={(event) =>
                  setInvoice((current) => ({ ...current, note: event.target.value }))
                }
              />
            </Field>
          </div>
        </section>
      </div>

      <div className="print-shell lg:sticky lg:top-24">
        <div className="no-print mb-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink-muted">Önizləmə</p>
          <Button type="button" onClick={() => window.print()}>
            Çap et / PDF kimi saxla
          </Button>
        </div>
        <div className="print-shell overflow-hidden rounded-md border border-line shadow-card">
          <InvoicePreview invoice={invoice} />
        </div>
      </div>
    </div>
  );
}
