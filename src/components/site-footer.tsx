import Link from "next/link";
import { liveTools, site, toolPath } from "@/lib/site";

export function SiteFooter() {
  const shown = liveTools();

  return (
    <footer className="mt-24 border-t border-line bg-subtle">
      <div className="mx-auto grid max-w-(--container-page) gap-10 px-5 py-14 sm:grid-cols-3">
        <div>
          <p className="text-[15px] font-semibold text-ink">{site.shortName}</p>
          <p className="mt-2 max-w-xs text-[14px] leading-6 text-ink-muted">
            Hesablama brauzerdə aparılır. Yazdığın məlumat bu saytın serverinə
            göndərilmir.
          </p>
        </div>

        {shown.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
              Alətlər
            </p>
            <ul className="mt-3 space-y-2">
              {shown.map((tool) => (
                <li key={tool.slug}>
                  <Link
                    href={toolPath(tool.slug)}
                    className="text-[14px] text-ink-muted transition-colors hover:text-accent"
                  >
                    {tool.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
            Kim hazırlayıb
          </p>
          <p className="mt-3 text-[14px] leading-6 text-ink-muted">
            Bu alətləri{" "}
            <a
              href={site.author.about}
              className="font-medium text-accent hover:underline"
            >
              {site.author.name}
            </a>{" "}
            yazıb — proqram təminatı, sistem arxitekturası və verilənlər bazası
            üzrə mühəndis.
          </p>
          <ul className="mt-3 space-y-2">
            <li>
              <a
                href={site.author.services}
                className="text-[14px] text-ink-muted transition-colors hover:text-accent"
              >
                Xidmətlər
              </a>
            </li>
            <li>
              <a
                href={site.author.blog}
                className="text-[14px] text-ink-muted transition-colors hover:text-accent"
              >
                Texniki yazılar
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
