import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export function createOpenApiAjv(openapi) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(openapi, 'match-api-v1');

  const validators = new Map();
  return {
    validateSchema(schemaName, value) {
      if (!validators.has(schemaName)) {
        validators.set(schemaName, ajv.compile({
          $ref: `match-api-v1#/components/schemas/${schemaName}`,
        }));
      }
      const validator = validators.get(schemaName);
      return {
        valid: validator(value),
        errors: validator.errors || [],
      };
    },
  };
}

export function formatAjvErrors(errors) {
  return errors.map((error) => {
    const location = error.instancePath || '$';
    return `${location} ${error.message} (${error.schemaPath})`;
  }).join('\n');
}
