/*
 * The link auditor, checked against the shapes a real page's link table
 * actually needs: relative and protocol-relative addresses resolving
 * correctly, `target="_blank"` judged only on `rel`, dead `href` values,
 * weak anchor wording, and the three cross-link comparisons (same text to
 * different targets, same target under different text, a link back to the
 * page itself) that need more than one `<a>` to even show up.
 */
import type { CheckSuite } from "./harness.mts";
import { auditLinks, extractLinks, summariseLinks } from "../lib/link-analizi";

const BASE = "https://example.com/blog/post";

function kinds(html: string, base = BASE): string[] {
  const links = extractLinks(html, base);
  return auditLinks(links, base).map((issue) => issue.kind);
}

export const checks: CheckSuite = (check) => {
  {
    const links = extractLinks('<a href="/a">A</a>', BASE);
    check(
      "link-analizi: href=/a baza ile mutleqlesir ve daxili sayilir",
      links.length === 1 && links[0].resolved === "https://example.com/a" && links[0].internal === true,
      `alindi: ${JSON.stringify(links)}`,
    );
  }

  {
    const links = extractLinks('<a href="//cdn.example.com/x">X</a>', BASE);
    check(
      "link-analizi: protokolsuz //example.com/x unvan duzgun hell olunur",
      links.length === 1 && links[0].resolved === "https://cdn.example.com/x",
      `alindi: ${JSON.stringify(links)}`,
    );
    check(
      "link-analizi: protokolsuz unvan basqa host oldugu ucun xarici sayilir",
      links[0].internal === false,
      `alindi: ${JSON.stringify(links)}`,
    );
  }

  {
    check(
      'link-analizi: target=_blank + rel=noopener xeberdarliq VERMIR',
      !kinds('<a href="https://other.com" target="_blank" rel="noopener">X</a>').includes(
        "noopener-yoxdur",
      ),
      "noopener-yoxdur gozlenilmirdi",
    );
    check(
      "link-analizi: target=_blank rel-siz xeberdarliq verir",
      kinds('<a href="https://other.com" target="_blank">X</a>').includes("noopener-yoxdur"),
      "noopener-yoxdur gozlenilirdi",
    );
  }

  {
    check(
      "link-analizi: javascript:void(0) xeta verir",
      kinds('<a href="javascript:void(0)">klik</a>').includes("olu-href"),
      "olu-href gozlenilirdi",
    );
    check(
      "link-analizi: bos href de xeta verir",
      kinds('<a href="">klik</a>').includes("olu-href"),
      "olu-href gozlenilirdi",
    );
  }

  {
    check(
      "link-analizi: bura kliklayin zeif anchor kimi tutulur",
      kinds('<a href="/a">bura klikləyin</a>').includes("zeif-anchor"),
      "zeif-anchor gozlenilirdi",
    );
    check(
      "link-analizi: click here de zeif anchor kimi tutulur",
      kinds('<a href="/a">Click here</a>').includes("zeif-anchor"),
      "zeif-anchor gozlenilirdi",
    );
    check(
      "link-analizi: adi teswiri metn zeif anchor sayilmir",
      !kinds('<a href="/a">WebSocket haqqında məqalə</a>').includes("zeif-anchor"),
      "zeif-anchor gozlenilmirdi",
    );
  }

  {
    const links = extractLinks('<a href="/a"></a>', BASE);
    check(
      "link-analizi: metnsiz ve alt-siz link bos anchor sayilir",
      links[0].anchor === "" && kinds('<a href="/a"></a>').includes("bos-anchor"),
      `alindi: ${JSON.stringify(links)}`,
    );
  }

  {
    const links = extractLinks('<a href="/a"><img src="/x.png" alt="Loqo"></a>', BASE);
    check(
      "link-analizi: alt metnli sekilden ibaret link bos sayilmir",
      links[0].anchor === "Loqo" && !kinds('<a href="/a"><img src="/x.png" alt="Loqo"></a>').includes(
        "bos-anchor",
      ),
      `alindi: ${JSON.stringify(links)}`,
    );
  }

  {
    const html = '<a href="/blog/post">Bu səhifə</a>';
    check(
      "link-analizi: bazanin ozune gedən link xeberdarliq verir",
      kinds(html).includes("oz-sehifesine-link"),
      "oz-sehifesine-link gozlenilirdi",
    );
  }

  {
    const html = '<a href="#bolme">Bölməyə keç</a>';
    const links = extractLinks(html, BASE);
    check(
      "link-analizi: fraqment linki daxili sayilir, xarici yox",
      links[0].fragmentOnly === true && links[0].internal === true,
      `alindi: ${JSON.stringify(links)}`,
    );
    check(
      "link-analizi: fraqment linki oz-sehifesine-link kimi de bildirilmir",
      !kinds(html).includes("oz-sehifesine-link"),
      "oz-sehifesine-link gozlenilmirdi",
    );
  }

  {
    const html =
      '<a href="/a">Qiymətlər</a><a href="/b">Qiymətlər</a>';
    check(
      "link-analizi: eyni metn ferqli hedeflere gedende xeberdarliq verir",
      kinds(html).includes("eyni-metn-ferqli-hedef"),
      "eyni-metn-ferqli-hedef gozlenilirdi",
    );
  }

  {
    const html = '<a href="/a">Qiymətlər</a><a href="/a">Tariflərimizə bax</a>';
    check(
      "link-analizi: eyni hedefe ferqli anchor metnleri melumat kimi bildirilir",
      auditLinks(extractLinks(html, BASE), BASE).some(
        (issue) => issue.kind === "eyni-hedef-ferqli-metn" && issue.severity === "melumat",
      ),
      `alindi: ${JSON.stringify(auditLinks(extractLinks(html, BASE), BASE))}`,
    );
  }

  {
    const html =
      '<a href="/a" rel="nofollow">A</a><a href="/b">B</a><a href="/a">C</a>';
    const summary = summariseLinks(extractLinks(html, BASE));
    check(
      "link-analizi: yekun rəqəmləri düzgün hesablanır",
      summary.total === 3 &&
        summary.internal === 3 &&
        summary.external === 0 &&
        summary.nofollow === 1 &&
        summary.uniqueTargets === 2,
      `alindi: ${JSON.stringify(summary)}`,
    );
  }

  {
    const html = '<a href="/a">Bir</a><a href="/a">Başqa</a><a href="/b">Bir</a>';
    const summary = summariseLinks(extractLinks(html, BASE));
    const bir = summary.anchors.find((entry) => entry.text === "Bir");
    check(
      "link-analizi: anchor metn paylanmasi tekrar sayini duzgun sayir",
      bir !== undefined && bir.count === 2,
      `alindi: ${JSON.stringify(summary.anchors)}`,
    );
  }
};
