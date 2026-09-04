/*
 * The tolerant HTML reader, checked against the markup real pages actually
 * have rather than against the markup a specification describes.
 *
 * Every case here is a shape that broke a naive regex parser at some point:
 * a `<script>` whose body ends up in the page description, an attribute nobody
 * quoted, a tag name in capitals, an entity left undecoded, and the unclosed
 * `<a>` that turns a lazy "find the closing tag" loop into a hang.
 */
import type { CheckSuite } from "./harness.mts";
import {
  absoluteUrl,
  attr,
  collectTags,
  decodeEntities,
  stripTags,
} from "../lib/html";

export const checks: CheckSuite = (check) => {
  {
    const text = stripTags(
      "<p>Salam</p><script>var gizli = 'kod';</script><p>dünya</p>",
    );
    check(
      "html: script govdesi ile birlikde atilir",
      text === "Salam dünya",
      `alindi ${JSON.stringify(text)}`,
    );
  }

  {
    const text = stripTags("<style>body{color:red}</style><h1>Başlıq</h1>");
    check(
      "html: style govdesi ile birlikde atilir",
      text === "Başlıq",
      `alindi ${JSON.stringify(text)}`,
    );
  }

  {
    const text = stripTags("<div>bir</div>\n\n   <div>iki</div>");
    check(
      "html: bosluq yigilir",
      text === "bir iki",
      `alindi ${JSON.stringify(text)}`,
    );
  }

  {
    const text = stripTags("<p>A&nbsp;B &amp; C &#8212; D</p>");
    check(
      "html: mətn cixarilanda entity dekod olunur",
      text === "A B & C — D",
      `alindi ${JSON.stringify(text)}`,
    );
  }

  {
    /* A page cut off mid-download: the closer never arrives, and the tail must
       not be printed as if it were prose. */
    const text = stripTags("<p>gorunen</p><script>var a = 1; // kesildi");
    check(
      "html: baglanmamis script sonadek udulur",
      text === "gorunen",
      `alindi ${JSON.stringify(text)}`,
    );
  }

  {
    const text = stripTags("<!-- <p>seffaf</p> --><p>real</p>");
    check(
      "html: serh icindeki teq mətn kimi cixmir",
      text === "real",
      `alindi ${JSON.stringify(text)}`,
    );
  }

  {
    const tags = collectTags("<META CHARSET=UTF-8><Title>Ad</Title>", "meta");
    check(
      "html: boyuk herfli teq adi tapilir, ad kicildilir",
      tags.length === 1 && tags[0].name === "meta" && attr(tags[0], "charset") === "UTF-8",
      `alindi ${JSON.stringify(tags)}`,
    );
  }

  {
    const tags = collectTags("<a href=/haqqimda class=link>Haqqımda</a>", "a");
    check(
      "html: dirnaqsiz atribut oxunur",
      tags.length === 1 &&
        attr(tags[0], "href") === "/haqqimda" &&
        attr(tags[0], "class") === "link" &&
        tags[0].inner === "Haqqımda",
      `alindi ${JSON.stringify(tags)}`,
    );
  }

  {
    const tags = collectTags(
      '<meta name="description" content="Bir &amp; iki">',
      "meta",
    );
    check(
      "html: atribut deyeri entity-dekod olunur, acar kicik herfe dusur",
      tags.length === 1 &&
        attr(tags[0], "CONTENT") === "Bir & iki" &&
        attr(tags[0], "yoxdur") === null,
      `alindi ${JSON.stringify(tags)}`,
    );
  }

  {
    /* The classic hang: no closing tag anywhere, so a loop that waits for one
       never ends. The result matters less than the fact that it returns. */
    const tags = collectTags("<a href=x>bir<a href=y>iki<a href=z>uc", "a");
    check(
      "html: baglanmamis <a> proqrami dondurmur, inner novbeti <a>-ya qeder gedir",
      tags.length === 3 &&
        tags[0].inner === "bir" &&
        tags[1].inner === "iki" &&
        tags[2].inner === "uc",
      `alindi ${JSON.stringify(tags.map((tag) => tag.inner))}`,
    );
  }

  {
    const tags = collectTags("<div>bir<div>iki</div></div>", "div");
    check(
      "html: duzgun icice teqler derinliye gore ayrilir",
      tags.length === 2 &&
        tags[0].inner === "bir<div>iki</div>" &&
        tags[1].inner === "iki",
      `alindi ${JSON.stringify(tags.map((tag) => tag.inner))}`,
    );
  }

  {
    const tags = collectTags('<a title="bir > iki" href="/a">mətn</a>', "a");
    check(
      "html: atribut deyerindeki > teqi bitirmir",
      tags.length === 1 &&
        attr(tags[0], "title") === "bir > iki" &&
        attr(tags[0], "href") === "/a" &&
        tags[0].inner === "mətn",
      `alindi ${JSON.stringify(tags)}`,
    );
  }

  {
    const tags = collectTags('<link rel="canonical" href="/a"><p>x</p>', "link");
    check(
      "html: bos element ucun inner bosdur",
      tags.length === 1 && tags[0].inner === "",
      `alindi ${JSON.stringify(tags)}`,
    );
  }

  {
    const html = '<p>bir</p><p class="b">iki</p>';
    const tags = collectTags(html, "p");
    check(
      "html: teqler sened sirasi ile ve dogru index ile qayidir",
      tags.length === 2 &&
        tags[0].index === 0 &&
        tags[1].index === html.indexOf('<p class') &&
        tags[0].inner === "bir" &&
        tags[1].inner === "iki",
      `alindi ${JSON.stringify(tags.map((tag) => [tag.index, tag.inner]))}`,
    );
  }

  {
    const tags = collectTags("<!-- <h1>serh</h1> --><h1>real</h1>", "h1");
    check(
      "html: serh icindeki teq toplanmir",
      tags.length === 1 && tags[0].inner === "real",
      `alindi ${JSON.stringify(tags.map((tag) => tag.inner))}`,
    );
  }

  check(
    "html: decodeEntities onluq, onaltiliq ve adli formani oxuyur",
    decodeEntities("&#65;&#x42;&amp;&quot;&#8217;") === 'AB&"’',
    `alindi ${JSON.stringify(decodeEntities("&#65;&#x42;&amp;&quot;&#8217;"))}`,
  );

  check(
    "html: taninmayan entity oldugu kimi qalir",
    decodeEntities("5 &yoxdur; 6 &amp") === "5 &yoxdur; 6 &",
    `alindi ${JSON.stringify(decodeEntities("5 &yoxdur; 6 &amp"))}`,
  );

  check(
    "html: absoluteUrl nisbi unvani hell edir, alinmayana null qaytarir",
    absoluteUrl("/a", "https://example.com/b/c") === "https://example.com/a" &&
      absoluteUrl("d", "https://example.com/b/c") === "https://example.com/b/d" &&
      absoluteUrl("//cdn.example.com/x", "https://example.com/") ===
        "https://cdn.example.com/x" &&
      absoluteUrl("   ", "https://example.com/") === null &&
      absoluteUrl("/a", "belə deyil") === null,
    "nisbi unvan hell olunmadi",
  );

  /*
   * The regression that made these three cases exist.
   *
   * `İ` (U+0130) lowercases to two code units, so a scanner that folds the
   * whole document once and then indexes the original string reads one
   * character early after the first one. On this site that letter is ordinary
   * prose, and the failure is silent: a tag boundary lands mid-word and the
   * caller gets text that is almost right.
   */
  const dottedI = "<p>İSTİFADƏÇİ</p><a href=\"/x\">keçid</a>";
  const dottedLinks = collectTags(dottedI, "a");
  check(
    "html: İ herfinden sonra gelen teq duzgun yerde tapilir",
    dottedLinks.length === 1 && dottedLinks[0].inner === "keçid",
    `alindi ${JSON.stringify(dottedLinks.map((t) => t.inner))}`,
  );

  const dottedHref = dottedLinks[0] ? attr(dottedLinks[0], "href") : null;
  check(
    "html: İ herfinden sonra atribut deyeri surusmur",
    dottedHref === "/x",
    `alindi ${JSON.stringify(dottedHref)}`,
  );

  const dottedHeadings = collectTags("<h2>İdarəetmə</h2><h2>Son</h2>", "h2");
  check(
    "html: İ dasiyan iki basliq ayri-ayri oxunur",
    dottedHeadings.length === 2 &&
      dottedHeadings[0].inner === "İdarəetmə" &&
      dottedHeadings[1].inner === "Son",
    `alindi ${JSON.stringify(dottedHeadings.map((t) => t.inner))}`,
  );
};
