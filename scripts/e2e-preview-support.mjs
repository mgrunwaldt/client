import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".fbx", "application/octet-stream"],
  [".glb", "model/gltf-binary"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
]);

export function previewCacheControl(path) {
  return path.includes(`${sep}assets${sep}`)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

export function previewContentType(path) {
  return (
    contentTypes.get(extname(path).toLowerCase()) ?? "application/octet-stream"
  );
}

export async function resolvePreviewRequestPath(rootArgument, requestUrl) {
  const root = resolve(rootArgument);
  const indexPath = resolve(root, "index.html");
  const pathname = decodeURIComponent(
    new URL(requestUrl ?? "/", "https://127.0.0.1").pathname,
  );
  const candidate = resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return null;
  }

  try {
    const metadata = await stat(candidate);
    if (metadata.isFile()) return { path: candidate, metadata };
    if (metadata.isDirectory()) {
      const directoryIndex = resolve(candidate, "index.html");
      return { path: directoryIndex, metadata: await stat(directoryIndex) };
    }
  } catch {
    if (extname(candidate)) return null;
  }

  return { path: indexPath, metadata: await stat(indexPath) };
}
