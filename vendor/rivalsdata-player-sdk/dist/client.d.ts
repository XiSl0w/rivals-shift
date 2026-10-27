import type { LiveMatchOptions, LiveMatchResponse, MatchResponse, PlayerBundleOptions, PlayerCrosshairsResponse, PlayerDataBundle, PlayerHeroesResponse, PlayerId, PlayerMatchesOptions, PlayerMatchesResponse, PlayerNameHistoryResponse, PlayerProfileOptions, PlayerProfileResponse, PlayerProficiencyResponse, PlayerPunishmentsResponse, PlayerSearchResponse, PlayerTeammatesOptions, PlayerTeammatesResponse, RivalsDataClientOptions, SeasonOptions } from "./types.js";
export declare class RivalsDataClient {
    readonly baseUrl: string;
    readonly timeoutMs: number;
    readonly cacheTtlMs: number;
    readonly allowFreshMatches: boolean;
    private readonly transport;
    private readonly cache;
    constructor(options?: RivalsDataClientOptions);
    searchPlayers<T = PlayerSearchResponse>(name: string, options?: {
        signal?: AbortSignal;
    }): Promise<T>;
    getPlayer<T = PlayerProfileResponse>(uid: PlayerId, options?: PlayerProfileOptions): Promise<T>;
    /**
     * Ask Rivals Data to update the player upstream before returning the profile.
     * This mirrors the website refresh request: POST /player with only { uid }.
     */
    refreshPlayer<T = PlayerProfileResponse>(uid: PlayerId, options?: {
        signal?: AbortSignal;
    }): Promise<T>;
    getPlayerHeroes<T = PlayerHeroesResponse>(uid: PlayerId, options?: SeasonOptions): Promise<T>;
    getPlayerTeammates<T = PlayerTeammatesResponse>(uid: PlayerId, options?: PlayerTeammatesOptions): Promise<T>;
    getPlayerCrosshairs<T = PlayerCrosshairsResponse>(uid: PlayerId, options?: {
        signal?: AbortSignal;
    }): Promise<T>;
    getPlayerMatches<T = PlayerMatchesResponse>(uid: PlayerId, options?: PlayerMatchesOptions): Promise<T>;
    getMatch<T = MatchResponse>(matchId: string, options?: {
        signal?: AbortSignal;
    }): Promise<T>;
    getLiveMatch<T = LiveMatchResponse>(uid: PlayerId, options?: LiveMatchOptions): Promise<T>;
    getPlayerProficiency<T = PlayerProficiencyResponse>(uid: PlayerId, options?: {
        signal?: AbortSignal;
    }): Promise<T>;
    getPlayerSkins<T = unknown>(uid: PlayerId, options?: {
        signal?: AbortSignal;
    }): Promise<T>;
    getPlayerPunishments<T = PlayerPunishmentsResponse>(uid: PlayerId, options?: {
        signal?: AbortSignal;
    }): Promise<T>;
    getPlayerNameHistory<T = PlayerNameHistoryResponse>(uid: PlayerId, options?: {
        signal?: AbortSignal;
    }): Promise<T>;
    getAllPlayerData(uid: PlayerId, options?: PlayerBundleOptions): Promise<PlayerDataBundle>;
    clearCache(): void;
    private post;
    private execute;
}
//# sourceMappingURL=client.d.ts.map
