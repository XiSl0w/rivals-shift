export type RivalsDataErrorCode = "INVALID_ARGUMENT" | "FRESH_MATCHES_DISABLED" | "NETWORK_ERROR" | "TIMEOUT" | "UPSTREAM_ERROR" | "INVALID_RESPONSE";
export declare class RivalsDataError extends Error {
    readonly code: RivalsDataErrorCode;
    readonly status: number | undefined;
    readonly details: unknown;
    constructor(code: RivalsDataErrorCode, message: string, options?: {
        status?: number;
        details?: unknown;
        cause?: unknown;
    });
}
//# sourceMappingURL=errors.d.ts.map