/*
 * Cases for the github tool. The profile and repo fixtures are trimmed
 * copies of real `api.github.com` responses checked by hand with curl on
 * 2026-09-02 (`GET /users/torvalds`, `GET /repos/vercel/next.js`), not
 * invented shapes.
 */
import type { CheckSuite } from "./harness.mts";
import {
  githubApiPath,
  parseGithubInput,
  parseGithubProfile,
  parseGithubRepo,
  parseRateLimitHeaders,
} from "../lib/github";

export const checks: CheckSuite = (check) => {
  check(
    "github: parseGithubInput reads a bare name as a user lookup",
    (() => {
      const result = parseGithubInput("torvalds");
      return result.ok && result.target.kind === "user" && result.target.login === "torvalds";
    })(),
    "a plain login should resolve to a user target",
  );

  check(
    "github: parseGithubInput reads 'owner/repo' as a repo lookup",
    (() => {
      const result = parseGithubInput("vercel/next.js");
      return (
        result.ok &&
        result.target.kind === "repo" &&
        result.target.owner === "vercel" &&
        result.target.repo === "next.js"
      );
    })(),
    "'owner/repo', including a repo name with a dot, should resolve to a repo target",
  );

  check(
    "github: parseGithubInput rejects an empty string",
    parseGithubInput("").ok === false,
    "an empty query was accepted",
  );

  check(
    "github: parseGithubInput rejects embedded whitespace",
    parseGithubInput("tor valds").ok === false,
    "a query containing a space was accepted",
  );

  check(
    "github: parseGithubInput rejects more than one slash",
    parseGithubInput("a/b/c").ok === false,
    "a query with two slashes should not resolve to either target kind",
  );

  check(
    "github: parseGithubInput rejects a login starting with a hyphen",
    parseGithubInput("-torvalds").ok === false,
    "GitHub logins cannot start with a hyphen",
  );

  check(
    "github: parseGithubInput rejects a login ending with a hyphen",
    parseGithubInput("torvalds-").ok === false,
    "GitHub logins cannot end with a hyphen",
  );

  check(
    "github: parseGithubInput rejects a login with two hyphens in a row",
    parseGithubInput("tor--valds").ok === false,
    "GitHub logins cannot contain a doubled hyphen",
  );

  check(
    "github: parseGithubInput rejects a login over the 39-character limit",
    parseGithubInput("a".repeat(40)).ok === false,
    "a 40-character login should not pass",
  );

  check(
    "github: parseGithubInput rejects a repo name of '.'",
    parseGithubInput("owner/.").ok === false,
    "a repo name of exactly '.' is not a real repo name",
  );

  check(
    "github: parseGithubInput rejects an invalid character in the repo half",
    parseGithubInput("owner/repo!name").ok === false,
    "'!' is not a legal character in a GitHub repo name",
  );

  check(
    "github: githubApiPath builds the users/ route for a profile target",
    githubApiPath({ kind: "user", login: "torvalds" }) === "users/torvalds",
    `got "${githubApiPath({ kind: "user", login: "torvalds" })}"`,
  );

  check(
    "github: githubApiPath builds the repos/ route for a repo target",
    githubApiPath({ kind: "repo", owner: "vercel", repo: "next.js" }) === "repos/vercel/next.js",
    `got "${githubApiPath({ kind: "repo", owner: "vercel", repo: "next.js" })}"`,
  );

  {
    const profile = parseGithubProfile({
      login: "torvalds",
      name: "Linus Torvalds",
      bio: null,
      public_repos: 12,
      followers: 319903,
      created_at: "2011-09-03T15:26:22Z",
      avatar_url: "https://avatars.githubusercontent.com/u/1024025?v=4",
      html_url: "https://github.com/torvalds",
    });
    check(
      "github: parseGithubProfile reads a real profile body",
      profile.login === "torvalds" && profile.bio === null && profile.followers === 319903,
      `got ${JSON.stringify(profile)}`,
    );
  }

  {
    const repo = parseGithubRepo({
      full_name: "vercel/next.js",
      description: "The React Framework",
      stargazers_count: 142080,
      forks_count: 31861,
      language: "JavaScript",
      pushed_at: "2026-09-02T20:56:23Z",
      open_issues_count: 3403,
      html_url: "https://github.com/vercel/next.js",
      archived: false,
      license: { key: "mit", name: "MIT License", spdx_id: "MIT" },
    });
    check(
      "github: parseGithubRepo reads a real repo body, including a nested license name",
      repo.fullName === "vercel/next.js" && repo.licenseName === "MIT License" && repo.archived === false,
      `got ${JSON.stringify(repo)}`,
    );
  }

  check(
    "github: parseGithubRepo reports null for a repo with no license",
    parseGithubRepo({ full_name: "owner/repo", license: null }).licenseName === null,
    "a repo with license: null should not report a license name",
  );

  {
    const headers = new Headers({ "x-ratelimit-remaining": "58", "x-ratelimit-limit": "60" });
    check(
      "github: parseRateLimitHeaders reads the remaining and limit headers",
      (() => {
        const rate = parseRateLimitHeaders(headers);
        return rate.remaining === 58 && rate.limit === 60;
      })(),
      `got ${JSON.stringify(parseRateLimitHeaders(headers))}`,
    );
  }

  check(
    "github: parseRateLimitHeaders returns nulls when the headers are absent",
    (() => {
      const rate = parseRateLimitHeaders(new Headers());
      return rate.remaining === null && rate.limit === null;
    })(),
    "missing rate-limit headers should not be read as zero",
  );
};
