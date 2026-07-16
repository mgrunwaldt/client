import { stripVTControlCharacters } from "node:util";

export function extractVitePreviewUrl(output) {
  const cleanOutput = stripVTControlCharacters(output);
  const url = cleanOutput.match(/http:\/\/127\.0\.0\.1:\d+\//u)?.[0];
  return url?.slice(0, -1) ?? null;
}
