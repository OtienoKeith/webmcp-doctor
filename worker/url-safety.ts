const forbiddenHostSuffixes = [".localhost", ".local", ".internal", ".home.arpa", ".test"];

function isForbiddenIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isForbiddenIpv6(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!normalized.includes(":")) return false;
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized);
}

export function normalizePublicTarget(input: string) {
  if (!input.trim()) throw new Error("Enter a public website URL.");
  if (input.length > 2048) throw new Error("The URL is too long.");

  let target: URL;
  try {
    target = new URL(input.trim());
  } catch {
    throw new Error("Enter a complete URL beginning with https:// or http://.");
  }

  if (!['https:', 'http:'].includes(target.protocol)) throw new Error("Only public HTTP and HTTPS websites can be scanned.");
  if (target.username || target.password) throw new Error("URLs containing credentials cannot be scanned.");

  const hostname = target.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || !hostname.includes(".") || forbiddenHostSuffixes.some((suffix) => hostname.endsWith(suffix)) || isForbiddenIpv4(hostname) || isForbiddenIpv6(hostname)) {
    throw new Error("Private, local, and internal network addresses cannot be scanned.");
  }

  target.hash = "";
  return target.toString();
}

export function isPublicHttpUrl(input: string) {
  try {
    normalizePublicTarget(input);
    return true;
  } catch {
    return false;
  }
}
