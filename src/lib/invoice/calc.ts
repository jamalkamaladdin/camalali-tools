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

  const discountPercent = Number.isFinite(invoice.discountPercent)
    ? Math.min(Math.max(invoice.discountPercent, 0), 100)
    : 0;
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
