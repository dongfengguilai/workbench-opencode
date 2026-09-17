import { createHash, timingSafeEqual } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export interface SessionRepository {
  getSessionUser(sessionHash: string): Promise<string | null>;
}

export class AuthenticationError extends Error {
  public constructor(
    message: "Authentication required" | "Session expired",
    public readonly code: "missing" | "expired",
  ) {
    super(message);
  }
}

export class InvalidCredentialsError extends Error {}
export class IntranetAuthUnavailableError extends Error {}

export interface AuthenticatedIdentity {
  readonly provider: "local-admin" | "intranet";
  readonly subject: string;
  readonly displayName: string;
}

export interface IntranetAuthOptions {
  readonly intranetBaseUrl: string;
  readonly intranetTimeoutSeconds: number;
  readonly intranetVerifyTls: boolean;
  readonly localAdminEnabled: boolean;
  readonly localAdminUsername: string;
  readonly localAdminPassword: string;
  readonly localAdminDisplayName: string;
}

export interface IntranetHttpResult { readonly status: number; readonly body: Uint8Array; }
export type IntranetRequester = (url: URL, payload: Readonly<Record<string, string>>, timeoutSeconds: number, verifyTls: boolean) => Promise<IntranetHttpResult>;
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_TOKEN_BYTES = 64 * 1024;

export function sessionDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const key = segment.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(segment.slice(separator + 1).trim());
  }
  return null;
}

export async function requireSessionUser(
  repository: SessionRepository,
  cookieHeader: string | undefined,
  cookieName: string,
): Promise<string> {
  const token = readCookie(cookieHeader, cookieName);
  if (!token) throw new AuthenticationError("Authentication required", "missing");
  const userId = await repository.getSessionUser(sessionDigest(token));
  if (!userId) throw new AuthenticationError("Session expired", "expired");
  return userId;
}

export function authenticateLocalAdmin(
  submittedUsername: string,
  submittedPassword: string,
  configuredUsername: string,
  configuredPassword: string,
): boolean {
  return constantTimeEqual(submittedUsername, configuredUsername) && constantTimeEqual(submittedPassword, configuredPassword);
}

function constantTimeEqual(submitted: string, expected: string): boolean {
  const value = Buffer.from(submitted);
  const expectedValue = Buffer.from(expected);
  return value.length === expectedValue.length && timingSafeEqual(value, expectedValue);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function decodeIdentity(token: string, fallbackSubject: string): { readonly subject: string; readonly displayName: string } {
  const parts = token.split(".");
  const encoded = parts.length === 3 ? parts[1] : undefined;
  if (!encoded) throw new IntranetAuthUnavailableError("Intranet login returned an invalid token");
  let payload: Record<string, unknown> | null;
  try { payload = objectValue(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))); }
  catch { throw new IntranetAuthUnavailableError("Intranet login returned an invalid token"); }
  if (!payload) throw new IntranetAuthUnavailableError("Intranet login returned an invalid token");
  const subject = (typeof payload.name === "string" ? payload.name : fallbackSubject).trim();
  const displayName = (typeof payload.displayName === "string" ? payload.displayName
    : typeof payload.name === "string" ? payload.name : subject).trim();
  if (!subject || subject.length > 255 || !displayName) throw new IntranetAuthUnavailableError("Intranet login returned an invalid identity");
  return { subject, displayName: displayName.slice(0, 255) };
}

function postJson(url: URL, payload: Readonly<Record<string, string>>, timeoutSeconds: number, verifyTls: boolean): Promise<IntranetHttpResult> {
  const body = Buffer.from(JSON.stringify(payload));
  const transport = url.protocol === "https:" ? httpsRequest : url.protocol === "http:" ? httpRequest : null;
  if (!transport) return Promise.reject(new IntranetAuthUnavailableError("Intranet login URL must use HTTP or HTTPS"));
  return new Promise((resolve, reject) => {
    const request = transport(url, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "Content-Length": String(body.length) },
      ...(url.protocol === "https:" ? { rejectUnauthorized: verifyTls } : {}),
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (raw: Buffer | string) => {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new IntranetAuthUnavailableError("Intranet login response is too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks) }));
    });
    request.setTimeout(timeoutSeconds * 1_000, () => request.destroy(new IntranetAuthUnavailableError("Intranet login service is unavailable")));
    request.once("error", (error) => reject(error instanceof IntranetAuthUnavailableError ? error : new IntranetAuthUnavailableError("Intranet login service is unavailable", { cause: error })));
    request.end(body);
  });
}

export class IntranetAuthClient {
  public constructor(private readonly options: IntranetAuthOptions, private readonly requester: IntranetRequester = postJson) {
    if (!(options.intranetTimeoutSeconds > 0)) throw new Error("intranetTimeoutSeconds must be positive");
  }

  public async authenticate(username: string, password: string): Promise<AuthenticatedIdentity> {
    const normalizedUsername = (username || "").trim();
    const normalizedPassword = password || "";
    if (!normalizedUsername || normalizedUsername.length > 255 || !normalizedPassword || normalizedPassword.length > 1_024) {
      throw new InvalidCredentialsError("Invalid credentials");
    }
    if (this.options.localAdminEnabled && constantTimeEqual(normalizedUsername, this.options.localAdminUsername)) {
      if (!authenticateLocalAdmin(normalizedUsername, normalizedPassword, this.options.localAdminUsername, this.options.localAdminPassword)) {
        throw new InvalidCredentialsError("Invalid credentials");
      }
      return { provider: "local-admin", subject: this.options.localAdminUsername, displayName: this.options.localAdminDisplayName };
    }
    if (!this.options.intranetBaseUrl) throw new IntranetAuthUnavailableError("Intranet login service is unavailable");
    let result: IntranetHttpResult;
    try {
      result = await this.requester(new URL("api/app/user/login", `${this.options.intranetBaseUrl.replace(/\/$/u, "")}/`), {
        userName: normalizedUsername, password: normalizedPassword,
      }, this.options.intranetTimeoutSeconds, this.options.intranetVerifyTls);
    } catch (error) {
      if (error instanceof IntranetAuthUnavailableError) throw error;
      throw new IntranetAuthUnavailableError("Intranet login service is unavailable", { cause: error });
    }
    if (result.status === 401 || result.status === 403) throw new InvalidCredentialsError("Invalid credentials");
    let response: Record<string, unknown> | null;
    try { response = objectValue(JSON.parse(Buffer.from(result.body).toString("utf8"))); }
    catch { throw new IntranetAuthUnavailableError("Intranet login returned invalid JSON"); }
    if (!response) throw new IntranetAuthUnavailableError("Intranet login returned an invalid response");
    if (response.code === 406) throw new InvalidCredentialsError("Invalid credentials");
    if (result.status < 200 || result.status >= 300 || response.code !== 200) {
      throw new IntranetAuthUnavailableError(`Intranet login failed with HTTP ${String(result.status)}`);
    }
    const token = objectValue(response.data)?.token;
    if (typeof token !== "string" || !token || Buffer.byteLength(token) > MAX_TOKEN_BYTES) {
      throw new IntranetAuthUnavailableError("Intranet login response did not contain a valid token");
    }
    const identity = decodeIdentity(token, normalizedUsername);
    return { provider: "intranet", ...identity };
  }
}
