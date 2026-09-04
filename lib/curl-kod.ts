/**
 * `curl` command line in, request in seven languages out — and back again.
 *
 * The shell word-splitter (`tokenizeShellCommand`) is the tool's actual job:
 * a `curl` command is not `.split(" ")`, because `-d '{"a": "b c"}'` has
 * spaces the split must not see and `--data-raw "line one\nline two"` has an
 * escape it must resolve. It is written by hand here rather than reached for
 * as a dependency because getting single quotes (literal, no escapes),
 * double quotes (`\"` `\\` `\$` are escapes, everything else is literal) and
 * bare words (any character escaped by a backslash) right is the one thing
 * every emitter downstream depends on.
 *
 * `parseCurl` turns tokens into one `ParsedRequest`; the seven `to*`
 * functions only print that struct in a different syntax, the same split
 * `json-tip.ts` uses for its five languages. `curlFromRequest` goes back the
 * other way, and `parseFetchCode` reads a `fetch(...)` call for the one
 * direction the brief asks for explicitly.
 *
 * Worth checking: quoting inside `-d`, `-H`, `--json`, multiple `-H`, `-u`,
 * `-F`, line continuations (`\` + newline), and the round trip
 * curl -> parse -> emit curl -> parse again landing on the same request.
 */

export type ParsedRequest = {
  method: string;
  url: string;
  /** Order preserved, duplicates kept — a header sent twice is legal HTTP. */
  headers: [string, string][];
  body: string | null;
  bodyIsJson: boolean;
  auth: { user: string; pass: string } | null;
  cookie: string | null;
  form: { name: string; value: string; isFile: boolean }[] | null;
  followRedirects: boolean;
  compressed: boolean;
};

/* ---------- 1. shell tokenizer ---------- */

/** `curl ... \` at end of line joins with the next line, exactly as a shell reads it — no space inserted. */
function joinLineContinuations(command: string): string {
  return command.replace(/\\\r?\n/g, "");
}

export function tokenizeShellCommand(command: string): string[] {
  const input = joinLineContinuations(command);
  const tokens: string[] = [];
  let current = "";
  let inToken = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (char === "'") {
      inToken = true;
      i += 1;
      while (i < input.length && input[i] !== "'") {
        current += input[i];
        i += 1;
      }
      i += 1; // closing quote
      continue;
    }

    if (char === '"') {
      inToken = true;
      i += 1;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < input.length && '"\\$`'.includes(input[i + 1])) {
          current += input[i + 1];
          i += 2;
        } else {
          current += input[i];
          i += 1;
        }
      }
      i += 1; // closing quote
      continue;
    }

    if (/\s/.test(char)) {
      if (inToken) {
        tokens.push(current);
        current = "";
        inToken = false;
      }
      i += 1;
      continue;
    }

    if (char === "\\" && i + 1 < input.length) {
      inToken = true;
      current += input[i + 1];
      i += 2;
      continue;
    }

    inToken = true;
    current += char;
    i += 1;
  }

  if (inToken) tokens.push(current);
  return tokens;
}

/* ---------- 2. tokens -> ParsedRequest ---------- */

const NO_ARG_FLAGS = new Set(["-s", "--silent", "-i", "--include", "-v", "--verbose", "-k", "--insecure", "-#", "--progress-bar"]);

