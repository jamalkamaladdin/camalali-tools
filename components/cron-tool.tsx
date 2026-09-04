"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { formatAzStamp, formatRelative } from "../shared/az-date";
import {
  cronExamples,
  describeCron,
  nextRuns,
  parseCron,
  runsPerMatchingDay,
  type CronField,
  type NextRunsResult,
  type ParsedCron,
} from "../lib/cron";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import { ToolTabs, type ToolTabItem } from "./tabs";

const RUN_COUNT = 8;
const TICK_MS = 30_000;

function subscribeToClock(onChange: () => void) {
  const timer = setInterval(onChange, TICK_MS);
  return () => clearInterval(timer);
}

/**
 * Rounded to the tick window on purpose: React re-reads the snapshot during
 * render and a raw `Date.now()` would look like a new value every single time.
 */
function readClock(): number {
  return Math.floor(Date.now() / TICK_MS) * TICK_MS;
}

/** The page is exported as static HTML, so there is no server-side "now". */
function noClockOnServer(): number | null {
  return null;
}

export function CronTool() {
  const [input, setInput] = useState("*/15 * * * 1-5");

  const nowMs = useSyncExternalStore<number | null>(
    subscribeToClock,
    readClock,
    noClockOnServer,
  );
  const now = useMemo(() => (nowMs === null ? null : new Date(nowMs)), [nowMs]);

  const empty = input.trim() === "";
  const parsed = useMemo(() => parseCron(input), [input]);
  const cron = parsed.ok ? parsed.cron : null;

  const description = useMemo(() => (cron ? describeCron(cron) : ""), [cron]);

  const schedule = useMemo(
    () => (cron && now ? nextRuns(cron, RUN_COUNT, now) : null),
    [cron, now],
  );

  const tabItems: ToolTabItem[] = [
    {
      id: "novbeti-icralar",
      label: "Növbəti icralar",
      /* How many the tab actually lists, not how many were asked for. The
         hardcoded 8 promised eight runs above the single entry that "0 0 29 2
         *" produces inside the four-year horizon. */
      hint: schedule && !schedule.never ? String(schedule.runs.length) : undefined,
      content: <NextRunsContent cron={cron} schedule={schedule} now={now} />,
    },
    {
      id: "sahe-sahe",
      label: "Sahə-sahə",
      content: <FieldsContent cron={cron} />,
    },
    {
      id: "numuneler",
      label: "Nümunələr",
      content: (
        <div className="flex flex-wrap gap-2">
          {cronExamples.map((example) => (
            <ToolButton
              key={example.expression}
              title={example.expression}
              onClick={() => setInput(example.expression)}
            >
              {example.label}
            </ToolButton>
          ))}
        </div>
      ),
    },
  ];

  return (
    <ToolPanel className="mt-8">
      <div className="p-4">
        <ToolField
          label="Cron ifadəsi"
          htmlFor="cron-input"
          hint="Beş sahə, boşluqla ayrılır: dəqiqə · saat · ayın günü · ay · həftənin günü"
          /* What a person came to a cron tool for is the line they paste into a
             crontab. The only copy button on this page copied the explanation
             of it. */
          suffix={<CopyButton value={input.trim()} label="ifadəni kopyala" />}
        >
          <ToolInput
            id="cron-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="*/15 * * * 1-5"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-mono"
          />
        </ToolField>

        {/* The reading sits directly under the input, unscrolled — it is the
            answer this tool exists to give. */}
        <div className="mt-4">
          {empty ? (
            <ToolNote>
              İfadəni yaz və ya nümunələrdən birini seç — izah və növbəti icra
              vaxtları dərhal görünəcək.
            </ToolNote>
          ) : parsed.ok ? (
            /* The plain-language reading is what this tool exists to produce,
               so it leaves the input surface. The empty and error states below
               stay notes: neither is a result. */
            <ToolResultPanel
              title="İzah"
              action={<CopyButton value={description} label="izahı kopyala" />}
            >
              <p className="px-3 py-2.5 text-base/7">{description}</p>
            </ToolResultPanel>
          ) : (
            <ToolNote tone="accent" title="İfadə oxunmadı">
              {parsed.error.message}
            </ToolNote>
          )}
        </div>

        {cron?.dayOrRule && (
          <ToolNote tone="accent" title="Ayın günü VƏ YA həftənin günü" className="mt-3">
            Hər iki gün sahəsi doldurulub. Cron onları «və» ilə yox, «və ya» ilə
            birləşdirir: biri ödənsə icra baş verir. Aşağıdakı siyahıda həm
            ayın {cron.dayOfMonth.matchText} günü, həm də seçilmiş həftə
            günləri görünəcək.
          </ToolNote>
        )}
      </div>

      <div className="border-t border-rule p-4">
        <ToolTabs idPrefix="cron" items={tabItems} />
      </div>
    </ToolPanel>
  );
}

