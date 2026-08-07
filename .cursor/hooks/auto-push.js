#!/usr/bin/env node
/**
 * On agent stop: commit any pending changes, then push to origin.
 * Fail-open — errors are logged and never block the agent.
 */
const { execSync } = require("child_process");

function run(cmd) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runInherit(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  // Consume hook payload (required protocol)
  await readStdin();

  try {
    run("git rev-parse --is-inside-work-tree");
  } catch {
    console.error("[auto-push] Not a git repository; skipping.");
    process.exit(0);
  }

  try {
    const status = run("git status --porcelain");

    if (status) {
      console.error("[auto-push] Staging and committing changes…");
      runInherit("git add -A");

      const summary = status
        .split("\n")
        .filter(Boolean)
        .slice(0, 5)
        .map((line) => line.replace(/^\s*\S+\s+/, ""))
        .join(", ");

      const message = summary
        ? `chore: sync agent updates (${summary})`
        : "chore: sync agent updates";

      // HEREDOC-style avoided: Windows-friendly single-line message
      runInherit(`git commit -m ${JSON.stringify(message)}`);
    } else {
      console.error("[auto-push] Working tree clean; nothing to commit.");
    }

    const branch = run("git rev-parse --abbrev-ref HEAD");
    const upstream = (() => {
      try {
        return run("git rev-parse --abbrev-ref --symbolic-full-name @{u}");
      } catch {
        return "";
      }
    })();

    if (!upstream) {
      console.error(`[auto-push] No upstream for ${branch}; pushing with -u origin.`);
      runInherit(`git push -u origin ${branch}`);
    } else {
      console.error(`[auto-push] Pushing ${branch} → ${upstream}…`);
      runInherit("git push");
    }

    console.error("[auto-push] Done.");
  } catch (err) {
    console.error("[auto-push] Failed (fail-open):", err.message || err);
  }

  process.exit(0);
}

main();
