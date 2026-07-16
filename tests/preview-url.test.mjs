import { describe, expect, it } from "vitest";
import { extractVitePreviewUrl } from "../scripts/preview-url.mjs";

describe("extractVitePreviewUrl", () => {
  it("extracts an unstyled Vite preview URL", () => {
    expect(extractVitePreviewUrl("Local: http://127.0.0.1:43123/\n")).toBe(
      "http://127.0.0.1:43123",
    );
  });

  it("strips ANSI styling embedded between the host and dynamic port", () => {
    const output =
      "Local: \u001b[36mhttp://127.0.0.1:\u001b[1m38041\u001b[22m/\u001b[39m";
    expect(extractVitePreviewUrl(output)).toBe("http://127.0.0.1:38041");
  });

  it("parses output accumulated across stream chunks", () => {
    let output = "Local: \u001b[36mhttp://127.0.";
    expect(extractVitePreviewUrl(output)).toBeNull();
    output += "0.1:\u001b[1m51234\u001b[22m/\u001b[39m";
    expect(extractVitePreviewUrl(output)).toBe("http://127.0.0.1:51234");
  });
});