function NextRunsContent({
  cron,
  schedule,
  now,
}: {
  cron: ParsedCron | null;
  schedule: NextRunsResult | null;
  now: Date | null;
}) {
  if (!cron) {
    return (
      <p className="font-ui text-sm text-muted">
        İfadə düzəldiləndən sonra vaxtlar burada sıralanacaq.
      </p>
    );
  }

  if (!schedule || !now) {
    return <p className="font-ui text-sm text-muted">Vaxt oxunur…</p>;
  }

  if (schedule.never) {
    return (
      <ToolNote tone="accent" title="Bu ifadə heç vaxt icra olunmur">
        Növbəti {schedule.horizonYears} il ərzində bu şərtə uyğun bir tarix
        yoxdur. Adətən səbəb ayın günü ilə ayın uyğunsuzluğudur — məsələn 30
        fevral və ya 31 aprel.
      </ToolNote>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <ToolStat
          label="İlk icra"
          value={formatRelative(schedule.runs[0], now)}
          note={formatAzStamp(schedule.runs[0])}
        />
        <ToolStat
          label="Uyğun gündə"
          value={runsPerMatchingDay(cron)}
          note="həmin gün ərzində neçə dəfə işə düşür"
        />
      </div>

      {/* The computed schedule. Named "Vaxtlar" rather than repeating the tab
          above it, and it is a readout — the Nümunələr tab beside it is not. */}
      <ToolResultPanel title="Vaxtlar" className="mt-4">
        <ol className="divide-y divide-rule px-3">
          {schedule.runs.map((run, index) => (
            <li key={run.getTime()} className="flex items-baseline justify-between gap-3 py-2">
              <span className="font-ui text-sm tabular-nums text-ink">
                <span className="mr-2 text-muted">{index + 1}.</span>
                {formatAzStamp(run)}
              </span>
              <span className="font-ui text-xs text-muted">
                {formatRelative(run, now)}
              </span>
            </li>
          ))}
        </ol>
      </ToolResultPanel>

      <p className="mt-3 font-ui text-xs text-muted">
        Vaxtlar bu cihazın yerli saatı ilədir. Server çox vaxt UTC-də işləyir —
        fərqi nəzərə al.
      </p>
    </>
  );
}

function FieldsContent({ cron }: { cron: ParsedCron | null }) {
  if (!cron) {
    return (
      <p className="font-ui text-sm text-muted">
        Düzgün ifadə yazıldıqda hər sahə ayrıca izah olunacaq.
      </p>
    );
  }

  return (
    <div className="divide-y divide-rule border-y border-rule">
      {cron.fields.map((field: CronField) => (
        <div key={field.name} className="py-3 first:pt-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-ink">{field.label}</p>
            <code className="font-mono text-sm tabular-nums text-accent-text">
              {field.raw}
            </code>
          </div>
          <p className="mt-1 font-ui text-sm text-muted">{field.summary}</p>
          <p className="mt-0.5 font-ui text-xs text-muted">
            Uyğun gəlir: {field.matchText}
          </p>
        </div>
      ))}
    </div>
  );
}
