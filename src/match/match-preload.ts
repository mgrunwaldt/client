export interface MatchPreloadUpdate {
  progress: number;
  stage: string;
  detail: string;
}

type MatchPreloadReporter = (update: MatchPreloadUpdate) => void;

let matchExperiencePreload: Promise<void> | null = null;
let latestUpdate: MatchPreloadUpdate | null = null;
const reporters = new Set<MatchPreloadReporter>();

function report(progress: number, stage: string, detail: string) {
  latestUpdate = {
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    stage,
    detail,
  };
  reporters.forEach((reporter) => reporter(latestUpdate!));
}

function trackReporter(
  preload: Promise<void>,
  reporter: MatchPreloadReporter | undefined,
) {
  if (!reporter) return preload;
  reporters.add(reporter);
  if (latestUpdate) reporter(latestUpdate);
  return preload.finally(() => reporters.delete(reporter));
}

export function preloadMatchExperience(reporter?: MatchPreloadReporter) {
  if (matchExperiencePreload) {
    return trackReporter(matchExperiencePreload, reporter);
  }

  matchExperiencePreload = (async () => {
    report(8, "Live feed", "Loading the match timeline.");
    await import("../app/(main)/Match/MatchScreen");

    report(20, "Field runtime", "Loading the 3D match renderer.");
    const [fieldAssets] = await Promise.all([
      import("../app/(game)/field-assets"),
      import("../app/(game)/GameScene"),
    ]);

    report(34, "Field assets", "Preparing stadium and player models.");
    await fieldAssets.preloadMatchFieldAssets((assetProgress) => {
      report(
        34 + assetProgress.progress * 0.64,
        "Field assets",
        assetProgress.currentAsset
          ? `Preparing ${assetProgress.currentAsset.split("/").pop()}.`
          : "Preparing stadium, players, ball, and controls.",
      );
    });

    report(100, "Ready", "Match presentation is ready.");
  })().catch((error: unknown) => {
    matchExperiencePreload = null;
    latestUpdate = null;
    throw error;
  });

  return trackReporter(matchExperiencePreload, reporter);
}
