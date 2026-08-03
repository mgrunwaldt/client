function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Playwright inventory is missing ${label}`);
  }
  return value;
}

function requireLine(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Playwright inventory contains an invalid test line");
  }
  return value;
}

export function collectPlaywrightCases(report) {
  if (!isRecord(report) || !Array.isArray(report.suites)) {
    throw new Error("Playwright did not return a valid JSON test inventory");
  }

  const cases = [];
  const visit = (suite) => {
    if (!isRecord(suite)) {
      throw new Error("Playwright inventory contains an invalid suite");
    }
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      if (!isRecord(spec) || !Array.isArray(spec.tests)) {
        throw new Error("Playwright inventory contains an invalid spec");
      }
      const file = requireString(spec.file, "test file");
      const line = requireLine(spec.line);
      const title = requireString(spec.title, "test title");
      for (const entry of spec.tests) {
        if (!isRecord(entry)) {
          throw new Error("Playwright inventory contains an invalid project");
        }
        cases.push({
          file,
          line,
          title,
          projectName: requireString(entry.projectName, "project name"),
        });
      }
    }
    for (const child of Array.isArray(suite.suites) ? suite.suites : []) {
      visit(child);
    }
  };
  for (const suite of report.suites) visit(suite);

  const identities = new Set();
  for (const entry of cases) {
    const identity = `${entry.projectName}\u0000${entry.file}\u0000${entry.line}\u0000${entry.title}`;
    if (identities.has(identity)) {
      throw new Error(
        `Playwright inventory repeated ${entry.projectName} ${entry.file}:${entry.line} ${entry.title}`,
      );
    }
    identities.add(identity);
  }
  if (cases.length === 0) {
    throw new Error("Playwright test inventory is empty");
  }
  return cases;
}

function escapedPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function pathSegment(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
}

export function isolatedPlaywrightArgs(
  playwrightCli,
  entry,
  index,
  updateSnapshots = false,
) {
  const ordinal = String(index + 1).padStart(3, "0");
  const args = [
    playwrightCli,
    "test",
    `e2e/${entry.file}:${entry.line}`,
    `--project=${entry.projectName}`,
    "--grep",
    `${escapedPattern(entry.title)}$`,
    `--output=test-results/isolated/${ordinal}-${pathSegment(entry.projectName)}`,
  ];
  if (updateSnapshots) args.push("--update-snapshots");
  return args;
}

export async function runIsolatedPlaywrightCases(cases, runCase) {
  const failures = [];
  for (const [index, entry] of cases.entries()) {
    try {
      await runCase(entry, index);
    } catch (error) {
      failures.push({ entry, error });
    }
  }
  return failures;
}
