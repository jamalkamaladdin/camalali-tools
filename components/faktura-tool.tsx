"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ToolSegmented } from "./tabs";
import { ToolButton } from "./ui";
import { calculateInvoice } from "../shared/invoice/calc";
import { deriveDueDate } from "../shared/invoice/dates";
import { formatMoney } from "../shared/invoice/money";
import {
  partiesEqual,
  sampleWouldOverwrite,
  type Invoice,
  type Party,
} from "../shared/invoice/types";
import { InvoiceForm } from "./faktura/form";
import { InvoiceSheet } from "./faktura/sheet";
import {
  PANES,
  prefill,
  readClientDefaults,
  rememberSeller,
  subscribeToNothing,
  withSample,
  type PaneId,
} from "./faktura/model";

/*
 * The invoice widget: a form on the left, the sheet it produces on the right,
 * and one toolbar over both.
 *
 * One document drives all three outputs. The form edits it, the sheet draws it
 * and the PDF builder reads the same object, so nothing on screen can be a
 * different invoice from the file that gets downloaded.
 */

/*
 * The layout switches to two columns at a 52rem *container* width, not a 52rem
 * viewport: this tool opens inside a floating window whose width has nothing to
 * do with the size of the screen. The `@min-[52rem]:` prefix is written out at
 * every use rather than composed from a constant — Tailwind reads the source as
 * text, and a class name assembled at runtime is a class it never generates.
 */

const PDF_FAILED = "PDF hazırlanmadı — bir daha yoxla.";

const SAMPLE_WARNING =
  "Nümunə alıcını, sətirləri və qeydi əvəz edəcək. Yazdıqların itəcək — davam edilsin?";

export function FakturaTool() {
  /* Today's date and the remembered seller are browser facts, and the server
     has neither. `useSyncExternalStore` returns null on the server, so the
     first HTML and the first client render agree and only then does the real
     date arrive. */
  const defaults = useSyncExternalStore(subscribeToNothing, readClientDefaults, () => null);

  const [edited, setEdited] = useState<Invoice | null>(null);
  /* The seller as the browser currently holds it — not "a save happened". The
     label above the button has to answer whether what is on screen is what is
     stored, and a boolean latch cannot: it stayed lit while the name was
     edited under it and a reload then brought the old name back. */
  const [savedSeller, setSavedSeller] = useState<Party | null>(null);
  /* True once the visitor has set a payment date of their own. Until then the
     date follows the invoice date instead of being frozen at whatever it was
     when the document was built. */
  const [dueOverridden, setDueOverridden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Which of the two stacked columns is visible while the tool is narrow.
     Purely a CSS switch — see the grid below. */
  const [pane, setPane] = useState<PaneId>("forma");

  const prefilled = useMemo<Invoice>(() => prefill(defaults), [defaults]);
  const invoice = edited ?? prefilled;
  const totals = calculateInvoice(invoice);

  const update = (next: (current: Invoice) => Invoice) => {
    const changed = next(invoice);
    const touchedDue = changed.dueDate !== invoice.dueDate;
    if (touchedDue) setDueOverridden(true);
    setEdited({
      ...changed,
      dueDate: deriveDueDate({
        date: changed.date,
        dueDate: changed.dueDate,
        overridden: dueOverridden || touchedDue,
      }),
    });
  };

  const saveSeller = () => {
    if (rememberSeller(invoice.seller)) setSavedSeller(invoice.seller);
  };

  const storedSeller = savedSeller ?? defaults?.seller ?? null;

  const fillSample = () => {
    /* The sample used to overwrite typed lines with no warning at all. A
       confirm is the cheapest honest stop: it names what is about to go. */
    if (sampleWouldOverwrite(invoice) && !window.confirm(SAMPLE_WARNING)) return;
    update(withSample);
  };

  const downloadPdf = async () => {
    setBusy(true);
    setError(null);
    try {
      /* Loaded on demand: the PDF builder and the font it embeds never enter
         the first page load. It draws from the invoice object and never from
         the DOM, so a collapsed accordion or a hidden column cannot change the
         file. */
      const { buildInvoicePdf, invoicePdfFileName } = await import("../shared/invoice/pdf");
      const bytes = await buildInvoicePdf(invoice);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = invoicePdfFileName(invoice);
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      console.error("faktura: PDF qurulmadı", cause);
      setError(PDF_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="@container">
      {/* One toolbar at every width, outside both columns on purpose: the PDF
          button has to stay reachable while the sheet itself is the hidden
          pane. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ToolSegmented
          className="@min-[52rem]:hidden"
          options={PANES}
          value={pane}
          onChange={setPane}
          label="Görünüş"
        />
        <div className="ml-auto flex items-center gap-3">
          <p className="font-ui text-xs text-muted">
            Ödəniləcək:{" "}
            <span className="font-semibold text-ink tabular-nums">
              {formatMoney(totals.total)} ₼
            </span>
          </p>
          {/* The skin's own button face rather than an accent fill — the site's
              standing decision for a primary action, because `--paper` is the
              desktop ground of a skin and not an ink. */}
          <ToolButton className="font-semibold" onClick={downloadPdf} disabled={busy}>
            {busy ? "Hazırlanır…" : "PDF endir"}
          </ToolButton>
        </div>
      </div>

      {error !== null && (
        <p role="status" className="mb-4 font-ui text-[11px] text-accent-text">
          {error}
        </p>
      )}

      {/* Both columns stay mounted at every width; the segmented control only
          flips `display`. Unmounting the sheet would mean the preview a visitor
          switches to is built from scratch, and a document that disappears from
          the DOM is a document a screen reader cannot walk back to. */}
      <div className="grid gap-5 @min-[52rem]:grid-cols-2 @min-[52rem]:items-start">
        <div className={`min-w-0 @min-[52rem]:block ${pane === "forma" ? "" : "hidden"}`}>
          <InvoiceForm
            invoice={invoice}
            totals={totals}
            onChange={update}
            onFillSample={fillSample}
            onSaveSeller={saveSeller}
            sellerSaved={storedSeller !== null && partiesEqual(storedSeller, invoice.seller)}
          />
        </div>

        {/* The frame is site chrome and takes the skin's rule and elevation; the
            paper inside it does not. That boundary is the whole idea: the
            desktop holds the document, it does not colour it. */}
        <div className={`min-w-0 @min-[52rem]:block ${pane === "onizleme" ? "" : "hidden"}`}>
          <div className="overflow-hidden rounded border border-rule shadow-elev-1">
            <InvoiceSheet invoice={invoice} />
          </div>
        </div>
      </div>
    </div>
  );
}
