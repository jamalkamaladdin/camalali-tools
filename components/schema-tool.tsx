"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import { ToolSegmented, ToolTabs, type ToolTabItem } from "./tabs";
import {
  buildSchema,
  EMPTY_VALUES,
  formatSchema,
  SCHEMA_TYPES,
  toScriptBlock,
  validateSchema,
  WEEKDAYS,
  type CrumbRow,
  type FaqPair,
  type HoursRow,
  type SchemaType,
} from "../lib/schema";

/*
 * The widget only draws state. Every rule about what a type needs, what a
 * blank field does and how a pasted record is judged lives in
 * `lib/schema`, where the check suite can reach it without a DOM.
 */

type Values = Record<string, unknown>;
type Setter = (key: string, value: unknown) => void;
type FormProps = { values: Values; set: Setter };

type OutputFormat = "json" | "script";

const TYPE_LABELS: Record<SchemaType, string> = {
  Article: "Article",
  FAQPage: "FAQPage",
  BreadcrumbList: "BreadcrumbList",
  LocalBusiness: "LocalBusiness",
  Organization: "Organization",
  Person: "Person",
};

/** One line under the type strip, so the visitor picks by what the page is rather than by the English class name. */
const TYPE_HINTS: Record<SchemaType, string> = {
  Article: "Bloq yazısı, xəbər, təlimat — mətn daşıyan səhifə.",
  FAQPage: "Yalnız sual-cavabdan ibarət səhifə və ya bölmə.",
  BreadcrumbList: "Səhifənin sayt içindəki yolu: ana səhifə → bölmə → səhifə.",
  LocalBusiness: "Ünvanı və iş saatı olan fiziki məkan.",
  Organization: "Şirkət, komanda, qurum — məkana bağlı olmayan.",
  Person: "Bir şəxsin profili: ad, iş, xarici hesablar.",
};

const OUTPUT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: "json", label: "JSON-LD" },
  { value: "script", label: "<script> bloku" },
];

const TYPE_OPTIONS = SCHEMA_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }));

const SAMPLES: Record<SchemaType, Values> = {
  Article: {
    headline: "WebSocket nədir və nə vaxt lazım olur",
    description:
      "Uzunmüddətli iki tərəfli bağlantının HTTP sorğusundan fərqi, real nümunə ilə.",
    image: "https://camalali.com/og/websocket-nedir.png",
    datePublished: "2026-09-03",
    dateModified: "2026-09-03",
    authorName: "Camal Əli",
    publisherName: "camalali",
    publisherLogo: "https://camalali.com/logo.png",
    mainEntityOfPage: "https://camalali.com/bloq/websocket-nedir",
  },
  FAQPage: {
    questions: [
      {
        question: "Schema qoymaq üçün plagin lazımdırmı?",
        answer: "Xeyr, JSON-LD blokunu səhifənin HTML-inə birbaşa əlavə etmək kifayətdir.",
      },
      {
        question: "Bir səhifədə neçə qeyd ola bilər?",
        answer: "Bir neçə — hər biri ayrı script bloku, ya da bir «@graph» massivi içində.",
      },
    ] as FaqPair[],
  },
  BreadcrumbList: {
    items: [
      { name: "Ana səhifə", url: "https://camalali.com/" },
      { name: "Bloq", url: "https://camalali.com/bloq" },
      { name: "WebSocket nədir", url: "" },
    ] as CrumbRow[],
  },
  LocalBusiness: {
    name: "Nümunə Studiyası",
    description: "Veb sayt və mobil tətbiq hazırlayan kiçik komanda.",
    telephone: "+994775054445",
    streetAddress: "Nizami küçəsi 10",
    addressLocality: "Bakı",
    postalCode: "AZ1000",
    addressCountry: "AZ",
    latitude: "40.3777",
    longitude: "49.8920",
    priceRange: "₼₼",
    url: "https://camalali.com",
    hours: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "18:00" },
      { days: ["Saturday"], opens: "10:00", closes: "14:00" },
    ] as HoursRow[],
  },
  Organization: {
    name: "camalali",
    alternateName: "Camal Əli",
    url: "https://camalali.com",
    logo: "https://camalali.com/logo.png",
    description: "Backend, verilənlər bazası və sistem dizaynı üzrə yazılar və xidmətlər.",
    sameAs: "https://github.com/jamalkamaladdin\nhttps://www.linkedin.com/in/jamalkamaladdin",
  },
  Person: {
    name: "Camal Əli",
    jobTitle: "Proqram mühəndisi",
    worksFor: "camalali",
    url: "https://camalali.com/haqqimda",
    image: "https://camalali.com/portret.png",
    sameAs: "https://github.com/jamalkamaladdin\nhttps://orcid.org/0009-0000-0000-0000",
  },
};

