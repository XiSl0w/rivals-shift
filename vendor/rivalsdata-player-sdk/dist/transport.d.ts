import type { ProxyServerOptions, RivalsDataTransport } from "./types.js";
export declare function createFetchTransport(fetchImplementation?: typeof fetch): RivalsDataTransport;
/**
 * Wraps Rivals Data calls in the proxy server's request.post command.
 *
 * The proxy API defines POST payloads as form data, so JSON object values from
 * the SDK are converted to application/x-www-form-urlencoded postData.
 */
export declare function createProxyTransport(options?: ProxyServerOptions): RivalsDataTransport;
//# sourceMappingURL=transport.d.ts.map