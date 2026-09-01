"use client";

import { calculateInvoice } from "@/lib/invoice/calc";
import { amountInAzWords, formatMoney, formatQuantity } from "@/lib/invoice/money";
import type { Invoice, Party } from "@/lib/invoice/types";
import { formatAzDate } from "@/lib/az-date";

function PartyBlock({ title, party }: { title: string; party: Party }) {
  // Laid out as an address block, not a label/value table: on a paper-sized
  // sheet the two-column table wrapped every value onto a second line.
  const contact = [party.phone, party.email].filter((v) => v.trim()).join(" · ");
  // IBAN gets its own line: joined with the other codes it wrapped four times
  // in the narrow on-screen preview.
  const bankCodes = [
    party.bankCode && `Kod ${party.bankCode}`,
    party.swift && `SWIFT ${party.swift}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="text-[12px] leading-5 text-ink-muted">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </p>
      <p className="mt-1 text-[14px] font-semibold text-ink">
        {party.name.trim() || "—"}
      </p>
      {party.taxId.trim() && <p className="mt-1">VÖEN {party.taxId}</p>}
      {party.address.trim() && <p>{party.address}</p>}
      {contact && <p>{contact}</p>}
      {party.bankName.trim() && <p className="mt-1.5">{party.bankName}</p>}
      {party.iban.trim() && <p className="break-all">IBAN {party.iban}</p>}
      {bankCodes && <p>{bankCodes}</p>}
    </div>
  );
}

export function InvoicePreview({ invoice }: { invoice: Invoice }) {
  const totals = calculateInvoice(invoice);
  const vatLabel = invoice.vatIncluded
    ? `ƏDV ${invoice.vatRate}% (qiymətə daxil)`
    : `ƏDV ${invoice.vatRate}%`;

  return (
    <article
      id="faktura-cap"
      className="print-root mx-auto w-full bg-white p-8 text-ink sm:p-10"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <h2 className="text-[22px] font-semibold">Hesab-faktura</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            № {invoice.number.trim() || "—"} · {formatAzDate(invoice.date)}
          </p>
        </div>
        {invoice.dueDate && (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-ink-faint">
              Ödəniş tarixi
            </p>
            <p className="text-[13px] font-medium">{formatAzDate(invoice.dueDate)}</p>
          </div>
        )}
      </header>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <PartyBlock title="Satıcı" party={invoice.seller} />
        <PartyBlock title="Alıcı" party={invoice.buyer} />
      </div>

      <table className="mt-8 w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-y border-line text-left text-[11px] uppercase tracking-wide text-ink-faint">
            <th className="py-2 pr-2 font-semibold">Xidmət / mal</th>
            <th className="py-2 px-2 text-right font-semibold">Miqdar</th>
            <th className="py-2 px-2 font-semibold">Vahid</th>
            <th className="py-2 px-2 text-right font-semibold">Qiymət</th>
            <th className="py-2 pl-2 text-right font-semibold">Məbləğ</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, index) => (
            <tr key={item.id} className="border-b border-line/70 align-top">
              <td className="py-2.5 pr-2">{item.description.trim() || "—"}</td>
              <td className="py-2.5 px-2 text-right tabular-nums">
                {formatQuantity(item.quantity)}
              </td>
              <td className="py-2.5 px-2 text-ink-muted">{item.unit}</td>
              <td className="py-2.5 px-2 text-right tabular-nums">
                {formatMoney(item.unitPrice)}
              </td>
              <td className="py-2.5 pl-2 text-right font-medium tabular-nums">
                {formatMoney(totals.lineTotals[index] ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-5 flex justify-end">
        <dl className="w-full max-w-xs space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Cəmi</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotal)} ₼</dd>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-muted">
                Endirim {invoice.discountPercent}%
              </dt>
              <dd className="tabular-nums">−{formatMoney(totals.discount)} ₼</dd>
            </div>
          )}
          {invoice.vatRate > 0 && (
            <>
              <div className="flex justify-between">
                <dt className="text-ink-muted">ƏDV-siz məbləğ</dt>
                <dd className="tabular-nums">{formatMoney(totals.net)} ₼</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">{vatLabel}</dt>
                <dd className="tabular-nums">{formatMoney(totals.vat)} ₼</dd>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold">
            <dt>Ödəniləcək</dt>
            <dd className="tabular-nums">{formatMoney(totals.total)} ₼</dd>
          </div>
        </dl>
      </div>

      <p className="mt-4 text-[12px] leading-6 text-ink-muted">
        Yalnız {amountInAzWords(totals.total)}.
      </p>

      {invoice.note.trim() && (
        <p className="mt-6 whitespace-pre-line border-t border-line pt-4 text-[12px] leading-6 text-ink-muted">
          {invoice.note}
        </p>
      )}

      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        {["Satıcı", "Alıcı"].map((role) => (
          <div key={role}>
            <div className="h-10 border-b border-line" />
            <p className="mt-1.5 text-[11px] text-ink-faint">
              {role} — imza, ad, soyad
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}
