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

// Three.js/WebGL state survives Playwright contexts inside one browser process.
// Use one case per process by default so a prior scene cannot corrupt later UI.
const DEFAULT_CASES_PER_PROCESS = 1;
const MAX_CASES_PER_PROCESS = 16;
const MAX_SHARD_TOTAL = 32;

function escapedPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function pathSegment(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
}

export function playwrightCasesPerProcess(value) {
  if (value === undefined || value === "") return DEFAULT_CASES_PER_PROCESS;

  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_CASES_PER_PROCESS
  ) {
    throw new Error(
      `OVERGOAL_PLAYWRIGHT_CASES_PER_PROCESS must be an integer from 1 to ${MAX_CASES_PER_PROCESS}`,
    );
  }
  return parsed;
}

export function playwrightShard(indexValue, totalValue) {
  if (
    (indexValue === undefined || indexValue === "") &&
    (totalValue === undefined || totalValue === "")
  ) {
    return { index: 1, total: 1 };
  }
  if (
    indexValue === undefined ||
    indexValue === "" ||
    totalValue === undefined ||
    totalValue === ""
  ) {
    throw new Error(
      "OVERGOAL_PLAYWRIGHT_SHARD_INDEX and OVERGOAL_PLAYWRIGHT_SHARD_TOTAL must be set together",
    );
  }

  const index = Number(indexValue);
  const total = Number(totalValue);
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(total) ||
    total < 1 ||
    total > MAX_SHARD_TOTAL ||
    index < 1 ||
    index > total
  ) {
    throw new Error(
      `Playwright shard must use an integer index from 1 through a total no greater than ${MAX_SHARD_TOTAL}`,
    );
  }
  return { index, total };
}

function caseIdentity(entry) {
  return `${entry.projectName}\u0000${entry.file}\u0000${String(entry.line).padStart(10, "0")}\u0000${entry.title}`;
}

export function shardPlaywrightCases(cases, shard) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("Playwright shard requires a non-empty case inventory");
  }
  const { index, total } = playwrightShard(shard?.index, shard?.total);
  const sorted = [...cases].sort((left, right) => {
    const leftIdentity = caseIdentity(left);
    const rightIdentity = caseIdentity(right);
    if (leftIdentity < rightIdentity) return -1;
    if (leftIdentity > rightIdentity) return 1;
    return 0;
  });
  const selected = sorted.filter(
    (_, position) => position % total === index - 1,
  );
  if (selected.length === 0) {
    throw new Error(
      `Playwright shard ${index}/${total} contains no test cases`,
    );
  }
  return selected;
}

export function groupPlaywrightCases(cases, casesPerProcess) {
  if (!Number.isInteger(casesPerProcess) || casesPerProcess < 1) {
    throw new Error("Playwright cases per process must be a positive integer");
  }

  const projects = new Map();
  for (const entry of cases) {
    const projectCases = projects.get(entry.projectName) ?? [];
    projectCases.push(entry);
    projects.set(entry.projectName, projectCases);
  }

  const batches = [];
  for (const [projectName, projectCases] of projects) {
    for (let start = 0; start < projectCases.length; start += casesPerProcess) {
      batches.push({
        projectName,
        cases: projectCases.slice(start, start + casesPerProcess),
      });
    }
  }
  return batches;
}

export function batchedPlaywrightArgs(
  playwrightCli,
  batch,
  index,
  updateSnapshots = false,
) {
  if (!batch || !Array.isArray(batch.cases) || batch.cases.length === 0) {
    throw new Error("Playwright batch must include at least one test case");
  }

  const ordinal = String(index + 1).padStart(3, "0");
  const locations = [
    ...new Set(batch.cases.map((entry) => `e2e/${entry.file}:${entry.line}`)),
  ];
  const args = [
    playwrightCli,
    "test",
    ...locations,
    `--project=${batch.projectName}`,
    "--grep",
    `(?:${batch.cases.map((entry) => escapedPattern(entry.title)).join("|")})$`,
    `--output=test-results/batched/${ordinal}-${pathSegment(batch.projectName)}`,
  ];
  if (updateSnapshots) args.push("--update-snapshots");
  return args;
}

export async function runPlaywrightBatches(batches, runBatch) {
  const failures = [];
  for (const [index, batch] of batches.entries()) {
    try {
      await runBatch(batch, index);
    } catch (error) {
      failures.push({ batch, error });
    }
  }
  return failures;
}
