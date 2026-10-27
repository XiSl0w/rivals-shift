import { RivalsDataError } from "./errors.js";
const DEFAULT_PROXY_ENDPOINT = "http://localhost:8191/v1";
export function createFetchTransport(fetchImplementation = globalThis.fetch) {
    if (typeof fetchImplementation !== "function") {
        throw new RivalsDataError("INVALID_ARGUMENT", "No fetch implementation is available.");
    }
    return async ({ url, method, headers, body, signal }) => {
        let response;
        try {
            response = await fetchImplementation(url, {
                method,
                headers,
                body: JSON.stringify(body),
                signal,
                credentials: "omit",
                redirect: "manual",
            });
        }
        catch (error) {
            if (signal.aborted)
                throw error;
            throw new RivalsDataError("NETWORK_ERROR", "Could not reach the Rivals Data API.", { cause: error });
        }
        const contentType = response.headers.get("content-type") ?? "";
        let data;
        if (contentType.includes("application/json")) {
            data = await response.json().catch(() => null);
        }
        else {
            data = await response.text().catch(() => "");
        }
        return {
            status: response.status,
            data,
            headers: Object.fromEntries(response.headers.entries()),
        };
    };
}
/**
 * Wraps Rivals Data calls in the proxy server's request.post command.
 *
 * The proxy API defines POST payloads as form data, so JSON object values from
 * the SDK are converted to application/x-www-form-urlencoded postData.
 */
export function createProxyTransport(options = {}) {
    const endpoint = normalizeHttpUrl(options.endpoint ?? DEFAULT_PROXY_ENDPOINT, "proxyServer.endpoint");
    const maxTimeoutMs = positiveInteger(options.maxTimeoutMs ?? 60_000, "proxyServer.maxTimeoutMs");
    const session = optionalNonEmptyText(options.session, "proxyServer.session");
    const sessionTtlMinutes = optionalPositiveNumber(options.sessionTtlMinutes, "proxyServer.sessionTtlMinutes");
    const waitInSeconds = optionalNonNegativeNumber(options.waitInSeconds, "proxyServer.waitInSeconds");
    const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function") {
        throw new RivalsDataError("INVALID_ARGUMENT", "No fetch implementation is available for the proxy server.");
    }
    if (options.proxy !== undefined) {
        normalizeHttpUrl(options.proxy.url, "proxyServer.proxy.url", true);
    }
    return async ({ url, body, signal }) => {
        const command = compact({
            cmd: "request.post",
            url,
            postData: encodeFormBody(body),
            maxTimeout: maxTimeoutMs,
            session,
            session_ttl_minutes: sessionTtlMinutes,
            proxy: session === undefined ? options.proxy : undefined,
            waitInSeconds,
            disableMedia: options.disableMedia,
        });
        let response;
        try {
            response = await fetchImplementation(endpoint, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(command),
                signal,
                credentials: "omit",
                redirect: "manual",
            });
        }
        catch (error) {
            if (signal.aborted)
                throw error;
            throw new RivalsDataError("NETWORK_ERROR", "Could not reach the proxy server.", { cause: error });
        }
        const envelope = await response.json().catch(() => null);
        if (!response.ok) {
            throw new RivalsDataError("NETWORK_ERROR", readProxyMessage(envelope, `Proxy server returned HTTP ${response.status}.`), { status: response.status, details: envelope });
        }
        if (!isProxyEnvelope(envelope)) {
            throw new RivalsDataError("INVALID_RESPONSE", "The proxy server returned an invalid response.", { status: response.status, details: envelope });
        }
        if (envelope.status !== "ok" || envelope.solution === undefined) {
            throw new RivalsDataError("NETWORK_ERROR", readProxyMessage(envelope, "The proxy server could not complete the request."), { details: envelope });
        }
        const headers = stringHeaders(envelope.solution.headers);
        return {
            status: envelope.solution.status,
            data: parseProxyBody(envelope.solution.response, headers),
            headers,
        };
    };
}
function isProxyEnvelope(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const envelope = value;
    if (typeof envelope.status !== "string")
        return false;
    if (envelope.solution === undefined)
        return true;
    if (typeof envelope.solution !== "object" || envelope.solution === null) {
        return false;
    }
    const solution = envelope.solution;
    return Number.isInteger(solution.status) && "response" in solution;
}
function encodeFormBody(body) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
        if (value === undefined)
            continue;
        if (typeof value === "object" && value !== null) {
            form.set(key, JSON.stringify(value));
        }
        else {
            form.set(key, value === null ? "" : String(value));
        }
    }
    return form.toString();
}
function parseProxyBody(value, headers) {
    if (typeof value !== "string")
        return value;
    const contentType = Object.entries(headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "";
    if (contentType.includes("application/json") || looksLikeJson(value)) {
        try {
            return JSON.parse(value);
        }
        catch {
            // Preserve malformed or non-JSON response text for normal SDK handling.
        }
    }
    return value;
}
function looksLikeJson(value) {
    const first = value.trimStart()[0];
    return first === "{" || first === "[";
}
function stringHeaders(value) {
    if (typeof value !== "object" || value === null)
        return {};
    return Object.fromEntries(Object.entries(value).flatMap(([key, headerValue]) => typeof headerValue === "string" || typeof headerValue === "number"
        ? [[key, String(headerValue)]]
        : []));
}
function readProxyMessage(value, fallback) {
    if (typeof value === "object" && value !== null && "message" in value) {
        const message = value.message;
        if (typeof message === "string" && message.trim())
            return message;
    }
    return fallback;
}
function normalizeHttpUrl(value, name, allowProxy = false) {
    let url;
    try {
        url = new URL(value);
    }
    catch (error) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} must be a valid URL.`, {
            cause: error,
        });
    }
    const protocols = allowProxy
        ? ["http:", "https:", "socks4:", "socks5:"]
        : ["http:", "https:"];
    if (!protocols.includes(url.protocol)) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} must use ${allowProxy ? "HTTP, HTTPS, SOCKS4, or SOCKS5" : "HTTP or HTTPS"}.`);
    }
    return url.toString();
}
function positiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} must be positive.`);
    }
    return value;
}
function optionalPositiveNumber(value, name) {
    if (value === undefined)
        return undefined;
    if (!Number.isFinite(value) || value <= 0) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} must be positive.`);
    }
    return value;
}
function optionalNonNegativeNumber(value, name) {
    if (value === undefined)
        return undefined;
    if (!Number.isFinite(value) || value < 0) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} cannot be negative.`);
    }
    return value;
}
function optionalNonEmptyText(value, name) {
    if (value === undefined)
        return undefined;
    if (!value.trim()) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} cannot be empty.`);
    }
    return value;
}
function compact(object) {
    return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}
//# sourceMappingURL=transport.js.map