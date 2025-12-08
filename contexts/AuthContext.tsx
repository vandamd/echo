import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    ReactNode,
    useCallback,
    useRef,
} from "react";
import * as SecureStore from "expo-secure-store";
import SpotifySdk from "../modules/spotify-sdk";
import { AppState, AppStateStatus } from "react-native";
import { AUTH_TOKEN_KEY, TOKEN_EXPIRY_KEY, REFRESH_TOKEN_KEY } from "../constants/spotify";
import { logWarn, logError, logInfo } from "../utils/logger";
import { useNetworkState } from "../hooks/useNetworkState";

import type {
    AuthContextType,
    SpotifyPlaylist,
    SpotifySavedAlbum,
    SpotifySavedShow,
    SpotifyArtist,
    SavedTrackObject,
    SpotifyCurrentlyPlaying,
} from "../types/spotify";

import {
    loginWithSpotify,
    logoutFromSpotify,
    loadStoredAuth,
    fetchInitialDataInParallel,
} from "../services/spotifyAuth";
import {
    fetchPlaylists as fetchPlaylistsService,
    fetchMorePlaylists as fetchMorePlaylistsService,
    fetchAlbums as fetchAlbumsService,
    fetchMoreAlbums as fetchMoreAlbumsService,
    fetchPodcasts as fetchPodcastsService,
    fetchMorePodcasts as fetchMorePodcastsService,
    fetchArtists as fetchArtistsService,
    fetchMoreArtists as fetchMoreArtistsService,
    fetchSavedTracks as fetchSavedTracksService,
    fetchMoreSavedTracks as fetchMoreSavedTracksService,
    saveAlbum as saveAlbumService,
    removeAlbum as removeAlbumService,
    checkIfAlbumIsSaved as checkIfAlbumIsSavedService,
    followPodcast as followPodcastService,
    unfollowPodcast as unfollowPodcastService,
    checkIfFollowingPodcast as checkIfFollowingPodcastService,
    followArtist as followArtistService,
    unfollowArtist as unfollowArtistService,
    checkIfFollowingArtist as checkIfFollowingArtistService,
    fetchArtistTopTracks as fetchArtistTopTracksService,
    fetchArtistAlbums as fetchArtistAlbumsService,
    fetchMoreArtistAlbums as fetchMoreArtistAlbumsService,
} from "../services/spotifyData";
import {
    forceAppRemoteConnection,
    playTracksWithWebApi as playTracksWithWebApiService,
    getPlaybackState as getPlaybackStateService,
    startPlayback as startPlaybackService,
    pausePlayback as pausePlaybackService,
    skipToNext as skipToNextService,
    skipToPrevious as skipToPreviousService,
    toggleShuffle as toggleShuffleService,
    toggleRepeat as toggleRepeatService,
    seekToPosition as seekToPositionService,
    getCurrentTrack as getCurrentTrackService,
    getAlbumArt as getAlbumArtService,
    searchItems as searchItemsService,
    addTrackToPlaylist as addTrackToPlaylistService,
    playTrackWithContext as playTrackWithContextService,
    skipToIndex as skipToIndexService,
    addToLibrary as addToLibraryService,
    removeFromLibrary as removeFromLibraryService,
    getLibraryState as getLibraryStateService,
} from "../services/spotifyPlayback";

