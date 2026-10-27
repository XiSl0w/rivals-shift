export type PlayerId = string | number;
export type JsonObject = Record<string, unknown>;
export type JsonResponse = JsonObject | JsonObject[];
export interface PlayerSearchResult extends JsonObject {
    uid: PlayerId;
    name: string;
}
export type PlayerSearchResponse = PlayerSearchResult[] | JsonObject;
export type PlayerProfileResponse = JsonObject;
export type PlayerHeroesResponse = JsonResponse;
export type PlayerTeammatesResponse = JsonResponse;
export type PlayerCrosshairsResponse = JsonResponse;
export type PlayerMatchesResponse = JsonObject;
export type MatchResponse = JsonObject;
export type LiveMatchResponse = JsonObject;
export type PlayerProficiencyResponse = JsonResponse;
export type PlayerPunishmentsResponse = JsonResponse;
export type PlayerNameHistoryResponse = JsonResponse;
export interface TransportRequest {
    url: string;
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: Readonly<JsonObject>;
    signal: AbortSignal;
}
export interface TransportResponse<T = unknown> {
    status: number;
    data: T;
    headers?: Readonly<Record<string, string>>;
}
export type RivalsDataTransport = (request: TransportRequest) => Promise<TransportResponse>;
export interface ProxyRequestProxy {
    url: string;
}
export interface ProxyServerOptions {
    /** Proxy API endpoint. Defaults to http://localhost:8191/v1. */
    endpoint?: string;
    /** Maximum time the proxy may spend on the upstream request. */
    maxTimeoutMs?: number;
    /** ID of an existing persistent proxy session. */
    session?: string;
    /** Rotate the session after this many minutes. */
    sessionTtlMinutes?: number;
    /** Optional per-request outbound proxy. Ignored when session is set. */
    proxy?: ProxyRequestProxy;
    /** Additional delay before the proxy returns the rendered response. */
    waitInSeconds?: number;
    /** Skip images, CSS, fonts, and other media in the proxy browser. */
    disableMedia?: boolean;
    /** Fetch implementation used to contact the proxy server. */
    fetchImplementation?: typeof fetch;
}
export interface RivalsDataClientOptions {
    baseUrl?: string;
    transport?: RivalsDataTransport;
    /** Proxy-server settings, or false to contact Rivals Data directly. */
    proxyServer?: ProxyServerOptions | false;
    timeoutMs?: number;
    cacheTtlMs?: number;
    allowFreshMatches?: boolean;
}
export interface PlayerProfileOptions {
    preferCache?: boolean;
    signal?: AbortSignal;
}
export interface SeasonOptions {
    season?: number;
    signal?: AbortSignal;
}
export interface PlayerTeammatesOptions extends SeasonOptions {
    mode?: string;
}
export interface PlayerMatchesOptions extends SeasonOptions {
    cursor?: string;
    mode?: string;
    heroId?: number;
    teammateUid?: PlayerId;
    fresh?: boolean;
}
export interface LiveMatchOptions {
    signal?: AbortSignal;
}
export interface PlayerBundleOptions extends SeasonOptions {
    includeMatches?: boolean;
}
export type SdkResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: unknown;
};
export interface PlayerDataBundle {
    uid: number;
    profile: SdkResult<PlayerProfileResponse>;
    heroes: SdkResult<PlayerHeroesResponse>;
    teammates: SdkResult<PlayerTeammatesResponse>;
    crosshairs: SdkResult<PlayerCrosshairsResponse>;
    proficiency: SdkResult<PlayerProficiencyResponse>;
    punishments: SdkResult<PlayerPunishmentsResponse>;
    nameHistory: SdkResult<PlayerNameHistoryResponse>;
    matches?: SdkResult<PlayerMatchesResponse>;
}
//# sourceMappingURL=types.d.ts.map
