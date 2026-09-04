"use client";

import type { CSSProperties } from "react";
import { calculateInvoice } from "../../shared/invoice/calc";
import { amountInAzWords, formatMoney, formatQuantity } from "../../shared/invoice/money";
import type { Invoice, Party } from "../../shared/invoice/types";
import { formatAzDate } from "./date";

/*
 * THE ONE SURFACE ON THIS SITE THAT IS NOT INTERFACE.
 *
 * Everything else a visitor touches here answers to the design system and
 * inverts with the dark theme. This does not. It is a sheet of paper that a
 * person prints, signs and sends to a client, so it has to be the same sheet in
 * both themes — white ground, dark ink, the document the PDF button is about to
 * produce. Tinting it with `--color-paper` would make it a panel; letting the
 * dark theme reach it would hand the visitor a black rectangle to print.
 *
 * So the sheet writes its colours down instead of reading tokens, and this
 * constant is the only place on the tool where a colour is written down. The
 * values are the ones `src/lib/invoice/pdf.ts` draws with, so the preview and
 * the downloaded file are the same document — with one deviation: the faintest
 * tone is darkened from the PDF's `#8792a2` (3.1:1 on white) to clear 4.5:1,
 * because unlike the PDF this sheet is text on a screen and `pnpm contrast`
 * measures it.
 *
 * They are applied as inline styles rather than as classes on purpose: an
 * inline declaration outranks every skin and theme rule in `globals.css`, so
 * there is no cascade left that could reach in and repaint the paper.
 */
const SHEET_SURFACE = {
  paper: "#ffffff",
  ink: "#0a2540",
  muted: "#425466",
  faint: "#5f7183",
  rule: "#e6ebf1",
  ruleStrong: "#b9c4d0",
} as const;

const paper: CSSProperties = {
  background: SHEET_SURFACE.paper,
  color: SHEET_SURFACE.ink,
  /* Announces the sheet as a light island. Without it the dark theme's
     `color-scheme` is inherited and the browser paints its own furniture —
     scrollbars, selection, form furniture — dark on white paper. */
  colorScheme: "light",
  /* The document keeps the site's own web faces instead of the skin's system
     stack. A skin swaps `--font-geist-sans` for Tahoma or SF Pro, so the
     invoice would change typeface with the costume, and Tahoma is also where
     the Azerbaijani schwa has gone missing before. */
  fontFamily: "var(--font-web-sans), sans-serif",
};

const mono: CSSProperties = { fontFamily: "var(--font-web-mono), monospace" };
const ink: CSSProperties = { color: SHEET_SURFACE.ink };
const muted: CSSProperties = { color: SHEET_SURFACE.muted };
const faint: CSSProperties = { color: SHEET_SURFACE.faint };
const rule: CSSProperties = { borderColor: SHEET_SURFACE.rule };
const ruleStrong: CSSProperties = { borderColor: SHEET_SURFACE.ruleStrong };
const monoMuted: CSSProperties = { ...mono, ...muted };
const monoInk: CSSProperties = { ...mono, ...ink };

/*
 * The small labels are mono and are NOT uppercased: CSS casing of the
 * Azerbaijani i/ı is engine-dependent, so "Xidmət" could print as "XIDMƏT"
 * instead of "XİDMƏT" on a client's browser. The label prints the letters it
 * was given.
 */
const labelClass = "text-[11px] tracking-[0.08em]";
const labelStyle: CSSProperties = { ...mono, ...faint };