// Import utilities
import {
    loadCachedData,
    saveCachedData,
    clearCachedData,
    refreshSavedAlbumsFromCache,
    refreshFollowedPodcastsFromCache,
    refreshFollowedArtistsFromCache,
} from "../utils/cache";
import { makeApiRequest } from "../utils/spotifyApi";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    // Authentication state
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [user, setUser] = useState<any>(null);
    const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);

    // Data state
    const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
    const [playlistsNextUrl, setPlaylistsNextUrl] = useState<string | null>(
        null
    );
    const [albums, setAlbums] = useState<SpotifySavedAlbum[] | null>(null);
    const [albumsNextUrl, setAlbumsNextUrl] = useState<string | null>(null);
    const [podcasts, setPodcasts] = useState<SpotifySavedShow[] | null>(null);
    const [podcastsNextUrl, setPodcastsNextUrl] = useState<string | null>(null);
    const [artists, setArtists] = useState<SpotifyArtist[] | null>(null);
    const [artistsNextUrl, setArtistsNextUrl] = useState<string | null>(null);
    const [savedTracks, setSavedTracks] = useState<SavedTrackObject[] | null>(
        null
    );
    const [savedTracksNextUrl, setSavedTracksNextUrl] = useState<string | null>(
        null
    );

    // Loading states
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMorePlaylists, setIsLoadingMorePlaylists] = useState(false);
    const [isLoadingMoreAlbums, setIsLoadingMoreAlbums] = useState(false);
    const [isLoadingMorePodcasts, setIsLoadingMorePodcasts] = useState(false);
    const [isLoadingMoreArtists, setIsLoadingMoreArtists] = useState(false);
    const [isLoadingMoreSavedTracks, setIsLoadingMoreSavedTracks] =
        useState(false);
    const [isRefreshingPlaylists, setIsRefreshingPlaylists] = useState(false);
    const [isRefreshingAlbums, setIsRefreshingAlbums] = useState(false);
    const [isRefreshingPodcasts, setIsRefreshingPodcasts] = useState(false);
    const [isRefreshingArtists, setIsRefreshingArtists] = useState(false);
    const [isRefreshingSavedTracks, setIsRefreshingSavedTracks] =
        useState(false);

    // Connection state
    const [isConnectedToAppRemote, setIsConnectedToAppRemote] = useState(false);

    // Control flags
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [isFetchingInitialData, setIsFetchingInitialData] = useState(false);
    const [initialAuthProcessed, setInitialAuthProcessed] = useState(false);
    const [initialDataFetchTriggered, setInitialDataFetchTriggered] =
        useState(false);

    // App state for lifecycle management
    const [appState, setAppState] = useState(AppState.currentState);
    
    // Network state for connection management
    const { isOnline } = useNetworkState();

    // Disconnect timeout ref for delayed disconnection
    const disconnectTimeoutRef = useRef<number | null>(null);

    // Token update callback
    const handleTokenUpdate = useCallback(
        (newAccessToken: string, newRefreshToken?: string, expiry?: number) => {
            logInfo("AuthContext: Token update", {
                hasNewAccessToken: !!newAccessToken,
                hasNewRefreshToken: !!newRefreshToken,
                newExpiry: expiry ? new Date(expiry).toISOString() : null,
            });
            setAccessToken(newAccessToken);
            if (newRefreshToken) setRefreshToken(newRefreshToken);
            if (expiry) setTokenExpiry(expiry);
        },
        []
    );

    // User update callback
    const handleUserUpdate = useCallback((userData: any) => {
        setUser(userData);
    }, []);

    // Clear state callback for logout
    const clearState = useCallback(() => {
        logInfo("AuthContext: Clearing all state (logout)");
        setAccessToken(null);
        setRefreshToken(null);
        setUser(null);
        setTokenExpiry(null);
        setPlaylists(null);
        setPlaylistsNextUrl(null);
        setAlbums(null);
        setAlbumsNextUrl(null);
        setPodcasts(null);
        setPodcastsNextUrl(null);
        setArtists(null);
        setArtistsNextUrl(null);
        setSavedTracks(null);
        setSavedTracksNextUrl(null);
        setIsConnectedToAppRemote(false);
        setIsLoading(false);
        // Reset auth flow control flags
        setIsFetchingInitialData(false);
        setInitialAuthProcessed(false);
        setInitialDataFetchTriggered(false);
        logInfo("AuthContext: State cleared");
    }, []);

    // Wrapped makeApiRequest with context
    const makeApiRequestWithContext = useCallback(
        (
            url: string,
            errorMessage: string,
            isRefreshing = false,
            retryCount = 0
        ) =>
            makeApiRequest(
                url,
                errorMessage,
                accessToken,
                refreshToken,
                tokenExpiry,
                handleTokenUpdate,
                logout,
                isRefreshing,
                retryCount
            ),
        [accessToken, refreshToken, tokenExpiry, handleTokenUpdate]
    );

    // Token refresh lock at context level
    const [isRefreshingToken, setIsRefreshingToken] = useState(false);
    const [refreshPromise, setRefreshPromise] = useState<Promise<string | null> | null>(null);

    // Token validation method
    const ensureValidToken = useCallback(async (): Promise<string | null> => {
        // Always get the latest token data from secure storage to avoid stale state
        const [latestAccessToken, latestRefreshToken, latestTokenExpiry] = await Promise.all([
            SecureStore.getItemAsync(AUTH_TOKEN_KEY),
            SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
            SecureStore.getItemAsync(TOKEN_EXPIRY_KEY)
        ]);

        if (!latestAccessToken || !latestRefreshToken || !latestTokenExpiry) {
            logInfo("AuthContext: Missing token data for validation", {
                hasAccessToken: !!latestAccessToken,
                hasRefreshToken: !!latestRefreshToken,
                hasTokenExpiry: !!latestTokenExpiry,
            });
            return null;
        }

        const expiryTimestamp = parseInt(latestTokenExpiry, 10);

        // Check if token expires within 5 minutes
        const timeUntilExpiry = expiryTimestamp - Date.now();
        const needsRefresh = timeUntilExpiry < 5 * 60 * 1000;

        if (needsRefresh) {
            // If a refresh is already in progress, wait for it
            if (isRefreshingToken && refreshPromise) {
                logInfo("AuthContext: Token refresh already in progress, waiting...");
                return await refreshPromise;
            }

            const isAlreadyExpired = timeUntilExpiry < 0;
            logInfo(
                isAlreadyExpired
                    ? "AuthContext: Token already expired, refreshing..."
                    : "AuthContext: Token expires soon, refreshing...",
                { timeUntilExpiry }
            );

            // Create refresh promise and set lock
            const currentRefreshPromise = (async (): Promise<string | null> => {
                try {
                    setIsRefreshingToken(true);

                    // Import refreshAccessToken directly to avoid circular dependency
                    const { refreshAccessToken } = await import(
                        "../utils/spotifyApi"
                    );
                    const refreshed = await refreshAccessToken(
                        latestRefreshToken,
                        handleTokenUpdate,
                        async () => {
                            // Use logoutFromSpotify directly to avoid circular dependency
                            await logoutFromSpotify(clearState);
                        }
                    );
                    if (refreshed) {
                        // Get the updated token from secure storage after refresh
                        const updatedToken = await SecureStore.getItemAsync(
                            AUTH_TOKEN_KEY
                        );
                        logInfo("AuthContext: Token refresh successful", {
                            hasUpdatedToken: !!updatedToken,
                        });
                        return updatedToken || latestAccessToken;
                    } else {
                        // If refresh failed but we still have a token, try to use it
                        // This prevents immediate logout on temporary network issues
                        logWarn(
                            "AuthContext: Token refresh failed, but will try to use current token"
                        );
                        return latestAccessToken;
                    }
                } catch (error) {
                    logError("AuthContext: Token refresh failed:", error);
                    // Return current token instead of null to avoid immediate logout
                    // The actual API call will handle the 401 and trigger logout if needed
                    return latestAccessToken;
                } finally {
                    setIsRefreshingToken(false);
                    setRefreshPromise(null);
                }
            })();

            setRefreshPromise(currentRefreshPromise);
            return await currentRefreshPromise;
        }

        return latestAccessToken;
    }, [handleTokenUpdate, clearState, isRefreshingToken, refreshPromise]);

    // Initial data fetch callback
    const fetchInitialData = useCallback(
        async (token: string) => {
            // Prevent multiple simultaneous initial data fetches
            if (isFetchingInitialData) {
                logInfo(
                    "AuthContext: Initial data fetch already in progress, skipping..."
                );
                return;
            }

            setIsFetchingInitialData(true);
            logInfo("AuthContext: Starting initial data fetch...");

            try {
                await fetchInitialDataInParallel(
                    token,
                    (playlists, nextUrl) => {
                        setPlaylists(playlists);
                        setPlaylistsNextUrl(nextUrl);
                    },
                    (albums, nextUrl) => {
                        setAlbums(albums);
                        setAlbumsNextUrl(nextUrl);
                    },
                    (podcastsData, nextUrl) => {
                        setPodcasts(podcastsData);
                        setPodcastsNextUrl(nextUrl);
                    },
                    (artists, nextUrl) => {
                        setArtists(artists);
                        setArtistsNextUrl(nextUrl);
                    },
                    (tracks, nextUrl) => {
                        setSavedTracks(tracks);
                        setSavedTracksNextUrl(nextUrl);
                    },
                    saveCachedData,
                    makeApiRequestWithContext
                );
                logInfo(
                    "AuthContext: Initial data fetch completed successfully"
                );
            } catch (error) {
                logError(
                    "AuthContext: Error during initial data fetch:",
                    error
                );
            } finally {
                setIsLoading(false);
                setIsFetchingInitialData(false);
            }
        },
        [
            isFetchingInitialData,
            ensureValidToken,
            accessToken,
            refreshToken,
            tokenExpiry,
            makeApiRequestWithContext,
        ]
    );

    // Authentication methods
    const login = useCallback(async () => {
        if (isAuthenticating) {
            logInfo("AuthContext: Authentication already in progress");
            return;
        }

        setIsAuthenticating(true);
        setIsLoading(true);

        try {
            await loginWithSpotify(
                handleTokenUpdate,
                handleUserUpdate,
                fetchInitialData
            );
        } catch (error) {
            logError("AuthContext: Error during authentication:", error);
            setIsLoading(false);
        } finally {
            setIsAuthenticating(false);
        }
    }, [
        isAuthenticating,
        handleTokenUpdate,
        handleUserUpdate,
        fetchInitialData,
    ]);

    const logout = useCallback(async () => {
        if (isAuthenticating) {
            logWarn("AuthContext: Logout blocked - authentication in progress");
            return;
        }

        logInfo("AuthContext: Logout initiated");
        await logoutFromSpotify(clearState);
        logInfo("AuthContext: Logout completed");
    }, [isAuthenticating, clearState]);

    // Data fetching methods
    const fetchPlaylists = useCallback(async () => {
        if (!accessToken) return;
        setIsRefreshingPlaylists(true);

        const result = await fetchPlaylistsService(
            accessToken,
            makeApiRequestWithContext,
            saveCachedData
        );

        setPlaylists(result.playlists || []);
        setPlaylistsNextUrl(result.nextUrl);
        setIsRefreshingPlaylists(false);
    }, [accessToken, makeApiRequestWithContext]);

    const fetchMorePlaylists = useCallback(async () => {
        setIsLoadingMorePlaylists(true);

        const result = await fetchMorePlaylistsService(
            playlistsNextUrl,
            isLoadingMorePlaylists,
            accessToken,
            makeApiRequestWithContext
        );

        if (result.playlists) {
            setPlaylists((prev) => [...(prev || []), ...result.playlists!]);
            setPlaylistsNextUrl(result.nextUrl);
        }
        setIsLoadingMorePlaylists(false);
    }, [
        playlistsNextUrl,
        isLoadingMorePlaylists,
        accessToken,
        makeApiRequestWithContext,
    ]);

    const fetchAlbums = useCallback(async () => {
        if (!accessToken) return;
        setIsRefreshingAlbums(true);

        const result = await fetchAlbumsService(
            accessToken,
            makeApiRequestWithContext,
            saveCachedData
        );

        setAlbums(result.albums || []);
        setAlbumsNextUrl(result.nextUrl);
        setIsRefreshingAlbums(false);
    }, [accessToken, makeApiRequestWithContext]);

    const fetchPodcasts = useCallback(async () => {
        if (!accessToken) return;
        setIsRefreshingPodcasts(true);

        const result = await fetchPodcastsService(
            accessToken,
            makeApiRequestWithContext,
            saveCachedData
        );

        setPodcasts(result.podcasts || []);
        setPodcastsNextUrl(result.nextUrl);
        setIsRefreshingPodcasts(false);
    }, [accessToken, makeApiRequestWithContext]);

    const fetchMoreAlbums = useCallback(async () => {
        setIsLoadingMoreAlbums(true);

        const result = await fetchMoreAlbumsService(
            albumsNextUrl,
            isLoadingMoreAlbums,
            accessToken,
            makeApiRequestWithContext
        );

        if (result.albums) {
            setAlbums((prev) => [...(prev || []), ...result.albums!]);
            setAlbumsNextUrl(result.nextUrl);
        }
        setIsLoadingMoreAlbums(false);
    }, [
        albumsNextUrl,
        isLoadingMoreAlbums,
        accessToken,
        makeApiRequestWithContext,
    ]);

    const fetchMorePodcasts = useCallback(async () => {
        setIsLoadingMorePodcasts(true);

        const result = await fetchMorePodcastsService(
            podcastsNextUrl,
            isLoadingMorePodcasts,
            accessToken,
            makeApiRequestWithContext
        );

        if (result.podcasts) {
            setPodcasts((prev) => [...(prev || []), ...result.podcasts!]);
            setPodcastsNextUrl(result.nextUrl);
        }
        setIsLoadingMorePodcasts(false);
    }, [
        podcastsNextUrl,
        isLoadingMorePodcasts,
        accessToken,
        makeApiRequestWithContext,
    ]);

    const fetchArtists = useCallback(async () => {
        if (!accessToken) return;
        setIsRefreshingArtists(true);

        const result = await fetchArtistsService(
            accessToken,
            makeApiRequestWithContext,
            saveCachedData
        );

        setArtists(result.artists || []);
        setArtistsNextUrl(result.nextUrl);
        setIsRefreshingArtists(false);
    }, [accessToken, makeApiRequestWithContext]);

    const fetchMoreArtists = useCallback(async () => {
        setIsLoadingMoreArtists(true);

        const result = await fetchMoreArtistsService(
            artistsNextUrl,
            isLoadingMoreArtists,
            accessToken,
            makeApiRequestWithContext
        );

        if (result.artists) {
            setArtists((prev) => [...(prev || []), ...result.artists!]);
            setArtistsNextUrl(result.nextUrl);
        }
        setIsLoadingMoreArtists(false);
    }, [
        artistsNextUrl,
        isLoadingMoreArtists,
        accessToken,
        makeApiRequestWithContext,
    ]);

    const fetchSavedTracks = useCallback(async () => {
        if (!accessToken) return;
        setIsRefreshingSavedTracks(true);

        const result = await fetchSavedTracksService(
            accessToken,
            makeApiRequestWithContext,
            saveCachedData
        );

        setSavedTracks(result.savedTracks || []);
        setSavedTracksNextUrl(result.nextUrl);
        setIsRefreshingSavedTracks(false);
    }, [accessToken, makeApiRequestWithContext]);

    const fetchMoreSavedTracks = useCallback(async () => {
        setIsLoadingMoreSavedTracks(true);

        const result = await fetchMoreSavedTracksService(
            savedTracksNextUrl,
            isLoadingMoreSavedTracks,
            accessToken,
            makeApiRequestWithContext
        );

        if (result.savedTracks) {
            setSavedTracks((prev) => [...(prev || []), ...result.savedTracks!]);
            setSavedTracksNextUrl(result.nextUrl);
        }
        setIsLoadingMoreSavedTracks(false);
    }, [
        savedTracksNextUrl,
        isLoadingMoreSavedTracks,
        accessToken,
        makeApiRequestWithContext,
    ]);

    // Album management methods
    const saveAlbum = useCallback(
        async (albumId: string): Promise<boolean> => {
            const result = await saveAlbumService(
                albumId,
                accessToken,
                ensureValidToken
            );
            if (result) {
                // Refresh albums from cache to update UI
                const cachedAlbums = await refreshSavedAlbumsFromCache();
                if (cachedAlbums) setAlbums(cachedAlbums);
            }
            return result;
        },
        [accessToken, ensureValidToken]
    );

    const removeAlbum = useCallback(
        async (albumId: string): Promise<boolean> => {
            const result = await removeAlbumService(
                albumId,
                accessToken,
                ensureValidToken
            );
            if (result) {
                // Refresh albums from cache to update UI
                const cachedAlbums = await refreshSavedAlbumsFromCache();
                if (cachedAlbums) setAlbums(cachedAlbums);
            }
            return result;
        },
        [accessToken, ensureValidToken]
    );

    const checkIfAlbumIsSaved = useCallback(
        (albumId: string) =>
            checkIfAlbumIsSavedService(albumId, accessToken, ensureValidToken),
        [accessToken, ensureValidToken]
    );

    const followPodcast = useCallback(
        async (showId: string): Promise<boolean> => {
            const result = await followPodcastService(
                showId,
                accessToken,
                ensureValidToken
            );
            if (result) {
                const cachedShows = await refreshFollowedPodcastsFromCache();
                if (cachedShows) setPodcasts(cachedShows);
            }
            return result;
        },
        [accessToken, ensureValidToken]
    );

    const unfollowPodcast = useCallback(
        async (showId: string): Promise<boolean> => {
            const result = await unfollowPodcastService(
                showId,
                accessToken,
                ensureValidToken
            );
            if (result) {
                const cachedShows = await refreshFollowedPodcastsFromCache();
                if (cachedShows) setPodcasts(cachedShows);
            }
            return result;
        },
        [accessToken, ensureValidToken]
    );

    const checkIfFollowingPodcast = useCallback(
        (showId: string) =>
            checkIfFollowingPodcastService(showId, accessToken, ensureValidToken),
        [accessToken, ensureValidToken]
    );

    // Artist management methods
    const followArtist = useCallback(
        async (artistId: string): Promise<boolean> => {
            const result = await followArtistService(
                artistId,
                accessToken,
                ensureValidToken
            );
            if (result) {
                const cachedArtists = await refreshFollowedArtistsFromCache();
                if (cachedArtists) setArtists(cachedArtists);
            }
            return result;
        },
        [accessToken, ensureValidToken]
    );

    const unfollowArtist = useCallback(
        async (artistId: string): Promise<boolean> => {
            const result = await unfollowArtistService(
                artistId,
                accessToken,
                ensureValidToken
            );
            if (result) {
                const cachedArtists = await refreshFollowedArtistsFromCache();
                if (cachedArtists) setArtists(cachedArtists);
            }
            return result;
        },
        [accessToken, ensureValidToken]
    );

    const checkIfFollowingArtist = useCallback(
        (artistId: string) =>
            checkIfFollowingArtistService(artistId, accessToken, ensureValidToken),
        [accessToken, ensureValidToken]
    );

    const fetchArtistTopTracks = useCallback(
        (artistId: string) =>
            fetchArtistTopTracksService(artistId, accessToken, ensureValidToken),
        [accessToken, ensureValidToken]
    );

    const fetchArtistAlbums = useCallback(
        (artistId: string) =>
            fetchArtistAlbumsService(artistId, accessToken, ensureValidToken),
        [accessToken, ensureValidToken]
    );

    const fetchMoreArtistAlbums = useCallback(
        (nextUrl: string | null, isLoadingMore: boolean) =>
            fetchMoreArtistAlbumsService(nextUrl, isLoadingMore, accessToken, makeApiRequestWithContext),
        [accessToken, makeApiRequest]
    );

    // Cache refresh methods
    const refreshSavedAlbumsFromCacheMethod = useCallback(async () => {
        const cachedAlbums = await refreshSavedAlbumsFromCache();
        if (cachedAlbums) setAlbums(cachedAlbums);
    }, []);

    const refreshFollowedPodcastsFromCacheMethod = useCallback(async () => {
        const cachedPodcasts = await refreshFollowedPodcastsFromCache();
        if (cachedPodcasts) setPodcasts(cachedPodcasts);
    }, []);

    const refreshFollowedArtistsFromCacheMethod = useCallback(async () => {
        const cachedArtists = await refreshFollowedArtistsFromCache();
        if (cachedArtists) setArtists(cachedArtists);
    }, []);



    // Playback methods
    const playTracksWithWebApi = useCallback(
        async (uris: string[]) => {
            return playTracksWithWebApiService(uris, accessToken, ensureValidToken);
        },
        [accessToken, ensureValidToken]
    );

    const playTrackWithContext = useCallback(
        async (
            trackUri: string,
            sourceContext?: {
                type: "album" | "playlist" | "liked" | "artist" | "podcast";
                uri?: string;
                tracks?: any[];
                currentIndex?: number;
            }
        ) => {
            // Ensure we have a valid token before playback and wait for any state updates
            const validToken = await ensureValidToken();

            // Additional wait to ensure context state is updated after token refresh
            await new Promise(resolve => setTimeout(resolve, 100));

            return playTrackWithContextService(
                trackUri,
                validToken,
                sourceContext,
                ensureValidToken
            );
        },
        [ensureValidToken]
    );

    const skipToIndex = useCallback(
        async (
            sourceContext: {
                type: "album" | "playlist" | "liked" | "artist" | "podcast";
                uri?: string;
                tracks?: any[];
                currentIndex?: number;
            }
        ) => {
            return skipToIndexService(
                sourceContext,
            );
        },
        []
    );

    const getPlaybackState = useCallback((): Promise<SpotifyCurrentlyPlaying | null> => getPlaybackStateService(), []);

    const getCurrentTrack = useCallback(() => getCurrentTrackService(), []);

    const getAlbumArt = useCallback(
        (uri?: string, size?: string) => getAlbumArtService(uri, size),
        []
    );

    const startPlayback = useCallback(async () => {
        const result = await startPlaybackService();
        // Check if remote is connected after playback action
        try {
            const connected = await SpotifySdk.isConnected();
            setIsConnectedToAppRemote(connected);
        } catch (error) {
            // Ignore connection check errors
        }
        return result;
    }, []);
    
    const pausePlayback = useCallback(async () => {
        const result = await pausePlaybackService();
        // Check if remote is connected after playback action
        try {
            const connected = await SpotifySdk.isConnected();
            setIsConnectedToAppRemote(connected);
        } catch (error) {
            // Ignore connection check errors
        }
        return result;
    }, []);
    
    const skipToNext = useCallback(async () => {
        const result = await skipToNextService();
        // Check if remote is connected after playback action
        try {
            const connected = await SpotifySdk.isConnected();
            setIsConnectedToAppRemote(connected);
        } catch (error) {
            // Ignore connection check errors
        }
        return result;
    }, []);
    
    const skipToPrevious = useCallback(async () => {
        const result = await skipToPreviousService();
        // Check if remote is connected after playback action
        try {
            const connected = await SpotifySdk.isConnected();
            setIsConnectedToAppRemote(connected);
        } catch (error) {
            // Ignore connection check errors
        }
        return result;
    }, []);
    const toggleShuffle = useCallback(
        (state: boolean) => toggleShuffleService(state),
        []
    );
    const toggleRepeat = useCallback(
        (state: "off" | "context" | "track") => toggleRepeatService(state),
        []
    );
    const seekToPosition = useCallback(
        (positionMs: number) => seekToPositionService(positionMs),
        []
    );

    const searchItems = useCallback(
        (query: string, types: string[]) =>
            searchItemsService(query, types, accessToken, ensureValidToken),
        [accessToken, ensureValidToken]
    );

    const addTrackToPlaylist = useCallback(
        (playlistId: string, trackUri: string) =>
            addTrackToPlaylistService(
                playlistId,
                trackUri,
                accessToken,
                ensureValidToken
            ),
        [accessToken, ensureValidToken]
    );

    const addToLibrary = useCallback(
        (uri: string) => addToLibraryService(uri, accessToken),
        [accessToken]
    );

    const removeFromLibrary = useCallback(
        (uri: string) => removeFromLibraryService(uri, accessToken),
        [accessToken]
    );

    const getLibraryState = useCallback(
        (uri: string) => getLibraryStateService(uri),
        []
    );

    const forceAppRemoteConnectionMethod =
        useCallback(async (): Promise<boolean> => {
            const result = await forceAppRemoteConnection();
            setIsConnectedToAppRemote(result);
            return result;
        }, []);

    // Development/testing method to force token expiry
    const forceTokenExpiryMethod = useCallback(async (): Promise<void> => {
        if (!__DEV__) {
            logWarn("forceTokenExpiry is only available in development mode");
            return;
        }

        logInfo("Forcing token expiry for testing...");

        // Set token expiry to 1 minute ago to force refresh on next API call
        const expiredTime = Date.now() - 60 * 1000;
        setTokenExpiry(expiredTime);

        // Also update it in secure storage
        await SecureStore.setItemAsync(
            TOKEN_EXPIRY_KEY,
            expiredTime.toString()
        );

        logInfo(
            "Token expiry set to past time. Next API call should trigger refresh."
        );
    }, []);

    // App state and connection management effects
    useEffect(() => {
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (
                appState.match(/inactive|background/) &&
                nextAppState === "active"
            ) {
                logInfo("AuthContext: App resumed");
                // Clear any pending disconnect timeout
                if (disconnectTimeoutRef.current) {
                    clearTimeout(disconnectTimeoutRef.current);
                    disconnectTimeoutRef.current = null;
                    logInfo("AuthContext: Cancelled pending disconnect timeout");
                }
                if (accessToken) {
                }
            } else if (
                appState === "active" &&
                nextAppState.match(/inactive|background/)
            ) {
                // Only disconnect if device is online to avoid losing connection during offline periods
                if (isOnline) {
                    logInfo("AuthContext: App suspended (online) - scheduling disconnect in 5 minutes");
                    // Set a 5-minute timeout before disconnecting
                    disconnectTimeoutRef.current = setTimeout(() => {
                        try {
                            SpotifySdk.disconnect();
                            logInfo("AuthContext: Remote disconnected after 5 minute delay");
                        } catch (e) { }
                        setIsConnectedToAppRemote(false);
                        disconnectTimeoutRef.current = null;
                    }, 5 * 60 * 1000); // 5 minutes
                } else {
                    logInfo("AuthContext: App suspended (offline) - keeping remote connection");
                }
            }
            setAppState(nextAppState);
        };

        const appStateSubscription = AppState.addEventListener(
            "change",
            handleAppStateChange
        );

        return () => {
            appStateSubscription?.remove();
        };
    }, [appState, accessToken, isOnline]);

    // Periodic remote connection check
    useEffect(() => {
        if (!accessToken || !user) return;

        const checkRemoteConnection = async () => {
            try {
                const connected = await SpotifySdk.isConnected();
                setIsConnectedToAppRemote(connected);
            } catch (error) {
                setIsConnectedToAppRemote(false);
            }
        };

        // Check immediately
        checkRemoteConnection();

        // Check every 5 seconds
        const interval = setInterval(checkRemoteConnection, 5000);

        return () => clearInterval(interval);
    }, [accessToken, user]);

    // Initial load effect
    useEffect(() => {
        if (initialAuthProcessed || isAuthenticating) {
            return;
        }

        logInfo("AuthContext: Starting initial auth load...");

        const loadInitialAuth = async () => {
            try {
                const authData = await loadStoredAuth();

                // Load cached data first for a responsive UI
                const cachedData = await loadCachedData();
                setPlaylists(cachedData.playlists);
                setAlbums(cachedData.albums);
                setPodcasts(cachedData.podcasts);
                setArtists(cachedData.artists);
                setSavedTracks(cachedData.savedTracks);
                if (authData.accessToken) {
                    // Set auth state from stored data
                    setAccessToken(authData.accessToken);
                    setRefreshToken(authData.refreshToken);
                    setUser(authData.user);
                    setTokenExpiry(authData.tokenExpiry);
                }
            } catch (error) {
                logError("AuthContext: Failed to load auth state:", error);
            } finally {
                setIsLoading(false);
                setInitialAuthProcessed(true);
                logInfo("AuthContext: Initial auth load completed");
            }
        };

        loadInitialAuth();
    }, [isAuthenticating, initialAuthProcessed]);

    // Effect to fetch initial data once tokens are loaded
    useEffect(() => {
        const triggerInitialDataFetch = async () => {
            if (
                accessToken &&
                !initialDataFetchTriggered &&
                initialAuthProcessed
            ) {
                // Mark as triggered immediately to prevent re-fetching
                setInitialDataFetchTriggered(true);

                logInfo(
                    "AuthContext: Auth state loaded, proceeding with data fetch..."
                );

                const validToken = await ensureValidToken();

                if (validToken) {
                    await fetchInitialData(validToken);
                } else {
                    logWarn(
                        "AuthContext: Token validation failed, skipping initial data fetch."
                    );
                }
            }
        };

        triggerInitialDataFetch();
    }, [
        accessToken,
        initialDataFetchTriggered,
        initialAuthProcessed,
        ensureValidToken,
        fetchInitialData,
    ]);

    // Provide context value
    const value: AuthContextType = {
        accessToken,
        refreshToken,
        user,
        playlists,
        playlistsNextUrl,
        isLoadingMorePlaylists,
        fetchMorePlaylists,
        albums,
        albumsNextUrl,
        isLoadingMoreAlbums,
        fetchMoreAlbums,
        podcasts,
        podcastsNextUrl,
        isLoadingMorePodcasts,
        fetchMorePodcasts,
        artists,
        isLoadingMoreArtists,
        fetchMoreArtists,
        artistsNextUrl,
        savedTracks,
        savedTracksNextUrl,
        isLoadingMoreSavedTracks,
        fetchMoreSavedTracks,
        isLoading,
        isRefreshingPlaylists,
        isRefreshingAlbums,
        isRefreshingPodcasts,
        isRefreshingArtists,
        isRefreshingSavedTracks,
        isConnectedToAppRemote,
        appState,
        login,
        logout,
        fetchPlaylists,
        fetchAlbums,
        fetchPodcasts,
        fetchArtists,
        fetchSavedTracks,
        saveAlbum,
        removeAlbum,
        checkIfAlbumIsSaved,
        followPodcast,
        unfollowPodcast,
        checkIfFollowingPodcast,
        refreshSavedAlbumsFromCache: refreshSavedAlbumsFromCacheMethod,
        refreshFollowedPodcastsFromCache: refreshFollowedPodcastsFromCacheMethod,
        followArtist,
        unfollowArtist,
        checkIfFollowingArtist,
        fetchArtistTopTracks,
        fetchArtistAlbums,
        fetchMoreArtistAlbums,
        refreshFollowedArtistsFromCache: refreshFollowedArtistsFromCacheMethod,
        playTracksWithWebApi,
        playTrackWithContext,
        skipToIndex,
        getPlaybackState,
        getCurrentTrack,
        getAlbumArt,
        startPlayback,
        pausePlayback,
        skipToNext,
        skipToPrevious,
        toggleShuffle,
        toggleRepeat,
        addTrackToPlaylist,
        seekToPosition,
        searchItems,
        clearCachedData,
        forceAppRemoteConnection: forceAppRemoteConnectionMethod,
        makeApiRequest: makeApiRequestWithContext,
        ensureValidToken,
        addToLibrary,
        removeFromLibrary,
        getLibraryState,
        // Development/testing methods
        ...(__DEV__ && { forceTokenExpiry: forceTokenExpiryMethod }),
    };

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};

// Re-export types for backwards compatibility
export type {
    SpotifyImage,
    SpotifyPlaylist,
    SpotifyPlaylistOwner,
    SpotifyPlaylistsResponse,
    SpotifyArtistSimple,
    SpotifyAlbum,
    SpotifyAlbumTracks,
    SpotifyTrackSimple,
    SpotifySavedAlbum,
    SpotifySavedAlbumsResponse,
    SpotifyArtist,
    SpotifyFollowedArtistsResponse,
    SavedTrackObject,
    SavedTracksResponse,
    SpotifyDevice,
    SpotifyDevicesResponse,
    SpotifyRepeatState,
    SpotifyCurrentlyPlaying,
    SpotifyPlaybackContext,
    SpotifyAlbumSimple,
    SpotifyTrack,
    SpotifyPlaylistSimple,
    SpotifySearchResults,
    SpotifyShow,
    SpotifyEpisode,
    SpotifySavedShow,
    SpotifySavedShowsResponse,
} from "../types/spotify";
