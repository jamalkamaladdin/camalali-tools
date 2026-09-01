import Link from "next/link";
import { Container, Card, ButtonLink } from "@/components/ui";
import { site, tools, toolPath } from "@/lib/site";

export default function Home() {
  const live = tools.filter((t) => t.status === "live");
  const planned = tools.filter((t) => t.status === "planned");

  return (
    <>
      <section className="relative overflow-hidden border-b border-line bg-subtle">
        <Container className="py-20 sm:py-28">
          <h1 className="max-w-3xl text-[40px] sm:text-[56px]">
            İşi qısaldan pulsuz alətlər
          </h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-8 text-ink-muted">
            Faktura hazırla, əmək haqqını hesabla, sistemin yükünü ölç.
            Hamısı brauzerdə işləyir — yazdığın məlumat heç bir serverə
            göndərilmir, qeydiyyat istənmir.
          </p>
          {live.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={toolPath(live[0].slug)}>
                {live[0].title}
              </ButtonLink>
            </div>
          )}
        </Container>
      </section>

      <Container className="py-16 sm:py-20">
        <div className="grid gap-5 sm:grid-cols-2">
          {live.map((tool) => (
            <Link key={tool.slug} href={toolPath(tool.slug)} className="group">
              <Card className="h-full p-8 transition-shadow duration-300 [transition-timing-function:var(--ease-brand)] group-hover:shadow-card">
                <h2 className="text-[20px]">{tool.title}</h2>
                <p className="mt-2 text-[15px] leading-7 text-ink-muted">
                  {tool.tagline}
                </p>
                <p className="mt-4 text-[14px] font-medium text-accent">
                  Aç →
                </p>
              </Card>
            </Link>
          ))}

          {planned.map((tool) => (
            <Card key={tool.slug} className="h-full p-6 opacity-70">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-[20px]">{tool.title}</h2>
                <span className="shrink-0 rounded-sm bg-accent-soft px-2 py-1 text-[12px] font-medium text-accent">
                  hazırlanır
                </span>
              </div>
              <p className="mt-2 text-[15px] leading-7 text-ink-muted">
                {tool.tagline}
              </p>
            </Card>
          ))}
        </div>
      </Container>

      <section className="border-t border-line bg-subtle">
        <Container className="py-16">
          <div className="max-w-2xl">
            <h2 className="text-[28px]">Bu alətləri kim yazıb</h2>
            <p className="mt-3 text-[17px] leading-8 text-ink-muted">
              Mən {site.author.name} — proqram təminatı, sistem arxitekturası və
              verilənlər bazası performansı üzrə işləyirəm. Bu alətlər gündəlik
              işdə özümə lazım olduğu üçün yazılıb və pulsuz qalır.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href={site.author.services} variant="secondary">
                Xidmətlər
              </ButtonLink>
              <ButtonLink href={site.author.blog} variant="ghost">
                Texniki yazılar
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