function PartyBlock({ title, party }: { title: string; party: Party }) {
  /* Laid out as an address block, not a label/value table: on a paper-sized
     sheet the two-column table wrapped every value onto a second line. */
  const contact = [party.phone, party.email].filter((value) => value.trim()).join(" · ");
  /* IBAN gets its own line: joined with the other codes it wrapped four times
     in the narrow on-screen preview. */
  const bankCodes = [
    party.bankCode && `Kod ${party.bankCode}`,
    party.swift && `SWIFT ${party.swift}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="text-[12px] leading-5" style={muted}>
      <p className={labelClass} style={labelStyle}>
        {title}
      </p>
      <p className="mt-1.5 text-[14px] font-medium" style={ink}>
        {party.name.trim() || ""}
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

/**
 * The document, drawn from the invoice object alone. It holds no state and
 * reads nothing from the DOM, which is what lets the PDF builder produce the
 * same page from the same object without the sheet being on screen.
 */
export function InvoiceSheet({ invoice }: { invoice: Invoice }) {
  const totals = calculateInvoice(invoice);
  const vatLabel = invoice.vatIncluded
    ? `ƏDV ${invoice.vatRate}% (qiymətə daxil)`
    : `ƏDV ${invoice.vatRate}%`;

  /* Its own container: the sheet's inner layout has to answer to the width of
     the paper, which inside a floating window has nothing to do with the width
     of the viewport. */
  return (
    <article data-spec="invoice-sheet" className="@container mx-auto w-full p-5 @min-[30rem]:p-9" style={paper}>
      <header
        className="flex flex-wrap items-start justify-between gap-4 border-b pb-5"
        style={rule}
      >
        <div>
          <h2 className="text-[22px] leading-tight">Hesab-faktura</h2>
          <p className="mt-1 text-[12px] tabular-nums" style={monoMuted}>
            № {invoice.number.trim() || ""} · {formatAzDate(invoice.date)}
          </p>
        </div>
        {invoice.dueDate && (
          <div className="text-right">
            <p className={labelClass} style={labelStyle}>
              Ödəniş tarixi
            </p>
            <p className="mt-1 text-[12px] tabular-nums" style={monoInk}>
              {formatAzDate(invoice.dueDate)}
            </p>
          </div>
        )}
      </header>

      <div className="mt-6 grid gap-8 @min-[30rem]:grid-cols-2">
        <PartyBlock title="Satıcı" party={invoice.seller} />
        <PartyBlock title="Alıcı" party={invoice.buyer} />
      </div>

      <table className="mt-8 w-full border-collapse text-[13px]">
        <thead>
          <tr className={`border-y text-left ${labelClass}`} style={{ ...labelStyle, ...rule }}>
            <th className="py-2 pr-2 font-normal">Xidmət / mal</th>
            <th className="px-2 py-2 text-right font-normal">Miqdar</th>
            <th className="px-2 py-2 font-normal">Vahid</th>
            <th className="px-2 py-2 text-right font-normal">Qiymət</th>
            <th className="py-2 pl-2 text-right font-normal">Məbləğ</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, index) => (
            <tr key={item.id} className="border-b align-top" style={rule}>
              <td className="py-2.5 pr-2">{item.description.trim() || ""}</td>
              <td className="px-2 py-2.5 text-right tabular-nums" style={mono}>
                {formatQuantity(item.quantity)}
              </td>
              <td className="px-2 py-2.5" style={muted}>
                {item.unit}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums" style={mono}>
                {formatMoney(item.unitPrice)}
              </td>
              <td className="py-2.5 pl-2 text-right font-medium tabular-nums" style={mono}>
                {formatMoney(totals.lineTotals[index] ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-5 flex justify-end">
        <dl className="w-full max-w-xs space-y-1.5 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt style={muted}>Cəmi</dt>
            <dd className="tabular-nums" style={mono}>
              {formatMoney(totals.subtotal)} ₼
            </dd>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between gap-4">
              <dt style={muted}>Endirim {invoice.discountPercent}%</dt>
              <dd className="tabular-nums" style={mono}>
                −{formatMoney(totals.discount)} ₼
              </dd>
            </div>
          )}
          {invoice.vatRate > 0 && (
            <>
              <div className="flex justify-between gap-4">
                <dt style={muted}>ƏDV-siz məbləğ</dt>
                <dd className="tabular-nums" style={mono}>
                  {formatMoney(totals.net)} ₼
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={muted}>{vatLabel}</dt>
                <dd className="tabular-nums" style={mono}>
                  {formatMoney(totals.vat)} ₼
                </dd>
              </div>
            </>
          )}
          <div
            className="flex justify-between gap-4 border-t pt-2 text-[15px] font-medium"
            style={ruleStrong}
          >
            <dt>Ödəniləcək</dt>
            <dd className="tabular-nums" style={monoInk}>
              {formatMoney(totals.total)} ₼
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-4 text-[12px] leading-6" style={muted}>
        Yalnız {amountInAzWords(totals.total)}.
      </p>

      {invoice.note.trim() && (
        <p
          className="mt-6 border-t pt-4 text-[12px] leading-6 whitespace-pre-line"
          style={{ ...muted, ...rule }}
        >
          {invoice.note}
        </p>
      )}

      <div className="mt-10 grid gap-10 @min-[30rem]:grid-cols-2">
        {["Satıcı", "Alıcı"].map((role) => (
          <div key={role}>
            <div className="h-10 border-b" style={ruleStrong} />
            <p className="mt-1.5 text-[11px]" style={faint}>
              {role}: imza, ad, soyad
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}
