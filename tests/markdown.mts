import type { CheckSuite } from "./harness.mts";
import { markdownToHtml } from "../lib/markdown";

export const checks: CheckSuite = (check) => {
  // --- XSS: the four mandatory cases plus one extra scheme, each checked
  // both ways -- the dangerous substring must be gone AND the escaped or
  // dropped form must be present, so a check cannot pass by accident.
  {
    const html = markdownToHtml("<script>alert(1)</script>");
    check(
      "markdown: raw script tag is escaped, not executed",
      !html.includes("<script>") && html.includes("&lt;script&gt;"),
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("<img src=x onerror=alert(1)>");
    check(
      "markdown: raw img-with-onerror tag is escaped, not a real element",
      !html.includes("<img src=x") && html.includes("&lt;img"),
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("[link](javascript:alert(1))");
    check(
      "markdown: javascript: link target is dropped, label kept",
      !html.includes("javascript:") && html.includes("link") && !html.includes("<a "),
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("[link](data:text/html,<script>alert(1)</script>)");
    check(
      "markdown: data: link target is dropped, label kept",
      !html.includes("data:text/html") && !html.includes("<a "),
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("[link](vbscript:msgbox(1))");
    check(
      "markdown: vbscript: link target is dropped too",
      !html.includes("vbscript:") && !html.includes("<a "),
      `got ${html}`,
    );
  }

  // --- safe links and images still work once the dangerous schemes are gone
  {
    const html = markdownToHtml("[Camalali](https://camalali.com)");
    check(
      "markdown: https link renders with rel=noopener",
      html.includes('href="https://camalali.com"') && html.includes("noopener"),
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("![alt mətni](https://example.com/a.png)");
    check(
      "markdown: image renders with src and alt",
      html.includes('src="https://example.com/a.png"') && html.includes('alt="alt mətni"'),
      `got ${html}`,
    );
  }

  // --- known-answer cases: exact output, not compared against the tool's own run
  {
    const html = markdownToHtml("**bold**");
    check(
      "markdown: known answer for **bold**",
      html === "<p><strong>bold</strong></p>",
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("`code`");
    check(
      "markdown: known answer for a code span",
      html === "<p><code>code</code></p>",
      `got ${html}`,
    );
  }

  // --- structural features
  {
    const html = markdownToHtml("- one\n  - nested one\n  - nested two\n- two");
    const outerUl = html.indexOf("<ul>");
    const innerUl = html.indexOf("<ul>", outerUl + 1);
    check(
      "markdown: nested list produces two <ul> levels",
      outerUl !== -1 && innerUl !== -1 && innerUl > outerUl,
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("| Ad | Yaş |\n| --- | --- |\n| Ali | 30 |");
    check(
      "markdown: table produces thead/tbody with th and td",
      html.includes("<table>") &&
        html.includes("<thead>") &&
        html.includes("<th>Ad</th>") &&
        html.includes("<td>Ali</td>"),
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("```js\n**not bold**\n```");
    check(
      "markdown: fenced code block content is not run through emphasis",
      html.includes("**not bold**") && !html.includes("<strong>"),
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("");
    check("markdown: empty input yields empty output", html === "", `got ${JSON.stringify(html)}`);
  }

  {
    const html = markdownToHtml("Salam **dünya");
    check(
      "markdown: unclosed bold marker is left literal, no crash",
      !html.includes("<strong>") && html.includes("**"),
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("**Işıq** və **dünya** haqqında bir cümlə, ə ğ ş ı ö ü ç daxil.");
    check(
      "markdown: Azerbaijani letters pass through and emphasis still applies",
      html.includes("<strong>") && html.includes("dünya") && html.includes("ə ğ ş ı ö ü ç"),
      `got ${html}`,
    );
  }

  for (const level of [1, 2, 3, 4, 5, 6]) {
    const html = markdownToHtml(`${"#".repeat(level)} Başlıq`);
    check(
      `markdown: h${level} heading recognised`,
      html === `<h${level}>Başlıq</h${level}>`,
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("> Sitat mətni");
    check("markdown: blockquote produces <blockquote>", html.includes("<blockquote>"), `got ${html}`);
  }

  {
    const html = markdownToHtml("mətn\n\n---\n\ndaha mətn");
    check("markdown: thematic break produces <hr />", html.includes("<hr"), `got ${html}`);
  }

  {
    const html = markdownToHtml("~~köhnə~~");
    check("markdown: strikethrough produces <del>", html === "<p><del>köhnə</del></p>", `got ${html}`);
  }

  {
    const html = markdownToHtml("birinci sətir  \nikinci sətir");
    check(
      "markdown: two trailing spaces before a newline force a <br />",
      html.includes("<br"),
      `got ${html}`,
    );
  }

  {
    const html = markdownToHtml("3. üçüncü\n4. dördüncü");
    check(
      "markdown: ordered list keeps its starting number",
      html.includes('<ol start="3">'),
      `got ${html}`,
    );
  }
};
