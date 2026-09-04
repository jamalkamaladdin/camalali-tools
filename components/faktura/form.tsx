"use client";

import { useId, useState } from "react";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolPanel,
  ToolPanelHeader,
  ToolSelect,
  ToolTextArea,
} from "../ui";
import { clampDiscountPercent, type InvoiceTotals } from "../../shared/invoice/calc";
import { decimalInputValue, formatMoney, parseDecimalInput } from "../../shared/invoice/money";
import { UNITS, type Invoice, type Party } from "../../shared/invoice/types";
import {
  BANK_FIELDS,
  FORM_SECTIONS,
  MAIN_FIELDS,
  VAT_RATE,
  emptyItem,
  invoiceSummary,
  itemsSummary,
  partySummary,
  vatSummary,
  type PartyKey,
} from "./model";

/*
 * The form half of the tool. It owns no invoice state — the widget above it
 * does — so the same document drives the form, the sheet and the PDF and the
 * three can never disagree.
 */

/*
 * An accordion hint shares its row with the section label. On a 390px screen a
 * filled company name would push the label out, so the hint is capped and
 * truncated by CSS rather than cut to a character count.
 */
function Hint({ children }: { children: string }) {
  return (
    <span className="block max-w-[9rem] truncate @min-[26rem]:max-w-[18rem]">{children}</span>
  );
}

/** The two line fields that hold a number rather than text. */
type NumberField = "quantity" | "unitPrice";

const draftKey = (id: string, field: NumberField) => `${id}:${field}`;

/** True when the box holds something that is not a number — `abc`, `1..2`. */
const draftIsInvalid = (draft: string | undefined) =>
  draft !== undefined && parseDecimalInput(draft).kind === "invalid";

const NOT_A_NUMBER = "Rəqəm yazın: 2,5 və ya 2.5.";

/* The one grid the line row and its column headings both use. Written out
   rather than composed, because Tailwind reads the source as text and never
   generates a class name assembled at runtime. */
const lineGrid =
  "grid min-w-0 grid-cols-2 gap-2 @min-[26rem]:grid-cols-[4.5rem_1fr_7rem_6.5rem_1.5rem]";

/* Same columns, but only once the row is wide enough to still be a table. */
const lineHeaderGrid =
  "hidden gap-2 font-ui text-[11px] text-muted " +
  "@min-[26rem]:grid @min-[26rem]:grid-cols-[4.5rem_1fr_7rem_6.5rem_1.5rem]";

