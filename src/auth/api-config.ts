export type MatchApiTransport = "cookie" | "bearer";

export interface ValidMatchApiConfig {
  valid: true;
  baseUrl: string;
  origin: string;
  transport: MatchApiTransport;
}

export interface InvalidMatchApiConfig {
  valid: false;
  diagnostic: string;
}

export type MatchApiConfig = ValidMatchApiConfig | InvalidMatchApiConfig;

export class MatchApiConfigurationError extends Error {
  readonly code = "INVALID_MATCH_API_BASE_URL";

  constructor(readonly diagnostic: string) {
    super(diagnostic);
    this.name = "MatchApiConfigurationError";
  }
}

function browserOrigin() {
  const runtime = globalThis as typeof globalThis & {
    location?: { origin?: string };
  };
  if (runtime.location?.origin) {
    return runtime.location.origin;
  }
  return "http://localhost";
}

function normalizePathname(pathname: string) {
  if (pathname === "/") return "";
  return pathname.replace(/\/+$/, "");
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function invalid(diagnostic: string): InvalidMatchApiConfig {
  return { valid: false, diagnostic };
}

/**
 * Resolves the public Match API endpoint once at application startup. Relative
 * paths preserve same-origin cookie transport; a distinct origin is bearer-only.
 */
export function resolveMatchApiConfig(
  configuredBaseUrl: string | undefined,
  applicationOrigin = browserOrigin(),
): MatchApiConfig {
  let origin: URL;
  try {
    origin = new URL(applicationOrigin);
  } catch {
    return invalid(
      "The application origin is invalid; the match service is unavailable.",
    );
  }

  const value = configuredBaseUrl?.trim() || "/api";
  const isPath = value.startsWith("/");
  if (!isPath && !/^https?:\/\//i.test(value)) {
    return invalid(
      "VITE_MATCH_API_BASE_URL must be an absolute URL or a same-origin path starting with '/'.",
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(value, origin);
  } catch {
    return invalid("VITE_MATCH_API_BASE_URL is not a valid URL.");
  }

  if (endpoint.username || endpoint.password) {
    return invalid(
      "VITE_MATCH_API_BASE_URL must not contain user credentials.",
    );
  }
  if (endpoint.search || endpoint.hash) {
    return invalid(
      "VITE_MATCH_API_BASE_URL must not include a query string or fragment.",
    );
  }
  if (
    endpoint.protocol !== "https:" &&
    !(endpoint.protocol === "http:" && isLoopbackHost(endpoint.hostname))
  ) {
    return invalid(
      "A direct Match API URL must use HTTPS outside localhost development.",
    );
  }

  const isSameOrigin = endpoint.origin === origin.origin;
  const pathname = normalizePathname(endpoint.pathname);
  return {
    valid: true,
    baseUrl:
      isSameOrigin && isPath
        ? pathname || "/"
        : `${endpoint.origin}${pathname}`,
    origin: endpoint.origin,
    transport: isSameOrigin ? "cookie" : "bearer",
  };
}

export function requireMatchApiConfig(
  config: MatchApiConfig,
): ValidMatchApiConfig {
  if (config.valid) return config;
  throw new MatchApiConfigurationError(config.diagnostic);
}

export function joinMatchApiPath(baseUrl: string, path: string) {
  if (!path.startsWith("/")) {
    throw new Error("Match API paths must begin with '/'.");
  }
  return `${baseUrl === "/" ? "" : baseUrl}${path}`;
}
