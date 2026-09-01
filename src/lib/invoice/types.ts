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
