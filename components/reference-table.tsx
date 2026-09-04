"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { withInlineCode } from "./inline-code";
import { ToolButton, ToolPanel, ToolPanelHeader } from "./ui";
import {
  filterReference,
  groupBySection,
  sectionCounts,
  type ReferenceRow,
  type ReferenceSection,
} from "../lib/reference";

/*
 * The drawing half of a reference table. The rows and the search are in
 * `lib/tools/reference.ts`; this is what a visitor sees.
 *
 * A description list, not a `<table>`. Every one of these tools has exactly
 * two columns — the thing and what it means — and the second one is a
 * sentence, so a table would spend the whole page fighting to keep a
 * three-character `404` in a column wide enough for prose. `dl` also survives
 * the narrow case without a horizontal scrollbar: the pair stacks, which is
 * what a phone needs anyway.
 *
 * Drawn as the system's grouped list: the panel is the card, the pairs are its
 * rows, and the hairline between them is inset to where the text begins.
 *
 * Nothing is paginated and nothing is virtualised. The largest of these is the
 * ASCII table at 128 rows, and a filtered `dl` of 128 pairs is not a page a
 * browser struggles with — a scroll list somebody uses `Ctrl+F` on is the
 * whole point of a lookup page, and it is also what a search engine indexes.
 */

/* `.ios-row` centres what it holds, which is right for a one-line setting and
   wrong for a term beside a four-line explanation. The class is unlayered and
   outranks a utility, so the alignment is stated here. */
const rowAlign = { alignItems: "flex-start" } as const;

function Magnifier() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="16" height="16" fill="none">
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.6" />
      <path d="m10.6 10.6 3.1 3.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ClearMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="16" height="16">
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path
        d="m5.5 5.5 5 5m0-5-5 5"
        stroke="var(--surface)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ReferenceTable({
  rows,
  sections,
  placeholder,
  footnote,
}: {
  rows: ReferenceRow[];
  sections: ReferenceSection[];
  /** What the search box says when it is empty — name the rows, not "axtar". */
  placeholder: string;
  /** A line under the table: where the list came from, what it leaves out. */
  footnote?: string;
}) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string | undefined>(undefined);
  const searchId = useId();

  /* The list redraws on every keystroke while the field itself must not wait
     for it; on the long tables that is the difference between typing and
     typing through treacle. */
  const deferred = useDeferredValue(query);

  const counts = useMemo(() => sectionCounts(rows), [rows]);
  const found = useMemo(
    () => filterReference(rows, { query: deferred, section }),
    [rows, deferred, section],
  );
  const groups = useMemo(() => groupBySection(found, sections), [found, sections]);

  return (
    <div className="@container mt-8 space-y-4" data-spec="reference-table">
      <ToolPanel>
        <ToolPanelHeader
          title="Axtarış"
          hint={`${found.length} / ${rows.length}`}
          action={
            query !== "" || section !== undefined ? (
              <ToolButton
                size="chip"
                onClick={() => {
                  setQuery("");
                  setSection(undefined);
                }}
              >
                təmizlə
              </ToolButton>
            ) : undefined
          }
        />

        <div className="space-y-3 p-3">
          <label htmlFor={searchId} className="sr-only">
            {placeholder}
          </label>

          {/*
           * The system's search field: a filled well with no edge, the
           * magnifier inside it on the leading side and a clear mark on the
           * trailing side once there is something to clear. The native
           * `type="search"` cancel button is hidden — two clear buttons in one
           * field is the browser's idea, not the design's.
           */}
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-2"
            >
              <Magnifier />
            </span>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full rounded border-0 bg-fill-3 pr-10 pl-9 text-ios-body text-ink transition-colors duration-[var(--dur-fast)] ease-[var(--ease-ios)] placeholder:text-muted-2 hover:bg-fill-2 motion-reduce:transition-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query !== "" && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Axtarışı təmizlə"
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-2 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-ios)] hover:text-ink motion-reduce:transition-none"
              >
                <ClearMark />
              </button>
            )}
          </div>

          {/* The sections, as a row of filter pills. Not a segmented control:
              these tables carry five to eight sections and each pill also
              shows a count, which is three times more than a segmented track
              can hold on one line without becoming unreadable. So they scroll
              sideways, the way the system's own filter rows do.

              Counts are of the whole table and not of the current search on
              purpose: they are what tells somebody how big each part is before
              they narrow anything, and a row of zeroes mid-typing tells them
              nothing. */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pt-1 pb-2">
            <ToolButton
              size="chip"
              className="shrink-0 whitespace-nowrap"
              selected={section === undefined}
              onClick={() => setSection(undefined)}
            >
              hamısı <span className="tabular-nums">{rows.length}</span>
            </ToolButton>
            {sections.map((item) => (
              <ToolButton
                key={item.id}
                size="chip"
                className="shrink-0 whitespace-nowrap"
                selected={section === item.id}
                onClick={() => setSection(section === item.id ? undefined : item.id)}
              >
                {item.label} <span className="tabular-nums">{counts[item.id] ?? 0}</span>
              </ToolButton>
            ))}
          </div>
        </div>
      </ToolPanel>

      {groups.length === 0 ? (
        <ToolPanel>
          <p className="p-3 text-ios-subhead text-muted">Bu axtarışa uyğun sətir yoxdur.</p>
        </ToolPanel>
      ) : (
        groups.map(({ section: group, rows: list }) => (
          <ToolPanel key={group.id}>
            <ToolPanelHeader title={group.label} hint={`${list.length}`} />
            {group.hint !== undefined && (
              <p className="border-b border-rule px-3 py-2 text-ios-footnote text-muted">
                {group.hint}
              </p>
            )}

            {/* `ios-list-plain` because the panel around it is already the
                card: a second rounded ground inside the first would be a list
                inside a list. The rows keep the inset hairline either way. */}
            <dl className="ios-list ios-list-plain">
              {list.map((row) => (
                <div
                  key={`${row.section}-${row.term}`}
                  style={rowAlign}
                  /*
                   * Two columns once the panel is wide enough for the term to
                   * have its own, one column below that. The term column is
                   * fixed rather than fluid so that a hundred rows line up:
                   * `404` and `Content-Security-Policy` start in the same
                   * place, which is what makes the list scannable.
                   */
                  className="ios-row flex-wrap @min-[34rem]:flex-nowrap"
                >
                  <dt className="min-w-0 basis-full @min-[34rem]:shrink-0 @min-[34rem]:basis-52">
                    {/* The one column that stays monospace: these are commands,
                        headers, status codes and MIME types — strings a reader
                        types exactly. */}
                    <span className="font-mono text-sm font-semibold break-words">{row.term}</span>
                    {row.label !== undefined && (
                      <span className="mt-0.5 block text-ios-caption text-muted">{row.label}</span>
                    )}
                  </dt>
                  <dd className="min-w-0 flex-1 basis-full @min-[34rem]:basis-0">
                    <p className="text-ios-subhead">{withInlineCode(row.note)}</p>
                    {row.example !== undefined && (
                      <pre
                        data-surface="result"
                        className="mt-1.5 overflow-x-auto rounded border border-result-rule bg-result px-2 py-1.5 font-mono text-ios-caption"
                      >
                        {row.example}
                      </pre>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </ToolPanel>
        ))
      )}

      {footnote !== undefined && (
        <p className="text-ios-footnote text-muted">{withInlineCode(footnote)}</p>
      )}
    </div>
  );
}