const SAMPLE_PASTE = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "WebSocket nədir",
  "image": "https://camalali.com/og/websocket-nedir.png"
}
</script>`;

function str(values: Values, key: string): string {
  const value = values[key];
  return typeof value === "string" ? value : "";
}

function list<T>(values: Values, key: string): T[] {
  const value = values[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export function SchemaTool() {
  const tabs: ToolTabItem[] = [
    { id: "qur", label: "Qur", content: <BuildPane /> },
    { id: "yoxla", label: "Yoxla", content: <ValidatePane /> },
  ];

  return <ToolTabs idPrefix="schema" items={tabs} className="mt-8" />;
}

/* ---------- build ---------- */

function BuildPane() {
  const [type, setType] = useState<SchemaType>("Article");
  const [store, setStore] = useState<Record<SchemaType, Values>>(EMPTY_VALUES);
  const [format, setFormat] = useState<OutputFormat>("json");

  const values = store[type];
  const set: Setter = (key, value) =>
    setStore((prev) => ({ ...prev, [type]: { ...prev[type], [key]: value } }));

  const schema = useMemo(() => buildSchema(type, values), [type, values]);
  const output = useMemo(
    () => (format === "json" ? formatSchema(schema) : toScriptBlock(schema)),
    [format, schema],
  );

  return (
    <div className="space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Tip"
          action={
            <>
              <ToolButton
                size="chip"
                onClick={() => setStore((prev) => ({ ...prev, [type]: SAMPLES[type] }))}
              >
                Nümunə ilə doldur
              </ToolButton>
              <ToolButton
                size="chip"
                onClick={() => setStore((prev) => ({ ...prev, [type]: EMPTY_VALUES[type] }))}
              >
                Sıfırla
              </ToolButton>
            </>
          }
        />
        <div className="p-3">
          <ToolSegmented
            label="Schema tipi"
            options={TYPE_OPTIONS}
            value={type}
            onChange={setType}
          />
          {/* A sentence, so it sits under the strip rather than in the header's
              hint slot — that slot does not wrap kindly around prose. */}
          <p className="mt-3 font-ui text-[11px]/5 text-muted">{TYPE_HINTS[type]}</p>
        </div>
      </ToolPanel>

      <ToolPanel>
        <ToolPanelHeader title="Sahələr" hint="boş qalan sahə çıxışa düşmür" />
        <div className="@container p-4">
          {type === "Article" && <ArticleForm values={values} set={set} />}
          {type === "FAQPage" && <FaqForm values={values} set={set} />}
          {type === "BreadcrumbList" && <CrumbForm values={values} set={set} />}
          {type === "LocalBusiness" && <BusinessForm values={values} set={set} />}
          {type === "Organization" && <OrganizationForm values={values} set={set} />}
          {type === "Person" && <PersonForm values={values} set={set} />}
        </div>
      </ToolPanel>

      <ToolResultPanel
        title="Çıxış"
        action={
          <>
            <ToolSegmented options={OUTPUT_OPTIONS} value={format} onChange={setFormat} />
            <CopyButton value={output} label="kopyala" doneLabel="kopyalandı" />
          </>
        }
      >
        <ToolOutput className="m-3 max-h-[28rem] overflow-y-auto">{output}</ToolOutput>
      </ToolResultPanel>

      <ToolAccordion>
        <ToolAccordionItem summary="Bu bloku səhifənin harasına qoymalıyam?">
          <p>
            Fərqi yoxdur: «head» içində və ya «body»-nin sonunda — hər ikisi oxunur. Vacib olan
            blokun səhifənin ilk HTML cavabında olmasıdır;
            sonradan JavaScript ilə əlavə edilən qeydi hər axtarış sistemi görmür. Bir səhifədə bir
            neçə blok ola bilər, yaxud hamısı bir «@graph» massivində birləşdirilə bilər.
          </p>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}

/* ---------- shared field pieces ---------- */

function TextRow({
  id,
  label,
  field,
  values,
  set,
  hint,
  note,
  placeholder,
  type = "text",
}: FormProps & {
  id: string;
  label: string;
  field: string;
  hint?: ReactNode;
  note?: ReactNode;
  placeholder?: string;
  type?: "text" | "date" | "time" | "tel";
}) {
  return (
    <ToolField label={label} htmlFor={id} hint={hint} note={note}>
      <ToolInput
        id={id}
        type={type}
        value={str(values, field)}
        onChange={(event) => set(field, event.target.value)}
        placeholder={placeholder}
      />
    </ToolField>
  );
}

function AreaRow({
  id,
  label,
  field,
  values,
  set,
  note,
  placeholder,
  rows = 3,
}: FormProps & {
  id: string;
  label: string;
  field: string;
  note?: ReactNode;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <ToolField label={label} htmlFor={id} note={note}>
      <ToolTextArea
        id={id}
        rows={rows}
        value={str(values, field)}
        onChange={(event) => set(field, event.target.value)}
        placeholder={placeholder}
      />
    </ToolField>
  );
}

/** Two columns once the window is wide enough for them — measured against the panel, not the viewport, because the tool lives inside a draggable window. */
function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 @min-[34rem]:grid-cols-2">{children}</div>;
}

function Wide({ children }: { children: ReactNode }) {
  return <div className="@min-[34rem]:col-span-2">{children}</div>;
}

/** One repeated row, with the control that removes it. The last row cannot be removed — an empty list has nothing to add to. */
function RowShell({
  title,
  onRemove,
  removable,
  children,
}: {
  title: string;
  onRemove: () => void;
  removable: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded border border-rule p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <ToolLabel>{title}</ToolLabel>
        <ToolButton size="chip" onClick={onRemove} disabled={!removable}>
          sil
        </ToolButton>
      </div>
      {children}
    </div>
  );
}

/* ---------- the six forms ---------- */

function ArticleForm({ values, set }: FormProps) {
  return (
    <FieldGrid>
      <Wide>
        <TextRow
          id="schema-headline"
          label="Başlıq"
          field="headline"
          values={values}
          set={set}
          hint="məcburi"
          placeholder="Yazının başlığı"
        />
      </Wide>
      <Wide>
        <AreaRow
          id="schema-article-description"
          label="Təsvir"
          field="description"
          values={values}
          set={set}
          placeholder="Bir-iki cümləlik xülasə"
        />
      </Wide>
      <TextRow
        id="schema-article-image"
        label="Şəkil (tam URL)"
        field="image"
        values={values}
        set={set}
        placeholder="https://sayt.com/og/sekil.png"
      />
      <TextRow
        id="schema-article-page"
        label="Səhifənin ünvanı"
        field="mainEntityOfPage"
        values={values}
        set={set}
        hint="mainEntityOfPage"
        placeholder="https://sayt.com/bloq/yazi"
      />
      <TextRow
        id="schema-published"
        label="Dərc tarixi"
        field="datePublished"
        values={values}
        set={set}
        hint="məcburi"
        type="date"
      />
      <TextRow
        id="schema-modified"
        label="Yenilənmə tarixi"
        field="dateModified"
        values={values}
        set={set}
        type="date"
      />
      <TextRow
        id="schema-author"
        label="Müəllif (şəxs adı)"
        field="authorName"
        values={values}
        set={set}
        hint="məcburi"
        placeholder="Ad Soyad"
      />
      <TextRow
        id="schema-publisher"
        label="Nəşriyyatçı (təşkilat adı)"
        field="publisherName"
        values={values}
        set={set}
        placeholder="Saytın adı"
      />
      <Wide>
        <TextRow
          id="schema-publisher-logo"
          label="Nəşriyyatçının loqosu"
          field="publisherLogo"
          values={values}
          set={set}
          note="Doldurulsa, loqo ImageObject kimi nəşriyyatçının içinə yazılır."
          placeholder="https://sayt.com/logo.png"
        />
      </Wide>
    </FieldGrid>
  );
}

function FaqForm({ values, set }: FormProps) {
  const pairs = list<FaqPair>(values, "questions");

  const update = (index: number, patch: Partial<FaqPair>) =>
    set(
      "questions",
      pairs.map((pair, current) => (current === index ? { ...pair, ...patch } : pair)),
    );

  /* Keyed by position, not by a generated id. Every control in a row is fully
     controlled and a row only ever leaves through its own "sil" button, so the
     focus a stable key protects is never inside the list when it changes. */
  return (
    <div className="space-y-3">
      {pairs.map((pair, index) => (
        <RowShell
          key={index}
          title={`Sual ${index + 1}`}
          removable={pairs.length > 1}
          onRemove={() => set("questions", pairs.filter((_, current) => current !== index))}
        >
          <div className="space-y-3">
            <ToolField label="Sual" htmlFor={`schema-question-${index}`}>
              <ToolInput
                id={`schema-question-${index}`}
                value={pair.question}
                onChange={(event) => update(index, { question: event.target.value })}
                placeholder="Ziyarətçinin verdiyi sual"
              />
            </ToolField>
            <ToolField label="Cavab" htmlFor={`schema-answer-${index}`}>
              <ToolTextArea
                id={`schema-answer-${index}`}
                rows={3}
                value={pair.answer}
                onChange={(event) => update(index, { answer: event.target.value })}
                placeholder="Tam cavab"
              />
            </ToolField>
          </div>
        </RowShell>
      ))}

      <ToolButton
        size="chip"
        onClick={() => set("questions", [...pairs, { question: "", answer: "" }])}
      >
        + sual əlavə et
      </ToolButton>
    </div>
  );
}

function CrumbForm({ values, set }: FormProps) {
  const items = list<CrumbRow>(values, "items");

  const update = (index: number, patch: Partial<CrumbRow>) =>
    set(
      "items",
      items.map((row, current) => (current === index ? { ...row, ...patch } : row)),
    );

  return (
    <div className="space-y-3">
      <ToolNote title="Sıra nömrəsi">
        <p className="font-ui text-xs/6 text-muted">
          «position» avtomatik yazılır: adı boş qalan sətir siyahıdan düşür, qalanlar 1-dən başlayıb
          ardıcıl nömrələnir. Sonuncu pillə üçün ünvanı boş buraxmaq olar — o, səhifənin özüdür.
        </p>
      </ToolNote>

      {items.map((row, index) => (
        <RowShell
          key={index}
          title={`Pillə ${index + 1}`}
          removable={items.length > 1}
          onRemove={() => set("items", items.filter((_, current) => current !== index))}
        >
          <div className="@container">
            <FieldGrid>
              <ToolField label="Ad" htmlFor={`schema-crumb-name-${index}`}>
                <ToolInput
                  id={`schema-crumb-name-${index}`}
                  value={row.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  placeholder="Bloq"
                />
              </ToolField>
              <ToolField label="Ünvan" htmlFor={`schema-crumb-url-${index}`}>
                <ToolInput
                  id={`schema-crumb-url-${index}`}
                  value={row.url}
                  onChange={(event) => update(index, { url: event.target.value })}
                  placeholder="https://sayt.com/bloq"
                />
              </ToolField>
            </FieldGrid>
          </div>
        </RowShell>
      ))}

      <ToolButton size="chip" onClick={() => set("items", [...items, { name: "", url: "" }])}>
        + pillə əlavə et
      </ToolButton>
    </div>
  );
}

function BusinessForm({ values, set }: FormProps) {
  return (
    <div className="space-y-5">
      <FieldGrid>
        <TextRow
          id="schema-business-name"
          label="Ad"
          field="name"
          values={values}
          set={set}
          hint="məcburi"
          placeholder="Biznesin adı"
        />
        <TextRow
          id="schema-business-phone"
          label="Telefon"
          field="telephone"
          values={values}
          set={set}
          type="tel"
          placeholder="+994XXXXXXXXX"
        />
        <Wide>
          <AreaRow
            id="schema-business-description"
            label="Təsvir"
            field="description"
            values={values}
            set={set}
            rows={2}
            placeholder="Nə ilə məşğuldur"
          />
        </Wide>
        <TextRow
          id="schema-business-street"
          label="Küçə"
          field="streetAddress"
          values={values}
          set={set}
          hint="ünvan məcburidir"
          placeholder="Nizami küçəsi 10"
        />
        <TextRow
          id="schema-business-city"
          label="Şəhər"
          field="addressLocality"
          values={values}
          set={set}
          placeholder="Bakı"
        />
        <TextRow
          id="schema-business-postal"
          label="Poçt indeksi"
          field="postalCode"
          values={values}
          set={set}
          placeholder="AZ1000"
        />
        <TextRow
          id="schema-business-country"
          label="Ölkə"
          field="addressCountry"
          values={values}
          set={set}
          hint="ISO kodu"
          placeholder="AZ"
        />
        <TextRow
          id="schema-business-lat"
          label="Enlik"
          field="latitude"
          values={values}
          set={set}
          note="Enlik və uzunluq yalnız ikisi birlikdə yazılanda çıxışa düşür."
          placeholder="40.3777"
        />
        <TextRow
          id="schema-business-lon"
          label="Uzunluq"
          field="longitude"
          values={values}
          set={set}
          placeholder="49.8920"
        />
        <TextRow
          id="schema-business-price"
          label="Qiymət aralığı"
          field="priceRange"
          values={values}
          set={set}
          placeholder="₼₼"
        />
        <TextRow
          id="schema-business-url"
          label="Sayt"
          field="url"
          values={values}
          set={set}
          placeholder="https://sayt.com"
        />
      </FieldGrid>

      <HoursEditor values={values} set={set} />
    </div>
  );
}

function HoursEditor({ values, set }: FormProps) {
  const hours = list<HoursRow>(values, "hours");

  const update = (index: number, patch: Partial<HoursRow>) =>
    set(
      "hours",
      hours.map((row, current) => (current === index ? { ...row, ...patch } : row)),
    );

  const toggleDay = (index: number, day: string) => {
    const row = hours[index];
    const days = row.days.includes(day)
      ? row.days.filter((current) => current !== day)
      : [...row.days, day];
    update(index, { days });
  };

  return (
    <div className="space-y-3">
      <ToolLabel>İş saatları</ToolLabel>
      <p className="font-ui text-[11px]/5 text-muted">
        Günü seçilməyən və ya açılış-bağlanış saatı boş qalan interval çıxışa düşmür.
      </p>

      {hours.map((row, index) => (
        <RowShell
          key={index}
          title={`Interval ${index + 1}`}
          removable={hours.length > 1}
          onRemove={() => set("hours", hours.filter((_, current) => current !== index))}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => (
                <ToolButton
                  key={day.value}
                  size="chip"
                  selected={row.days.includes(day.value)}
                  onClick={() => toggleDay(index, day.value)}
                >
                  {day.label}
                </ToolButton>
              ))}
            </div>
            <div className="@container">
              <FieldGrid>
                <ToolField label="Açılır" htmlFor={`schema-opens-${index}`}>
                  <ToolInput
                    id={`schema-opens-${index}`}
                    type="time"
                    value={row.opens}
                    onChange={(event) => update(index, { opens: event.target.value })}
                  />
                </ToolField>
                <ToolField label="Bağlanır" htmlFor={`schema-closes-${index}`}>
                  <ToolInput
                    id={`schema-closes-${index}`}
                    type="time"
                    value={row.closes}
                    onChange={(event) => update(index, { closes: event.target.value })}
                  />
                </ToolField>
              </FieldGrid>
            </div>
          </div>
        </RowShell>
      ))}

      <ToolButton
        size="chip"
        onClick={() => set("hours", [...hours, { days: [], opens: "", closes: "" }])}
      >
        + interval əlavə et
      </ToolButton>
    </div>
  );
}

function OrganizationForm({ values, set }: FormProps) {
  return (
    <FieldGrid>
      <TextRow
        id="schema-org-name"
        label="Ad"
        field="name"
        values={values}
        set={set}
        hint="məcburi"
        placeholder="Təşkilatın adı"
      />
      <TextRow
        id="schema-org-alt"
        label="Alternativ ad"
        field="alternateName"
        values={values}
        set={set}
        placeholder="Qısaltma və ya ikinci yazılış"
      />
      <TextRow
        id="schema-org-url"
        label="Sayt"
        field="url"
        values={values}
        set={set}
        hint="məcburi"
        placeholder="https://sayt.com"
      />
      <TextRow
        id="schema-org-logo"
        label="Loqo"
        field="logo"
        values={values}
        set={set}
        placeholder="https://sayt.com/logo.png"
      />
      <Wide>
        <AreaRow
          id="schema-org-description"
          label="Təsvir"
          field="description"
          values={values}
          set={set}
          rows={2}
          placeholder="Təşkilat nə edir"
        />
      </Wide>
      <Wide>
        <AreaRow
          id="schema-org-sameas"
          label="Profil linkləri"
          field="sameAs"
          values={values}
          set={set}
          note="Hər sətirdə bir ünvan — sətirlər sameAs massivinə çevrilir."
          placeholder={"https://github.com/istifadeci\nhttps://www.linkedin.com/in/istifadeci"}
        />
      </Wide>
    </FieldGrid>
  );
}

function PersonForm({ values, set }: FormProps) {
  return (
    <FieldGrid>
      <TextRow
        id="schema-person-name"
        label="Ad"
        field="name"
        values={values}
        set={set}
        hint="məcburi"
        placeholder="Ad Soyad"
      />
      <TextRow
        id="schema-person-job"
        label="İş adı"
        field="jobTitle"
        values={values}
        set={set}
        placeholder="Proqram mühəndisi"
      />
      <TextRow
        id="schema-person-works"
        label="İşlədiyi yer"
        field="worksFor"
        values={values}
        set={set}
        note="Təşkilat adı — çıxışda worksFor içində Organization kimi yazılır."
        placeholder="Şirkətin adı"
      />
      <TextRow
        id="schema-person-url"
        label="Səhifəsi"
        field="url"
        values={values}
        set={set}
        placeholder="https://sayt.com/haqqimda"
      />
      <Wide>
        <TextRow
          id="schema-person-image"
          label="Şəkil"
          field="image"
          values={values}
          set={set}
          placeholder="https://sayt.com/portret.png"
        />
      </Wide>
      <Wide>
        <AreaRow
          id="schema-person-sameas"
          label="Profil linkləri"
          field="sameAs"
          values={values}
          set={set}
          note="Hər sətirdə bir ünvan — sətirlər sameAs massivinə çevrilir."
          placeholder={"https://github.com/istifadeci\nhttps://orcid.org/0000-0000-0000-0000"}
        />
      </Wide>
    </FieldGrid>
  );
}

/* ---------- validate ---------- */

function ValidatePane() {
  const [text, setText] = useState("");
  const result = useMemo(() => validateSchema(text), [text]);
  const empty = text.trim() === "";

  return (
    <div className="space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Hazır JSON-LD"
          hint="script sarğısı ilə birlikdə yapışdırmaq olar"
          action={
            <>
              <ToolButton size="chip" onClick={() => setText(SAMPLE_PASTE)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setText("")} disabled={empty}>
                Təmizlə
              </ToolButton>
            </>
          }
        />
        <div className="p-4">
          <ToolField label="Yoxlanacaq mətn" htmlFor="schema-paste">
            <ToolTextArea
              id="schema-paste"
              rows={12}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder='{"@context": "https://schema.org", "@type": "Article", ...}'
            />
          </ToolField>
        </div>
      </ToolPanel>

      {!empty && <ValidationReport result={result} />}
    </div>
  );
}

function ValidationReport({ result }: { result: ReturnType<typeof validateSchema> }) {
  const parseError = result.parseError;
  const required = result.missing.filter((rule) => rule.required);
  const advised = result.missing.filter((rule) => !rule.required);

  return (
    <ToolResultPanel title="Nəticə">
      <div className="space-y-4 p-4">
        {parseError !== null ? (
          <ToolNote tone="accent" title="JSON parçalana bilmədi">
            <p className="text-sm/6">{parseError.message}</p>
            <p className="mt-1 font-ui text-xs tabular-nums text-muted">
              Sətir {parseError.line}, sütun {parseError.column}
            </p>
          </ToolNote>
        ) : (
          <div className="@container">
            <div className="grid gap-3 @min-[30rem]:grid-cols-3">
              <ToolStat
                label="Vəziyyət"
                value={result.ok ? "keçdi" : "çatışmır"}
                tone={result.ok ? "default" : "warning"}
              />
              <ToolStat label="Tip" value={result.type ?? "—"} />
              <ToolStat
                label="Çatışmayan məcburi sahə"
                value={required.length}
                tone={required.length > 0 ? "accent" : "default"}
              />
            </div>
          </div>
        )}

        {required.length > 0 && (
          <RuleList title="Məcburi sahələr çatışmır" rules={required} />
        )}
        {advised.length > 0 && (
          <RuleList title="Tövsiyə olunan sahələr yoxdur" rules={advised} />
        )}

        {result.notes.length > 0 && (
          <div className="space-y-2">
            <ToolLabel>Qeydlər</ToolLabel>
            <ul className="space-y-1.5">
              {result.notes.map((note) => (
                <li key={note} className="text-sm/6 text-muted">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ToolResultPanel>
  );
}

function RuleList({
  title,
  rules,
}: {
  title: string;
  rules: { name: string; why: string }[];
}) {
  return (
    <div className="space-y-2">
      <ToolLabel>{title}</ToolLabel>
      <ul className="divide-y divide-rule border-y border-rule">
        {rules.map((rule) => (
          <li key={rule.name} className="py-2.5">
            <p className="font-mono text-xs font-semibold">{rule.name}</p>
            <p className="mt-1 text-sm/6 text-muted">{rule.why}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