export function parseCurl(command: string): { ok: true; request: ParsedRequest } | { ok: false; error: string } {
  const tokens = tokenizeShellCommand(command.trim());
  if (tokens.length === 0) return { ok: false, error: "Boş əmr." };

  const start = tokens[0] === "curl" ? 1 : 0;
  let url: string | null = null;
  let explicitMethod: string | null = null;
  const headers: [string, string][] = [];
  let body: string | null = null;
  let bodyIsJson = false;
  let auth: { user: string; pass: string } | null = null;
  let cookie: string | null = null;
  const form: { name: string; value: string; isFile: boolean }[] = [];
  let followRedirects = false;
  let compressed = false;
  let forceGet = false;

  for (let i = start; i < tokens.length; i++) {
    const token = tokens[i];
    const next = () => tokens[++i];

    switch (token) {
      case "-X":
      case "--request":
        explicitMethod = next();
        break;
      case "-H":
      case "--header": {
        const raw = next();
        const colon = raw?.indexOf(":") ?? -1;
        if (raw !== undefined && colon > 0) headers.push([raw.slice(0, colon).trim(), raw.slice(colon + 1).trim()]);
        break;
      }
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
      case "--data-ascii": {
        const raw = next();
        if (raw !== undefined) body = body === null ? raw : `${body}&${raw}`;
        break;
      }
      case "--json": {
        const raw = next();
        if (raw !== undefined) body = raw;
        bodyIsJson = true;
        headers.push(["Content-Type", "application/json"]);
        headers.push(["Accept", "application/json"]);
        break;
      }
      case "-u":
      case "--user": {
        const raw = next();
        if (raw !== undefined) {
          const colon = raw.indexOf(":");
          auth = colon === -1 ? { user: raw, pass: "" } : { user: raw.slice(0, colon), pass: raw.slice(colon + 1) };
        }
        break;
      }
      case "-b":
      case "--cookie":
        cookie = next() ?? null;
        break;
      case "-F":
      case "--form": {
        const raw = next();
        if (raw !== undefined) {
          const equals = raw.indexOf("=");
          const name = equals === -1 ? raw : raw.slice(0, equals);
          const value = equals === -1 ? "" : raw.slice(equals + 1);
          const isFile = value.startsWith("@");
          form.push({ name, value: isFile ? value.slice(1) : value, isFile });
        }
        break;
      }
      case "--compressed":
        compressed = true;
        break;
      case "-L":
      case "--location":
        followRedirects = true;
        break;
      case "-G":
      case "--get":
        forceGet = true;
        break;
      default:
        if (NO_ARG_FLAGS.has(token)) break;
        if (token.startsWith("-")) break; // an unrecognised flag is skipped rather than treated as the url
        if (url === null) url = token;
        break;
    }
  }

  if (url === null) return { ok: false, error: "Əmrdə URL tapılmadı." };

  const method = forceGet ? "GET" : explicitMethod ?? (body !== null || form.length > 0 ? "POST" : "GET");
  if (bodyIsJson === false && headers.some(([k, v]) => k.toLowerCase() === "content-type" && v.toLowerCase().includes("json"))) {
    bodyIsJson = true;
  }

  return {
    ok: true,
    request: {
      method,
      url,
      headers,
      body,
      bodyIsJson,
      auth,
      cookie,
      form: form.length > 0 ? form : null,
      followRedirects,
      compressed,
    },
  };
}

/* ---------- 3. ParsedRequest -> seven languages ---------- */

function jsEscape(value: string): string {
  return JSON.stringify(value);
}

export function toFetch(r: ParsedRequest): string {
  const lines: string[] = [];
  const optionLines: string[] = [];
  if (r.method !== "GET") optionLines.push(`  method: ${jsEscape(r.method)},`);
  const headers = [...r.headers];
  if (r.auth) headers.push(["Authorization", `Basic <base64(${r.auth.user}:${r.auth.pass})>`]);
  if (r.cookie) headers.push(["Cookie", r.cookie]);
  if (headers.length > 0) {
    optionLines.push(`  headers: {`);
    for (const [k, v] of headers) optionLines.push(`    ${jsEscape(k)}: ${jsEscape(v)},`);
    optionLines.push(`  },`);
  }
  if (r.body !== null) {
    optionLines.push(r.bodyIsJson ? `  body: JSON.stringify(${bodyAsJsExpression(r.body)}),` : `  body: ${jsEscape(r.body)},`);
  }
  lines.push(`const response = await fetch(${jsEscape(r.url)}${optionLines.length > 0 ? `, {\n${optionLines.join("\n")}\n}` : ""});`);
  return lines.join("\n");
}

function bodyAsJsExpression(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body));
  } catch {
    return jsEscape(body); // not JSON after all — kept as a plain string rather than guessed at
  }
}

export function toAxios(r: ParsedRequest): string {
  const options: string[] = [];
  const headers = [...r.headers];
  if (r.cookie) headers.push(["Cookie", r.cookie]);
  if (headers.length > 0) {
    options.push(`  headers: {`);
    for (const [k, v] of headers) options.push(`    ${jsEscape(k)}: ${jsEscape(v)},`);
    options.push(`  },`);
  }
  if (r.auth) options.push(`  auth: { username: ${jsEscape(r.auth.user)}, password: ${jsEscape(r.auth.pass)} },`);
  const dataArg = r.body !== null ? `, ${r.bodyIsJson ? bodyAsJsExpression(r.body) : jsEscape(r.body)}` : r.method !== "GET" ? ", undefined" : "";
  const optionsArg = options.length > 0 ? `, {\n${options.join("\n")}\n}` : "";
  const call = r.method === "GET" ? `axios.get(${jsEscape(r.url)}${optionsArg})` : `axios.${r.method.toLowerCase()}(${jsEscape(r.url)}${dataArg}${optionsArg})`;
  return `const response = await ${call};`;
}

