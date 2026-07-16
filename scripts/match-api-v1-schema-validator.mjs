import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const OPENAPI_SCHEMA_ID =
  "https://overgoal.invalid/contracts/match-api/v1/openapi.json";

export function createMatchApiV1SchemaValidator(openapi) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);
  ajv.addSchema(openapi, OPENAPI_SCHEMA_ID);

  return {
    validate(schemaName, value) {
      const validate = ajv.getSchema(
        `${OPENAPI_SCHEMA_ID}#/components/schemas/${schemaName}`,
      );
      if (!validate) {
        throw new Error(`unknown canonical OpenAPI schema ${schemaName}`);
      }

      const valid = validate(value);
      return { errors: valid ? [] : (validate.errors ?? []), valid };
    },
  };
}

export function formatSchemaErrors(errors) {
  return errors
    .map((error) => `${error.instancePath || "$"}: ${error.message}`)
    .join("; ");
}