export function InvoiceForm({
  invoice,
  totals,
  onChange,
  onFillSample,
  onSaveSeller,
  sellerSaved,
}: {
  invoice: Invoice;
  totals: InvoiceTotals;
  onChange: (next: (current: Invoice) => Invoice) => void;
  onFillSample: () => void;
  onSaveSeller: () => void;
  sellerSaved: boolean;
}) {
  /* The buyer's bank details are the rarest block on the form, so they start
     folded away behind one line instead of costing four empty fields. */
  const [buyerBankOpen, setBuyerBankOpen] = useState(false);
  /*
   * What is currently typed into a numeric box, keyed by line and field, kept
   * only while that box is being edited.
   *
   * It exists because the box used to be driven straight off the parsed number:
   * typing `19.99` went 1 → 19 → `19.` → parsed back to 19 → rendered as "19",
   * and the next keystroke landed in the units column, so the visitor got 1999.
   * Holding the raw text means the decimal point survives the round trip, and a
   * cleared box stays empty instead of snapping back to 0.
   */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [discountDraft, setDiscountDraft] = useState<string | null>(null);
  const uid = useId();
  const fieldId = (...parts: string[]) => `${uid}-${parts.join("-")}`;

  const setParty = (key: PartyKey, field: keyof Party, value: string) =>
    onChange((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));

  const setItemText = (id: string, field: "description" | "unit", value: string) =>
    onChange((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));

  const setItemNumber = (id: string, field: NumberField, raw: string) => {
    setDrafts((current) => ({ ...current, [draftKey(id, field)]: raw }));
    const value = decimalInputValue(raw);
    onChange((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };

  /* The draft is dropped on blur, so the field goes back to showing the number
     the document actually holds. */
  const commitItemNumber = (id: string, field: NumberField) =>
    setDrafts((current) => {
      const next = { ...current };
      delete next[draftKey(id, field)];
      return next;
    });

  const setDiscount = (raw: string) => {
    const parsed = parseDecimalInput(raw);
    if (parsed.kind !== "number") {
      setDiscountDraft(raw);
      onChange((current) => ({ ...current, discountPercent: 0 }));
      return;
    }
    /* Corrected in the field, not only in the arithmetic. A box reading 150
       above a total that was computed at 100 is the screen contradicting
       itself, and that is what the visitor reported. */
    const clamped = clampDiscountPercent(parsed.value);
    setDiscountDraft(clamped === parsed.value ? raw : String(clamped));
    onChange((current) => ({ ...current, discountPercent: clamped }));
  };

  const addItem = () =>
    onChange((current) => ({
      ...current,
      items: [...current.items, emptyItem(`line-${Date.now()}`)],
    }));

  const removeItem = (id: string) =>
    onChange((current) => ({
      ...current,
      /* The last line is never removed: an invoice with no lines has no form
         left to type into. */
      items:
        current.items.length > 1
          ? current.items.filter((item) => item.id !== id)
          : current.items,
    }));

  const partyForm = (key: PartyKey) => {
    const party = invoice[key];
    const showBank = key === "seller" || buyerBankOpen;

    return (
      <div className="grid gap-3 @min-[26rem]:grid-cols-2">
        <ToolField
          label="Ad / şirkət"
          htmlFor={fieldId(key, "name")}
          className="@min-[26rem]:col-span-2"
        >
          <ToolInput
            id={fieldId(key, "name")}
            value={party.name}
            placeholder={key === "seller" ? "Sənin adın və ya şirkətin" : "Kimə göndərilir"}
            onChange={(event) => setParty(key, "name", event.target.value)}
          />
        </ToolField>

        {MAIN_FIELDS.map(([field, label]) => (
          <ToolField key={field} label={label} htmlFor={fieldId(key, field)}>
            <ToolInput
              id={fieldId(key, field)}
              value={party[field]}
              onChange={(event) => setParty(key, field, event.target.value)}
            />
          </ToolField>
        ))}

        {showBank ? (
          BANK_FIELDS.map(([field, label]) => (
            <ToolField
              key={field}
              label={label}
              htmlFor={fieldId(key, field)}
              className={
                field === "iban" || field === "bankName" ? "@min-[26rem]:col-span-2" : undefined
              }
            >
              <ToolInput
                id={fieldId(key, field)}
                value={party[field]}
                onChange={(event) => setParty(key, field, event.target.value)}
              />
            </ToolField>
          ))
        ) : (
          <div className="@min-[26rem]:col-span-2">
            <ToolButton size="chip" onClick={() => setBuyerBankOpen(true)}>
              + Bank rekvizitləri
            </ToolButton>
          </div>
        )}
      </div>
    );
  };

  /* Its own container: the form's two-column grid answers to the width of the
     form column, which is half the tool once the sheet sits beside it. */
  return (
    <div className="@container">
      <ToolPanel>
        <ToolPanelHeader
          title="Faktura məlumatları"
          action={
            <ToolButton
              size="chip"
              onClick={() => {
                /* Half-typed boxes belong to lines that are about to be
                   replaced; keeping them would show the old text over the new
                   document. */
                setDrafts({});
                setDiscountDraft(null);
                onFillSample();
              }}
            >
              Nümunə ilə doldur
            </ToolButton>
          }
        />
        {/* -mt-px: the accordion carries its own top rule, which would sit one
            pixel under the header's and read as a double line. */}
        <ToolAccordion className="mx-3 -mt-px">
          {/* No `group`: the sections are not exclusive. Somebody filling an
              invoice reads the buyer while typing the lines. */}
          <ToolAccordionItem
            summary={FORM_SECTIONS.faktura}
            hint={<Hint>{invoiceSummary(invoice)}</Hint>}
            defaultOpen
          >
            <div className="grid gap-3 @min-[26rem]:grid-cols-3">
              <ToolField label="Nömrə" htmlFor={fieldId("number")}>
                <ToolInput
                  id={fieldId("number")}
                  value={invoice.number}
                  onChange={(event) =>
                    onChange((current) => ({ ...current, number: event.target.value }))
                  }
                />
              </ToolField>
              <ToolField label="Tarix" htmlFor={fieldId("date")}>
                <ToolInput
                  id={fieldId("date")}
                  type="date"
                  value={invoice.date}
                  onChange={(event) =>
                    onChange((current) => ({ ...current, date: event.target.value }))
                  }
                />
              </ToolField>
              <ToolField label="Ödəniş tarixi" htmlFor={fieldId("due")}>
                <ToolInput
                  id={fieldId("due")}
                  type="date"
                  value={invoice.dueDate}
                  onChange={(event) =>
                    onChange((current) => ({ ...current, dueDate: event.target.value }))
                  }
                />
              </ToolField>
            </div>
          </ToolAccordionItem>

          <ToolAccordionItem
            summary={FORM_SECTIONS.satici}
            hint={<Hint>{partySummary(invoice.seller)}</Hint>}
          >
            {partyForm("seller")}
            <div className="mt-3">
              <ToolButton size="chip" onClick={onSaveSeller}>
                {sellerSaved ? "Yadda saxlanılıb" : "Yadda saxla"}
              </ToolButton>
            </div>
          </ToolAccordionItem>

          <ToolAccordionItem
            summary={FORM_SECTIONS.alici}
            hint={<Hint>{partySummary(invoice.buyer)}</Hint>}
          >
            {partyForm("buyer")}
          </ToolAccordionItem>

          <ToolAccordionItem
            summary={FORM_SECTIONS.setirler}
            hint={<Hint>{itemsSummary(invoice, totals)}</Hint>}
          >
            <div className="space-y-4">
              {/* The three boxes below carried an `aria-label` and nothing a
                  sighted visitor could read: once a value is typed the
                  placeholder is gone and the row is three unnamed boxes. The
                  headings are hidden below 26rem, where the row wraps into two
                  columns and stops being a table. */}
              <div aria-hidden className={lineHeaderGrid}>
                <span className="text-right">Miqdar</span>
                <span>Vahid</span>
                <span className="text-right">Qiymət</span>
                <span className="text-right">Məbləğ</span>
                <span />
              </div>
              {invoice.items.map((item, index) => {
                const quantityDraft = drafts[draftKey(item.id, "quantity")];
                const priceDraft = drafts[draftKey(item.id, "unitPrice")];
                const rowInvalid =
                  draftIsInvalid(quantityDraft) || draftIsInvalid(priceDraft);

                return (
                <div
                  key={item.id}
                  className="space-y-2 border-b border-rule pb-4 last:border-b-0 last:pb-0"
                >
                  <ToolInput
                    value={item.description}
                    placeholder="Xidmətin və ya malın adı"
                    aria-label="Xidmət / mal"
                    onChange={(event) => setItemText(item.id, "description", event.target.value)}
                  />
                  {/* The description gets its own row: in the two-column layout a
                      single-row table squeezed it down to a few pixels. */}
                  <div className={`${lineGrid} items-center`}>
                    <ToolInput
                      inputMode="decimal"
                      className="text-right"
                      value={quantityDraft ?? String(item.quantity)}
                      placeholder="Miqdar"
                      aria-label="Miqdar"
                      aria-invalid={draftIsInvalid(quantityDraft) || undefined}
                      onChange={(event) =>
                        setItemNumber(item.id, "quantity", event.target.value)
                      }
                      onBlur={() => commitItemNumber(item.id, "quantity")}
                    />
                    <ToolSelect
                      value={item.unit}
                      aria-label="Vahid"
                      onChange={(event) => setItemText(item.id, "unit", event.target.value)}
                    >
                      {UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </ToolSelect>
                    <ToolInput
                      inputMode="decimal"
                      className="text-right"
                      value={priceDraft ?? String(item.unitPrice)}
                      placeholder="Qiymət"
                      aria-label="Vahidin qiyməti"
                      aria-invalid={draftIsInvalid(priceDraft) || undefined}
                      onChange={(event) =>
                        setItemNumber(item.id, "unitPrice", event.target.value)
                      }
                      onBlur={() => commitItemNumber(item.id, "unitPrice")}
                    />
                    <span className="text-right font-ui text-xs font-semibold tabular-nums">
                      {formatMoney(totals.lineTotals[index] ?? 0)}
                    </span>
                    {/* A bare glyph, not a slab: `globals.css` dresses buttons
                        that declare an edge, and an icon button in a row is a
                        shape. */}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={invoice.items.length === 1}
                      aria-label="Sətri sil"
                      className="justify-self-end font-ui text-base leading-none text-muted transition-colors duration-200 ease-out hover:text-accent-text focus-visible:text-accent-text disabled:opacity-30"
                    >
                      ×
                    </button>
                  </div>
                  {rowInvalid && (
                    <p role="status" className="font-ui text-[11px] text-accent-text">
                      {NOT_A_NUMBER}
                    </p>
                  )}
                </div>
                );
              })}
            </div>
            <div className="mt-4">
              <ToolButton size="chip" onClick={addItem}>
                + Sətir
              </ToolButton>
            </div>
          </ToolAccordionItem>

          <ToolAccordionItem
            summary={FORM_SECTIONS.edv}
            hint={<Hint>{vatSummary(invoice)}</Hint>}
          >
            <div className="grid gap-3 @min-[26rem]:grid-cols-3">
              <ToolField
                label="ƏDV"
                htmlFor={fieldId("vat")}
                className="@min-[26rem]:col-span-2"
              >
                <ToolSelect
                  id={fieldId("vat")}
                  value={invoice.vatRate === 0 ? "yox" : invoice.vatIncluded ? "daxil" : "elave"}
                  onChange={(event) => {
                    const mode = event.target.value;
                    onChange((current) => ({
                      ...current,
                      vatRate: mode === "yox" ? 0 : VAT_RATE,
                      vatIncluded: mode === "daxil",
                    }));
                  }}
                >
                  <option value="elave">18%: qiymətin üstünə əlavə olunur</option>
                  <option value="daxil">18%: qiymətə daxildir</option>
                  <option value="yox">ƏDV tutulmur</option>
                </ToolSelect>
              </ToolField>
              <ToolField
                label="Endirim (%)"
                htmlFor={fieldId("discount")}
                note={
                  draftIsInvalid(discountDraft ?? undefined) ? NOT_A_NUMBER : undefined
                }
              >
                <ToolInput
                  id={fieldId("discount")}
                  inputMode="decimal"
                  className="text-right"
                  value={discountDraft ?? String(invoice.discountPercent)}
                  aria-invalid={draftIsInvalid(discountDraft ?? undefined) || undefined}
                  onChange={(event) => setDiscount(event.target.value)}
                  onBlur={() => setDiscountDraft(null)}
                />
              </ToolField>
            </div>
            <div className="mt-3">
              <ToolField
                label="Qeyd"
                htmlFor={fieldId("note")}
                note="Fakturanın altında görünür: ödəniş şərti, müqavilə nömrəsi."
              >
                <ToolTextArea
                  id={fieldId("note")}
                  rows={2}
                  value={invoice.note}
                  onChange={(event) =>
                    onChange((current) => ({ ...current, note: event.target.value }))
                  }
                />
              </ToolField>
            </div>
          </ToolAccordionItem>
        </ToolAccordion>
      </ToolPanel>
    </div>
  );
}