function pyStr(value: string): string {
  return JSON.stringify(value);
}

function pythonCall(module: "requests" | "httpx", r: ParsedRequest): string {
  const args: string[] = [pyStr(r.url)];
  const headers = [...r.headers];
  if (r.cookie) headers.push(["Cookie", r.cookie]);
  if (headers.length > 0) args.push(`headers={${headers.map(([k, v]) => `${pyStr(k)}: ${pyStr(v)}`).join(", ")}}`);
  if (r.auth) args.push(`auth=(${pyStr(r.auth.user)}, ${pyStr(r.auth.pass)})`);
  if (r.body !== null) args.push(r.bodyIsJson ? `json=${bodyAsPythonExpression(r.body)}` : `data=${pyStr(r.body)}`);
  return `response = ${module}.${r.method.toLowerCase()}(${args.join(", ")})`;
}

function bodyAsPythonExpression(body: string): string {
  try {
    return jsonToPythonLiteral(JSON.parse(body));
  } catch {
    return pyStr(body);
  }
}

function jsonToPythonLiteral(value: unknown): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jsonToPythonLiteral).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${jsonToPythonLiteral(v)}`).join(", ")}}`;
}

export function toPythonRequests(r: ParsedRequest): string {
  return `import requests\n\n${pythonCall("requests", r)}`;
}

export function toPythonHttpx(r: ParsedRequest): string {
  return `import httpx\n\n${pythonCall("httpx", r)}`;
}

export function toGoNetHttp(r: ParsedRequest): string {
  const lines = ["package main", "", 'import (', '\t"fmt"', '\t"net/http"'];
  if (r.body !== null) lines.push('\t"strings"');
  lines.push(")", "", "func main() {");
  if (r.body !== null) {
    lines.push(`\tbody := strings.NewReader(${goStr(r.body)})`);
    lines.push(`\treq, _ := http.NewRequest(${goStr(r.method)}, ${goStr(r.url)}, body)`);
  } else {
    lines.push(`\treq, _ := http.NewRequest(${goStr(r.method)}, ${goStr(r.url)}, nil)`);
  }
  const headers = [...r.headers];
  if (r.cookie) headers.push(["Cookie", r.cookie]);
  for (const [k, v] of headers) lines.push(`\treq.Header.Set(${goStr(k)}, ${goStr(v)})`);
  if (r.auth) lines.push(`\treq.SetBasicAuth(${goStr(r.auth.user)}, ${goStr(r.auth.pass)})`);
  lines.push("\tresp, err := http.DefaultClient.Do(req)", "\tif err != nil {", '\t\tfmt.Println("request failed:", err)', "\t\treturn", "\t}", "\tdefer resp.Body.Close()", "}");
  return lines.join("\n");
}

function goStr(value: string): string {
  return JSON.stringify(value);
}

export function toPhpCurl(r: ParsedRequest): string {
  const lines = ["<?php", "", "$ch = curl_init();", `curl_setopt($ch, CURLOPT_URL, ${phpStr(r.url)});`, "curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);"];
  if (r.method !== "GET") lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${phpStr(r.method)});`);
  const headers = [...r.headers];
  if (r.cookie) headers.push(["Cookie", r.cookie]);
  if (headers.length > 0) {
    lines.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, [${headers.map(([k, v]) => phpStr(`${k}: ${v}`)).join(", ")}]);`);
  }
  if (r.auth) lines.push(`curl_setopt($ch, CURLOPT_USERPWD, ${phpStr(`${r.auth.user}:${r.auth.pass}`)});`);
  if (r.body !== null) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${phpStr(r.body)});`);
  lines.push("$response = curl_exec($ch);", "curl_close($ch);");
  return lines.join("\n");
}

function phpStr(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function toCSharpHttpClient(r: ParsedRequest): string {
  const lines = ["using System.Net.Http;", "using System.Text;", "", "var client = new HttpClient();", `var request = new HttpRequestMessage(new HttpMethod(${csStr(r.method)}), ${csStr(r.url)});`];
  const headers = [...r.headers];
  if (r.cookie) headers.push(["Cookie", r.cookie]);
  for (const [k, v] of headers) lines.push(`request.Headers.TryAddWithoutValidation(${csStr(k)}, ${csStr(v)});`);
  if (r.auth) {
    lines.push(`request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", System.Convert.ToBase64String(Encoding.UTF8.GetBytes(${csStr(`${r.auth.user}:${r.auth.pass}`)})));`);
  }
  if (r.body !== null) {
    const contentType = r.bodyIsJson ? "application/json" : "application/x-www-form-urlencoded";
    lines.push(`request.Content = new StringContent(${csStr(r.body)}, Encoding.UTF8, ${csStr(contentType)});`);
  }
  lines.push("var response = await client.SendAsync(request);");
  return lines.join("\n");
}

