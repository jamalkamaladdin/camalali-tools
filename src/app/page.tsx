import {
  ButtonLink,
  Container,
  PageHead,
  Panel,
  SectionLabel,
} from "@/components/ui";
import { toolPath, tools } from "@/lib/site";

export default function Home() {
  const live = tools.filter((t) => t.status === "live");
  const planned = tools.filter((t) => t.status === "planned");

  return (
    <>
      {/* A masthead on the canvas, not a tinted hero band. The privacy line the
          old hero carried is said once, in the footer. */}
      <PageHead
        title="İşi qısaldan pulsuz alətlər"
        lead="Faktura hazırla, əmək haqqını hesabla — nəticə reklamsız çıxır."
      />

      <Container className="pb-14">
        <SectionLabel>Alət</SectionLabel>
        <div className="mt-4 space-y-4">
          {live.map((tool) => (
            <Panel key={tool.slug} className="p-5 sm:p-8">
              <h2 className="text-[24px] sm:text-[26px]">{tool.title}</h2>
              <p className="mt-3 max-w-[62ch] text-[16px] leading-[1.7] text-ink-muted">
                {tool.tagline}
              </p>
              <div className="mt-6">
                <ButtonLink href={toolPath(tool.slug)}>Alətə keç</ButtonLink>
              </div>
            </Panel>
          ))}
        </div>
      </Container>

      {/* Planned tools are an index, not cards: a box with a "hazırlanır" pill
          promises a page that does not exist. A muted row states the same fact
          and costs a fifth of the height. */}
      {planned.length > 0 && (
        <Container className="pb-16">
          <SectionLabel>Növbədə</SectionLabel>
          <ul className="mt-1 divide-y divide-line border-b border-line">
            {planned.map((tool, index) => (
              <li key={tool.slug} className="flex items-baseline gap-4 py-3.5">
                <span className="w-6 shrink-0 font-mono text-[12px] tabular-nums text-ink-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-ink-muted">
                    {tool.title}
                  </p>
                  <p className="mt-1 text-[14px] leading-[1.6] text-ink-faint">
                    {tool.tagline}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      )}
    </>
  );
}
