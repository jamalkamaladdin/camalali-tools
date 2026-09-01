"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { addDays, todayIso } from "@/lib/az-date";
import { calculateInvoice } from "@/lib/invoice/calc";
import { formatMoney } from "@/lib/invoice/money";
import { emptyParty, UNITS, type Invoice, type LineItem, type Party } from "@/lib/invoice/types";
import { Field, Section, Select, TextArea, TextButton, TextInput } from "./fields";
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

const partyIsFilled = (party: Party) =>
  Object.values(party).some((value) => value.trim().length > 0);

type PartyKey = "seller" | "buyer";

const MAIN_FIELDS: [keyof Party, string][] = [
  ["taxId", "VÖEN"],
  ["address", "Ünvan"],
  ["phone", "Telefon"],
  ["email", "E-poçt"],
];

const BANK_FIELDS: [keyof Party, string][] = [
  ["bankName", "Bank"],
  ["iban", "IBAN"],
  ["bankCode", "Bank kodu"],
  ["swift", "SWIFT"],
];

export function InvoiceTool() {
  const defaults = useSyncExternalStore(
    subscribeToNothing,
    readClientDefaults,
    () => null,
  );
  const [edited, setEdited] = useState<Invoice | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [openParty, setOpenParty] = useState<PartyKey | null>("seller");
  const [buyerBankOpen, setBuyerBankOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
      // Private mode or a full quota: the invoice still works, only the
      // convenience of remembering the seller is lost.
    }
  };

  const fillSample = () =>
    setInvoice((current) => ({
      ...current,
      seller: partyIsFilled(current.seller) ? current.seller : sampleSeller,
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

  const downloadPdf = async () => {
    setBusy(true);
    try {
      // Loaded on demand: the PDF builder and its embedded font never enter the
      // first page load.
      const { buildInvoicePdf, invoicePdfFileName } = await import(
        "@/lib/invoice/pdf"
      );
      const bytes = await buildInvoicePdf(invoice);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = invoicePdfFileName(invoice);
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const partyForm = (key: PartyKey) => {
    const party = invoice[key];
    const showBank = key === "seller" || buyerBankOpen;

    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ad / şirkət" className="sm:col-span-2">
          <TextInput
            value={party.name}
            placeholder={key === "seller" ? "Sənin adın və ya şirkətin" : "Kimə göndərilir"}
            onChange={(event) => setParty(key, "name", event.target.value)}
          />
        </Field>

        {MAIN_FIELDS.map(([field, label]) => (
          <Field key={field} label={label}>
            <TextInput
              value={party[field]}
              onChange={(event) => setParty(key, field, event.target.value)}
            />
          </Field>
        ))}

        {showBank ? (
          BANK_FIELDS.map(([field, label]) => (
            <Field
              key={field}
              label={label}
              className={field === "iban" || field === "bankName" ? "sm:col-span-2" : ""}
            >
              <TextInput
                value={party[field]}
                onChange={(event) => setParty(key, field, event.target.value)}
              />
            </Field>
          ))
        ) : (
          <div className="sm:col-span-2">
            <TextButton onClick={() => setBuyerBankOpen(true)}>
              + Bank rekvizitləri
            </TextButton>
          </div>
        )}
      </div>
    );
  };

  const partySummary = (party: Party) => {
    const parts = [party.name.trim(), party.taxId.trim() && `VÖEN ${party.taxId}`]
      .filter(Boolean)
      .join(" · ");
    return parts || "doldurulmayıb";
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="no-print min-w-0 rounded-md border border-line bg-surface">
        <Section
          title="Faktura"
          action={<TextButton onClick={fillSample}>Nümunə ilə doldur</TextButton>}
        >
          <div className="grid gap-3 sm:grid-cols-3">
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
        </Section>

        {(["seller", "buyer"] as PartyKey[]).map((key) => {
          const open = openParty === key;
          const title = key === "seller" ? "Satıcı" : "Alıcı";

          return (
            <Section
              key={key}
              title={title}
              action={
                <div className="flex items-center gap-4">
                  {key === "seller" && open && (
                    <TextButton onClick={saveSeller}>
                      {restored ? "Yadda saxlanılıb" : "Yadda saxla"}
                    </TextButton>
                  )}
                  <TextButton onClick={() => setOpenParty(open ? null : key)}>
                    {open ? "Yığ" : "Aç"}
                  </TextButton>
                </div>
              }
            >
              {open ? (
                partyForm(key)
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenParty(key)}
                  className="w-full truncate text-left text-[14px] text-ink-muted hover:text-ink"
                >
                  {partySummary(invoice[key])}
                </button>
              )}
            </Section>
          );
        })}

        <Section
          title="Sətirlər"
          action={<TextButton onClick={addItem}>+ Sətir</TextButton>}
        >
          <div className="space-y-4">
            {invoice.items.map((item, index) => (
              <div
                key={item.id}
                className="space-y-2 border-b border-line pb-4 last:border-b-0 last:pb-0"
              >
                <TextInput
                  value={item.description}
                  placeholder="Xidmətin və ya malın adı"
                  onChange={(event) =>
                    setItem(item.id, "description", event.target.value)
                  }
                />
                {/* Description gets its own row: in the two-column layout a
                    single-row table squeezed it down to a few pixels. */}
                <div className="grid min-w-0 grid-cols-2 items-center gap-2 sm:grid-cols-[4.5rem_1fr_7rem_6.5rem_1.5rem]">
                  <TextInput
                    inputMode="decimal"
                    className="text-right"
                    value={String(item.quantity)}
                    placeholder="Miqdar"
                    aria-label="Miqdar"
                    onChange={(event) => setItem(item.id, "quantity", event.target.value)}
                  />
                  <Select
                    value={item.unit}
                    aria-label="Vahid"
                    onChange={(event) => setItem(item.id, "unit", event.target.value)}
                  >
                    {UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </Select>
                  <TextInput
                    inputMode="decimal"
                    className="text-right"
                    value={String(item.unitPrice)}
                    placeholder="Qiymət"
                    aria-label="Vahidin qiyməti"
                    onChange={(event) => setItem(item.id, "unitPrice", event.target.value)}
                  />
                  <span className="text-right text-[14px] font-medium tabular-nums">
                    {formatMoney(totals.lineTotals[index] ?? 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={invoice.items.length === 1}
                    aria-label="Sətri sil"
                    className="justify-self-end text-[16px] leading-none text-ink-faint transition-colors hover:text-danger disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="ƏDV, endirim və qeyd">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ƏDV" className="sm:col-span-2">
              <Select
                value={
                  invoice.vatRate === 0 ? "yox" : invoice.vatIncluded ? "daxil" : "elave"
                }
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
          <div className="mt-3">
            <Field label="Qeyd" hint="Fakturanın altında görünür — ödəniş şərti, müqavilə nömrəsi.">
              <TextArea
                rows={2}
                value={invoice.note}
                onChange={(event) =>
                  setInvoice((current) => ({ ...current, note: event.target.value }))
                }
              />
            </Field>
          </div>
        </Section>
      </div>

      <div className="print-shell min-w-0 lg:sticky lg:top-24">
        <div className="no-print mb-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink-muted">
            Ödəniləcək:{" "}
            <span className="font-semibold text-ink tabular-nums">
              {formatMoney(totals.total)} ₼
            </span>
          </p>
          <Button type="button" onClick={downloadPdf} disabled={busy}>
            {busy ? "Hazırlanır…" : "PDF endir"}
          </Button>
        </div>
        <div className="print-shell overflow-hidden rounded-md border border-line shadow-card">
          <InvoicePreview invoice={invoice} />
        </div>
      </div>
    </div>
  );
}