function csStr(value: string): string {
  return JSON.stringify(value);
}

/* ---------- 4. ParsedRequest -> curl (the reverse direction) ---------- */

function shellQuote(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_.:/=@%,+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function curlFromRequest(r: ParsedRequest): string {
  const parts = ["curl"];
  if (r.method !== "GET") parts.push("-X", shellQuote(r.method));
  for (const [k, v] of r.headers) parts.push("-H", shellQuote(`${k}: ${v}`));
  if (r.auth) parts.push("-u", shellQuote(`${r.auth.user}:${r.auth.pass}`));
  if (r.cookie) parts.push("-b", shellQuote(r.cookie));
  if (r.form) for (const field of r.form) parts.push("-F", shellQuote(`${field.name}=${field.isFile ? "@" : ""}${field.value}`));
  if (r.body !== null) parts.push("-d", shellQuote(r.body));
  if (r.followRedirects) parts.push("-L");
  if (r.compressed) parts.push("--compressed");
  parts.push(shellQuote(r.url));
  return parts.join(" ");
}

/* ---------- 5. fetch(...) code -> ParsedRequest (best-effort) ---------- */

/** Grabs the substring between a matching pair of brackets, starting just after `openIndex`. */
function extractBalanced(text: string, openIndex: number, open: string, close: string): string | null {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return null;
}

function firstStringLiteral(text: string): string | null {
  const match = /^\s*(["'`])((?:\\.|(?!\1).)*)\1/.exec(text);
  if (!match) return null;
  return match[2].replace(/\\(["'`\\])/g, "$1");
}

/**
 * Reads the shape `fetch(url, { method, headers: {...}, body })` — the shape
 * this file's own `toFetch` emits, and most hand-written calls besides. Not
 * a JavaScript parser: template literals with `${}` inside, computed keys
 * and anything beyond a plain object literal are outside what this reads.
 */
export function parseFetchCode(code: string): { ok: true; request: ParsedRequest } | { ok: false; error: string } {
  const callIndex = code.indexOf("fetch(");
  if (callIndex === -1) return { ok: false, error: "Kodda fetch(...) çağırışı tapılmadı." };

  const argsText = extractBalanced(code, callIndex + "fetch".length, "(", ")");
  if (argsText === null) return { ok: false, error: "fetch(...) çağırışının mötərizələri balanslaşmayıb." };

  const url = firstStringLiteral(argsText);
  if (url === null) return { ok: false, error: "fetch(...) çağırışında URL sətri tapılmadı." };

  const braceIndex = argsText.indexOf("{");
  const optionsText = braceIndex === -1 ? "" : extractBalanced(argsText, braceIndex, "{", "}") ?? "";

  const methodMatch = /method\s*:\s*["'`]([A-Za-z]+)["'`]/.exec(optionsText);
  const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";

  const headers: [string, string][] = [];
  const headersBraceIndex = optionsText.indexOf("headers");
  if (headersBraceIndex !== -1) {
    const openBrace = optionsText.indexOf("{", headersBraceIndex);
    const headersText = openBrace === -1 ? null : extractBalanced(optionsText, openBrace, "{", "}");
    if (headersText !== null) {
      const pairPattern = /["'`]?([A-Za-z0-9-]+)["'`]?\s*:\s*["'`]([^"'`]*)["'`]/g;
      for (const match of headersText.matchAll(pairPattern)) headers.push([match[1], match[2]]);
    }
  }

  let body: string | null = null;
  let bodyIsJson = false;
  const jsonStringifyIndex = optionsText.indexOf("JSON.stringify(");
  if (jsonStringifyIndex !== -1) {
    const inner = extractBalanced(optionsText, jsonStringifyIndex + "JSON.stringify".length, "(", ")");
    if (inner !== null) {
      body = inner.trim();
      bodyIsJson = true;
    }
  } else {
    const bodyMatch = /body\s*:\s*["'`]((?:\\.|[^"'`])*)["'`]/.exec(optionsText);
    if (bodyMatch) body = bodyMatch[1].replace(/\\(["'`\\])/g, "$1");
  }

  return {
    ok: true,
    request: {
      method,
      url,
      headers,
      body,
      bodyIsJson,
      auth: null,
      cookie: null,
      form: null,
      followRedirects: false,
      compressed: false,
    },
  };
}
