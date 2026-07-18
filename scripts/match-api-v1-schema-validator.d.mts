interface SchemaValidationError {
  instancePath: string;
  keyword: string;
  message?: string;
}

interface MatchApiV1SchemaValidator {
  validate(
    schemaName: string,
    value: unknown,
  ): { errors: SchemaValidationError[]; valid: boolean };
}

export function createMatchApiV1SchemaValidator(
  openapi: Record<string, unknown>,
): MatchApiV1SchemaValidator;

export function formatSchemaErrors(errors: SchemaValidationError[]): string;
