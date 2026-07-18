interface CanonicalChoiceBranch {
  choiceIds: string[];
  schemaName: string;
}

export type CanonicalChoiceMatrix = Map<string, CanonicalChoiceBranch>;

export function buildCanonicalChoiceMatrix(
  openapi: Record<string, unknown>,
): CanonicalChoiceMatrix;

export function assertCanonicalFixtureRelations(payload: {
  choiceMatrix: CanonicalChoiceMatrix;
  file: string;
  schemaName: string;
  value: unknown;
}): void;
