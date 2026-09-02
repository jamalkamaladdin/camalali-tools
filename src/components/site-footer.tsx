import Link from "next/link";
import { Container } from "@/components/ui";
import { liveTools, site, toolPath } from "@/lib/site";

/**
 * Half the height it used to be: a hairline, three short columns, no tinted
 * band. This is also the single place the browser-only promise is made — it is
 * repeated on neither the home page nor the tool pages.
 */
export function SiteFooter() {
  const shown = liveTools();

  return (
    <footer className="no-print border-t border-line">
      <Container className="py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-[44ch]">
            <p className="font-display text-[17px] text-ink">
              {site.shortName}
            </p>
            <p className="mt-2 text-[13px] leading-[1.6] text-ink-muted">
              Hesablama brauzerdə aparılır — yazdığın məlumat bu saytın serverinə
              göndərilmir.
            </p>
          </div>

          <div className="flex gap-10 sm:gap-12">
            {shown.length > 0 && (
              <div>
                <p className="font-mono text-[11px] tracking-[0.08em] text-ink-faint">
                  Alətlər
                </p>
                <ul className="mt-3 space-y-2">
                  {shown.map((tool) => (
                    <li key={tool.slug}>
                      <Link
                        href={toolPath(tool.slug)}
                        className="text-[13px] text-ink-muted transition-colors hover:text-accent-text"
                      >
                        {tool.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="max-w-[34ch]">
              <p className="font-mono text-[11px] tracking-[0.08em] text-ink-faint">
                Kim hazırlayıb
              </p>
              <p className="mt-3 text-[13px] leading-[1.6] text-ink-muted">
                Bu alətləri{" "}
                <a
                  href={site.author.about}
                  className="text-accent-text underline decoration-line-strong underline-offset-2 transition-colors hover:decoration-accent"
                >
                  {site.author.name}
                </a>{" "}
                yazıb — proqram təminatı və sistem arxitekturası üzrə mühəndis.
              </p>
              <ul className="mt-3 flex gap-4">
                <li>
                  <a
                    href={site.author.services}
                    className="text-[13px] text-ink-muted transition-colors hover:text-accent-text"
                  >
                    Xidmətlər
                  </a>
                </li>
                <li>
                  <a
                    href={site.author.blog}
                    className="text-[13px] text-ink-muted transition-colors hover:text-accent-text"
                  >
                    Texniki yazılar
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
}
