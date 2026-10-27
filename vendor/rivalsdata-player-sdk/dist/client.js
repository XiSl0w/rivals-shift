import { RivalsDataError } from "./errors.js";
import { createFetchTransport, createProxyTransport } from "./transport.js";
const DEFAULT_BASE_URL = "https://api.rivalsdata.com";
// Leave a small margin for the proxy's default 60-second upstream timeout to
// return its JSON envelope before the SDK aborts the local HTTP request.
const DEFAULT_TIMEOUT_MS = 65_000;
const DEFAULT_CACHE_TTL_MS = 30_000;
const MAX_SAFE_ID = Number.MAX_SAFE_INTEGER;
export class RivalsDataClient {
    baseUrl;
    timeoutMs;
    cacheTtlMs;
    allowFreshMatches;
    transport;
    cache = new Map();
    constructor(options = {}) {
        this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
        this.timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
        this.cacheTtlMs = nonNegativeInteger(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS, "cacheTtlMs");
        this.allowFreshMatches = options.allowFreshMatches ?? false;
        this.transport = options.transport ?? (options.proxyServer === false
            ? createFetchTransport()
            : createProxyTransport(options.proxyServer));
    }
    searchPlayers(name, options = {}) {
        return this.post("/players/search", { name: requiredText(name, "name", 80) }, options);
    }
    getPlayer(uid, options = {}) {
        return this.post("/player", compact({
            uid: normalizeId(uid, "uid"),
            prefer_cache: options.preferCache === undefined
                ? undefined
                : Number(options.preferCache),
        }), options);
    }
    /**
     * Ask Rivals Data to update the player upstream before returning the profile.
     * This mirrors the website refresh request: POST /player with only { uid }.
     */
    refreshPlayer(uid, options = {}) {
        return this.post("/player", { uid: normalizeId(uid, "uid") }, {
            ...(options.signal ? { signal: options.signal } : {}),
            cacheTtlMs: 0,
        });
    }
    getPlayerHeroes(uid, options = {}) {
        return this.post("/player/heroes", compact({
            uid: normalizeId(uid, "uid"),
            season: optionalSeason(options.season),
        }), options);
    }
    getPlayerTeammates(uid, options = {}) {
        return this.post("/player/teammates", compact({
            uid: normalizeId(uid, "uid"),
            season: optionalSeason(options.season),
            mode: optionalText(options.mode, "mode", 40),
        }), options);
    }
    getPlayerCrosshairs(uid, options = {}) {
        return this.post("/player/crosshairs", { uid: normalizeId(uid, "uid") }, options);
    }
    getPlayerMatches(uid, options = {}) {
        const normalizedUid = normalizeId(uid, "uid");
        const common = compact({
            uid: normalizedUid,
            cursor: optionalText(options.cursor, "cursor", 256),
            season: optionalSeason(options.season),
        });
        if (options.fresh) {
            if (!this.allowFreshMatches) {
                throw new RivalsDataError("FRESH_MATCHES_DISABLED", "Fresh match-history requests are disabled. Construct the client with allowFreshMatches: true to enable them.");
            }
            return this.post("/player/matches", common, {
                ...(options.signal ? { signal: options.signal } : {}),
                cacheTtlMs: 0,
            });
        }
        return this.post("/player/matches/cached", compact({
            ...common,
            mode: optionalText(options.mode, "mode", 40),
            hero: optionalInteger(options.heroId, "heroId", 1, MAX_SAFE_ID),
            teammate: options.teammateUid === undefined
                ? undefined
                : normalizeId(options.teammateUid, "teammateUid"),
        }), options);
    }
    getMatch(matchId, options = {}) {
        return this.post("/match", { match_id: requiredText(matchId, "matchId", 128) }, options);
    }
    getLiveMatch(uid, options = {}) {
        return this.post("/live", compact({
            uid: normalizeId(uid, "uid"),
        }), {
            ...(options.signal ? { signal: options.signal } : {}),
            cacheTtlMs: 0,
        });
    }
    getPlayerProficiency(uid, options = {}) {
        return this.post("/player/proficiency", { uid: normalizeId(uid, "uid") }, options);
    }
    getPlayerSkins(uid, options = {}) {
        return this.post("/player/skins", { uid: normalizeId(uid, "uid") }, options);
    }
    getPlayerPunishments(uid, options = {}) {
        return this.post("/player/punishments", { uid: normalizeId(uid, "uid") }, options);
    }
    getPlayerNameHistory(uid, options = {}) {
        return this.post("/player/name-history", { uid: normalizeId(uid, "uid") }, options);
    }
    async getAllPlayerData(uid, options = {}) {
        const normalizedUid = normalizeId(uid, "uid");
        const signalOptions = options.signal ? { signal: options.signal } : {};
        const seasonOptions = {
            ...signalOptions,
            ...(options.season === undefined ? {} : { season: options.season }),
        };
        const requests = {
            profile: this.getPlayer(normalizedUid, { preferCache: true, ...signalOptions }),
            heroes: this.getPlayerHeroes(normalizedUid, seasonOptions),
            teammates: this.getPlayerTeammates(normalizedUid, seasonOptions),
            crosshairs: this.getPlayerCrosshairs(normalizedUid, signalOptions),
            proficiency: this.getPlayerProficiency(normalizedUid, signalOptions),
            punishments: this.getPlayerPunishments(normalizedUid, signalOptions),
            nameHistory: this.getPlayerNameHistory(normalizedUid, signalOptions),
        };
        if (options.includeMatches !== false) {
            requests.matches = this.getPlayerMatches(normalizedUid, seasonOptions);
        }
        const entries = await Promise.all(Object.entries(requests).map(async ([key, promise]) => [
            key,
            await settle(promise),
        ]));
        return {
            uid: normalizedUid,
            ...Object.fromEntries(entries),
        };
    }
    clearCache() {
        this.cache.clear();
    }
    post(path, body, options = {}) {
        const ttl = options.cacheTtlMs ?? this.cacheTtlMs;
        const cacheKey = `${path}:${JSON.stringify(body)}`;
        const cached = this.cache.get(cacheKey);
        if (ttl > 0 && cached && cached.expiresAt > Date.now()) {
            return cached.promise;
        }
        const promise = this.execute(path, body, options.signal);
        if (ttl > 0) {
            this.cache.set(cacheKey, {
                expiresAt: Date.now() + ttl,
                promise,
            });
            void promise.catch(() => {
                if (this.cache.get(cacheKey)?.promise === promise) {
                    this.cache.delete(cacheKey);
                }
            });
        }
        return promise;
    }
    async execute(path, body, callerSignal) {
        const controller = new AbortController();
        const onAbort = () => controller.abort(callerSignal?.reason);
        if (callerSignal?.aborted)
            onAbort();
        else
            callerSignal?.addEventListener("abort", onAbort, { once: true });
        const timeout = setTimeout(() => controller.abort(new Error("Request timed out")), this.timeoutMs);
        let response;
        try {
            response = await this.transport({
                url: `${this.baseUrl}${path}`,
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body,
                signal: controller.signal,
            });
        }
        catch (error) {
            if (controller.signal.aborted && !callerSignal?.aborted) {
                throw new RivalsDataError("TIMEOUT", "The request timed out.", {
                    cause: error,
                });
            }
            if (error instanceof RivalsDataError)
                throw error;
            throw new RivalsDataError("NETWORK_ERROR", "The request failed.", {
                cause: error,
            });
        }
        finally {
            clearTimeout(timeout);
            callerSignal?.removeEventListener("abort", onAbort);
        }
        if (response.status < 200 || response.status >= 300) {
            throw new RivalsDataError("UPSTREAM_ERROR", readErrorMessage(response.data, response.status), { status: response.status, details: response.data });
        }
        if (response.data === undefined) {
            throw new RivalsDataError("INVALID_RESPONSE", "The API returned no response body.", { status: response.status });
        }
        return response.data;
    }
}
async function settle(promise) {
    try {
        return { ok: true, data: await promise };
    }
    catch (error) {
        return { ok: false, error };
    }
}
function normalizeBaseUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch (error) {
        throw new RivalsDataError("INVALID_ARGUMENT", "baseUrl must be a valid URL.", {
            cause: error,
        });
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new RivalsDataError("INVALID_ARGUMENT", "baseUrl must use HTTP or HTTPS.");
    }
    return url.toString().replace(/\/$/, "");
}
function normalizeId(value, name) {
    const stringValue = String(value);
    if (!/^\d+$/.test(stringValue)) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} must be an integer.`);
    }
    return optionalInteger(Number(stringValue), name, 1, MAX_SAFE_ID);
}
function optionalInteger(value, name, min, max) {
    if (value === undefined)
        return undefined;
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} must be an integer between ${min} and ${max}.`);
    }
    return value;
}
function optionalSeason(value) {
    return optionalInteger(value, "season", 1, 999);
}
function requiredText(value, name, maxLength) {
    const text = value.trim();
    if (!text) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} is required.`);
    }
    if (text.length > maxLength) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} cannot exceed ${maxLength} characters.`);
    }
    return text;
}
function optionalText(value, name, maxLength) {
    return value === undefined ? undefined : requiredText(value, name, maxLength);
}
function positiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} must be positive.`);
    }
    return value;
}
function nonNegativeInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RivalsDataError("INVALID_ARGUMENT", `${name} cannot be negative.`);
    }
    return value;
}
function compact(object) {
    return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}
function readErrorMessage(data, status) {
    if (typeof data === "object" && data !== null && "error" in data) {
        const error = data.error;
        if (typeof error === "string" && error)
            return error;
    }
    return `Rivals Data returned HTTP ${status}.`;
}
//# sourceMappingURL=client.js.map
