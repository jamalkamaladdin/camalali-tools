import { clampDiscountPercent, type InvoiceTotals } from "../../shared/invoice/calc";
import { DUE_DAYS } from "../../shared/invoice/dates";
import { formatMoney } from "../../shared/invoice/money";
import {
  emptyParty,
  partyIsFilled,
  type Invoice,
  type LineItem,
  type Party,
} from "../../shared/invoice/types";
import { addDays, formatAzDate, todayIso } from "./date";

/*
 * Everything the invoice widget needs that is not markup: the document it
 * starts from, the sample, the two field tables and the one-line summaries the
 * accordion shows beside a closed section. Keeping them here leaves the
 * components with layout only.
 */

/** Versioned, so a later shape change cannot read an older object back in. */
export const SELLER_KEY = "faktura.satici.v1";

export const emptyItem = (id: string): LineItem => ({
  id,
  description: "",
  unit: "ədəd",
  quantity: 1,
  unitPrice: 0,
});

/*
 * The starting point that is safe to render on the server: no `Date` call, so
 * the static HTML and the first client render cannot disagree. Today's date and
 * the remembered seller arrive afterwards, through `readClientDefaults`.
 */
export const baseInvoice: Invoice = {
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

/** The standard rate. `0` is the other option the form offers. */
export const VAT_RATE = 18;

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

/**
 * Fills the document with something to look at. A seller the visitor has
 * already typed or restored is left alone — the sample is there to show the
 * shape of an invoice, not to overwrite real data.
 */
export function withSample(current: Invoice): Invoice {
  return {
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
  };
}

export type PartyKey = "seller" | "buyer";

/** Field key to visible label, in the order the block is read. */
export const MAIN_FIELDS: [keyof Party, string][] = [
  ["taxId", "VÖEN"],
  ["address", "Ünvan"],
  ["phone", "Telefon"],
  ["email", "E-poçt"],
];

export const BANK_FIELDS: [keyof Party, string][] = [
  ["bankName", "Bank"],
  ["iban", "IBAN"],
  ["bankCode", "Bank kodu"],
  ["swift", "SWIFT"],
];

/*
 * The five sections of the form. The key is the id the section is addressed by
 * — in `key`, in a generated field id — and the value is what the visitor
 * reads. They are not an exclusive group: someone filling an invoice may want
 * the buyer and the lines open at the same time.
 */
export const FORM_SECTIONS = {
  faktura: "Faktura",
  satici: "Satıcı",
  alici: "Alıcı",
  setirler: "Sətirlər",
  edv: "ƏDV və qeydlər",
} as const;

export type PaneId = "forma" | "onizleme";

/** Which of the two stacked columns is visible while the tool is narrow. */
export const PANES: { value: PaneId; label: string }[] = [
  { value: "forma", label: "Forma" },
  { value: "onizleme", label: "Önizləmə" },
];

/* ---------- what the browser remembers ---------- */

export type ClientDefaults = { today: string; seller: Party | null };

/*
 * Today's date and the remembered seller live outside React, so they are read
 * through `useSyncExternalStore` instead of an effect that writes state back.
 * The result is cached because `getSnapshot` has to return a stable reference —
 * a fresh object every call is an infinite render loop.
 */
let cachedDefaults: ClientDefaults | null = null;

export function readClientDefaults(): ClientDefaults {
  if (cachedDefaults) return cachedDefaults;

  let seller: Party | null = null;
  try {
    const raw = window.localStorage.getItem(SELLER_KEY);
    if (raw) seller = { ...emptyParty(), ...JSON.parse(raw) } as Party;
  } catch (cause) {
    // A blocked store or a half-written value. The form still works, so this is
    // reported to the console rather than to the visitor.
    console.warn("faktura: yadda saxlanmış satıcı oxunmadı", cause);
    seller = null;
  }

  cachedDefaults = { today: todayIso(), seller };
  return cachedDefaults;
}

export const subscribeToNothing = () => () => {};

/** True when the seller was written. False means the browser refused. */
export function rememberSeller(seller: Party): boolean {
  try {
    window.localStorage.setItem(SELLER_KEY, JSON.stringify(seller));
    cachedDefaults = { ...readClientDefaults(), seller };
    return true;
  } catch (cause) {
    // Private mode or a full quota: the invoice is unaffected, only the
    // convenience of not retyping the seller next time is lost.
    console.warn("faktura: satıcı yadda saxlanılmadı", cause);
    return false;
  }
}

/** The starting document once the browser has told us what it knows. */
export function prefill(defaults: ClientDefaults | null): Invoice {
  if (!defaults) return baseInvoice;
  return {
    ...baseInvoice,
    date: defaults.today,
    dueDate: addDays(defaults.today, DUE_DAYS),
    seller: defaults.seller ?? baseInvoice.seller,
  };
}

/* ---------- accordion summaries ---------- */

export function partySummary(party: Party): string {
  const parts = [party.name.trim(), party.taxId.trim() && `VÖEN ${party.taxId}`]
    .filter(Boolean)
    .join(" · ");
  return parts || "doldurulmayıb";
}

export function invoiceSummary(invoice: Invoice): string {
  return `№ ${invoice.number.trim() || ""} · ${formatAzDate(invoice.date)}`;
}

export function itemsSummary(invoice: Invoice, totals: InvoiceTotals): string {
  return `${invoice.items.length} sətir · ${formatMoney(totals.subtotal)} ₼`;
}

export function vatSummary(invoice: Invoice): string {
  return [
    invoice.vatRate === 0
      ? "ƏDV tutulmur"
      : invoice.vatIncluded
        ? `ƏDV ${invoice.vatRate}% daxil`
        : `ƏDV ${invoice.vatRate}%`,
    /* The clamped figure, because that is the one the total below was
       computed from — the raw field is allowed to be mid-edit. */
    clampDiscountPercent(invoice.discountPercent) > 0 &&
      `endirim ${clampDiscountPercent(invoice.discountPercent)}%`,
    invoice.note.trim() && "qeyd var",
  ]
    .filter(Boolean)
    .join(" · ");
}
