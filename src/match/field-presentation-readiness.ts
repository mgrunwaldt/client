interface FieldPresentationSnapshot {
  matchId: string;
  sceneKey: string;
}

let readyPresentation: FieldPresentationSnapshot | null = null;
let presentedMatchId: string | null = null;
const listeners = new Set<() => void>();

export function reportFieldPresentationReadiness(
  snapshot: FieldPresentationSnapshot,
  ready: boolean,
) {
  if (ready) {
    readyPresentation = snapshot;
  } else if (
    readyPresentation?.matchId === snapshot.matchId &&
    readyPresentation.sceneKey === snapshot.sceneKey
  ) {
    readyPresentation = null;
  }
  listeners.forEach((listener) => listener());
}

export function waitForFieldPresentation(
  matchId: string,
  timeoutMs = 30_000,
): Promise<void> {
  if (readyPresentation?.matchId === matchId) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const settleIfReady = () => {
      if (readyPresentation?.matchId !== matchId) return;
      window.clearTimeout(timeout);
      listeners.delete(settleIfReady);
      resolve();
    };
    const timeout = window.setTimeout(() => {
      listeners.delete(settleIfReady);
      reject(new Error("The match field did not become ready in time."));
    }, timeoutMs);

    listeners.add(settleIfReady);
    settleIfReady();
  });
}

export function reportFieldPresented(matchId: string) {
  presentedMatchId = matchId;
}

export function hasPresentedFieldForMatch(matchId: string) {
  return presentedMatchId === matchId;
}

export function resetFieldPresentationReadiness() {
  readyPresentation = null;
  presentedMatchId = null;
  listeners.forEach((listener) => listener());
}
