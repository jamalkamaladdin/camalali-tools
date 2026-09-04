export type Party = {
  name: string;
  taxId: string; // VÖEN
  address: string;
  phone: string;
  email: string;
  bankName: string;
  iban: string;
  bankCode: string; // bank kodu
  swift: string;
};

export type LineItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

export type Invoice = {
  number: string;
  date: string; // ISO yyyy-mm-dd
  dueDate: string;
  seller: Party;
  buyer: Party;
  items: LineItem[];
  vatRate: number; // 18 | 0
  vatIncluded: boolean;
  discountPercent: number;
  note: string;
};

export const emptyParty = (): Party => ({
  name: "",
  taxId: "",
  address: "",
  phone: "",
  email: "",
  bankName: "",
  iban: "",
  bankCode: "",
  swift: "",
});

export const UNITS = [
  "ədəd",
  "saat",
  "gün",
  "ay",
  "xidmət",
  "kq",
  "litr",
  "metr",
  "m²",
  "dəst",
] as const;

/** True when at least one field of a party has been typed into. */
export const partyIsFilled = (party: Party): boolean =>
  Object.values(party).some((value) => value.trim().length > 0);

/**
 * Field-by-field comparison of two parties.
 *
 * The "Yadda saxlanılıb" label used to be a latch: once the seller had been
 * saved it stayed lit while the visitor edited the name underneath it, so the
 * label claimed the browser held something it did not. The label now answers a
 * question instead of remembering an event, and this is the question.
 */
export function partiesEqual(a: Party, b: Party): boolean {
  return (Object.keys(a) as (keyof Party)[]).every((key) => a[key] === b[key]);
}

/**
 * True when filling in the sample would destroy something the visitor typed.
 *
 * The seller is not counted: the sample leaves a filled seller alone. What it
 * overwrites without asking is the buyer, the lines and the note.
 */
export function sampleWouldOverwrite(invoice: Invoice): boolean {
  return (
    partyIsFilled(invoice.buyer) ||
    invoice.note.trim().length > 0 ||
    invoice.items.some(
      (item) =>
        item.description.trim().length > 0 || item.unitPrice !== 0 || item.quantity !== 1,
    )
  );
}
