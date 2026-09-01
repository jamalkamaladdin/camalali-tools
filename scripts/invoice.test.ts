import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateInvoice } from "../src/lib/invoice/calc";
import {
  amountInAzWords,
  formatMoney,
  formatQuantity,
  numberToAzWords,
  roundMoney,
} from "../src/lib/invoice/money";
import { emptyParty, type Invoice } from "../src/lib/invoice/types";

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  number: "1",
  date: "2026-09-01",
  dueDate: "2026-09-15",
  seller: emptyParty(),
  buyer: emptyParty(),
  items: [],
  vatRate: 18,
  vatIncluded: false,
  discountPercent: 0,
  note: "",
  ...over,
});

const item = (quantity: number, unitPrice: number) => ({
  id: `${quantity}-${unitPrice}`,
  description: "iş",
  unit: "ədəd",
  quantity,
  unitPrice,
});

test("VAT is added on top of the entered prices", () => {
  const totals = calculateInvoice(invoice({ items: [item(2, 50)] }));
  assert.equal(totals.subtotal, 100);
  assert.equal(totals.vat, 18);
  assert.equal(totals.total, 118);
});

test("VAT is extracted when prices already contain it", () => {
  const totals = calculateInvoice(
    invoice({ items: [item(1, 118)], vatIncluded: true }),
  );
  assert.equal(totals.total, 118);
  assert.equal(totals.net, 100);
  assert.equal(totals.vat, 18);
});

test("discount reduces the taxable base, not the total after tax", () => {
  const totals = calculateInvoice(
    invoice({ items: [item(1, 100)], discountPercent: 10 }),
  );
  assert.equal(totals.discount, 10);
  assert.equal(totals.net, 90);
  assert.equal(totals.vat, 16.2);
  assert.equal(totals.total, 106.2);
});

test("zero rate leaves the total untouched", () => {
  const totals = calculateInvoice(invoice({ items: [item(3, 33.33)], vatRate: 0 }));
  assert.equal(totals.vat, 0);
  assert.equal(totals.total, 99.99);
});

test("each line is rounded before summing", () => {
  const totals = calculateInvoice(
    invoice({ items: [item(3, 0.335), item(3, 0.335)], vatRate: 0 }),
  );
  assert.deepEqual(totals.lineTotals, [1.01, 1.01]);
  assert.equal(totals.total, 2.02);
});

test("empty and broken input never produce NaN", () => {
  const totals = calculateInvoice(
    invoice({ items: [item(Number.NaN, 10)], discountPercent: Number.NaN }),
  );
  assert.equal(totals.total, 0);
  assert.equal(roundMoney(Number.EPSILON), 0);
});

test("money is grouped by space and split by comma", () => {
  assert.equal(formatMoney(1234.5), "1\u202f234,50");
  assert.equal(formatMoney(1000000), "1\u202f000\u202f000,00");
  assert.equal(formatMoney(-12.345), "-12,35");
  assert.equal(formatMoney(0), "0,00");
});

test("azerbaijani numerals follow spoken form", () => {
  assert.equal(numberToAzWords(0), "sıfır");
  assert.equal(numberToAzWords(7), "yeddi");
  assert.equal(numberToAzWords(21), "iyirmi bir");
  assert.equal(numberToAzWords(100), "yüz");
  assert.equal(numberToAzWords(105), "yüz beş");
  assert.equal(numberToAzWords(200), "iki yüz");
  // 1000 is "min", never "bir min"
  assert.equal(numberToAzWords(1000), "min");
  assert.equal(numberToAzWords(1234), "min iki yüz otuz dörd");
  assert.equal(numberToAzWords(21000), "iyirmi bir min");
  // every scale above min keeps its "bir"
  assert.equal(numberToAzWords(1000000), "bir milyon");
  assert.equal(numberToAzWords(2005000), "iki milyon beş min");
});

test("amount in words carries manat and qəpik", () => {
  assert.equal(
    amountInAzWords(1234.56),
    "min iki yüz otuz dörd manat əlli altı qəpik",
  );
  assert.equal(amountInAzWords(100), "yüz manat");
  assert.equal(amountInAzWords(0), "sıfır manat");
  assert.equal(amountInAzWords(0.05), "sıfır manat beş qəpik");
});

test("quantities drop trailing zeros", () => {
  assert.equal(formatQuantity(1), "1");
  assert.equal(formatQuantity(3), "3");
  assert.equal(formatQuantity(2.5), "2,5");
  assert.equal(formatQuantity(0.125), "0,125");
  assert.equal(formatQuantity(Number.NaN), "0");
});
