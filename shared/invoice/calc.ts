import { roundMoney } from "./money";
import type { Invoice, LineItem } from "./types";

export type InvoiceTotals = {
  lineTotals: number[];
  /** Sum of line totals, before discount. */
  subtotal: number;
  discount: number;
  /** Taxable base after discount, VAT excluded. */
  net: number;
  vat: number;
  total: number;
};

/** The only percentage the discount field can honestly mean: 0 through 100. */
export const MAX_DISCOUNT_PERCENT = 100;

/*
 * Exported because the form needs the same bound the arithmetic uses. It was
 * clamped here only, so the field happily showed 150 while the total below it
 * had already been computed at 100 — two numbers on one screen disagreeing.
 */
export function clampDiscountPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), MAX_DISCOUNT_PERCENT);
}

export function lineTotal(item: LineItem): number {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const price = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  return roundMoney(quantity * price);
}

/**
 * Each line is rounded to whole qəpik before being summed — the accounting
 * convention, and the reason a naive `sum(qty * price)` drifts by a qəpik on
 * long invoices.
 *
 * `vatIncluded` flips the meaning of the entered prices: when true they already
 * contain VAT and the tax is extracted out of the total instead of added on top.
 */
export function calculateInvoice(invoice: Invoice): InvoiceTotals {
  const lineTotals = invoice.items.map(lineTotal);
  const subtotal = roundMoney(lineTotals.reduce((sum, value) => sum + value, 0));

  const discountPercent = clampDiscountPercent(invoice.discountPercent);
  const discount = roundMoney((subtotal * discountPercent) / 100);
  const base = roundMoney(subtotal - discount);

  const rate = Number.isFinite(invoice.vatRate) ? invoice.vatRate : 0;

  if (rate <= 0) {
    return { lineTotals, subtotal, discount, net: base, vat: 0, total: base };
  }

  if (invoice.vatIncluded) {
    const net = roundMoney(base / (1 + rate / 100));
    const vat = roundMoney(base - net);
    return { lineTotals, subtotal, discount, net, vat, total: base };
  }

  const vat = roundMoney((base * rate) / 100);
  return {
    lineTotals,
    subtotal,
    discount,
    net: base,
    vat,
    total: roundMoney(base + vat),
  };
}
