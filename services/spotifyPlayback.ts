import SpotifySdk from "../modules/spotify-sdk";
import { SPOTIFY_CLIENT_ID, REDIRECT_URI } from "../constants/spotify";
import type {
    SpotifyCurrentlyPlaying,
    SpotifySearchResults,
    SpotifyImage,
    SpotifyEpisode,
    SpotifyShow,
    SpotifyTrackSimple,
} from "../types/spotify";
import { log, logError } from "../utils/logger";
import {
    isTrackInSavedCache,
    addTrackToSavedCache,
    removeTrackFromSavedCache,
} from "../utils/cache";

const inFlightLibraryChecks = new Map<string, Promise<{ isAdded: boolean; canAdd: boolean } | null>>();

export const ensureAppRemoteConnection = async (): Promise<boolean> => {
    try {
        const connected = await SpotifySdk.isConnected();
        if (connected) {
            return true;
        }

        const connectionResult = await SpotifySdk.connect(
            SPOTIFY_CLIENT_ID,
            REDIRECT_URI
        );

        if (connectionResult.connected) {
            log("Playback: Connected to App Remote");
            return true;
        } else {
            log("Playback: Failed to connect to App Remote");
            return false;
        }
    } catch (error) {
        log("Playback: Error connecting to App Remote:", error);
        return false;
    }
};

export const forceAppRemoteConnection = async (): Promise<boolean> => {
    log("Playback: Attempting force connection...");

    try {
        await SpotifySdk.disconnect();
    } catch (error) {
        // Ignore disconnect errors
    }

    for (let i = 0; i < 3; i++) {
        try {
            const connectionResult = await SpotifySdk.connect(
                SPOTIFY_CLIENT_ID,
                REDIRECT_URI
            );

            if (connectionResult.connected) {
                return true;
            }
        } catch (error) {
            log(`Playback: Connection attempt ${i + 1} failed`);
        }

        if (i < 2) {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }

    log("Playback: Force connection failed");
    return false;
};

export const playTracksWithWebApi = async (
    uris: string[],
    accessToken: string | null,
    ensureValidToken?: () => Promise<string | null>
): Promise<void> => {
    let validToken = accessToken;
    if (ensureValidToken) {
        const refreshedToken = await ensureValidToken();
        if (refreshedToken) {
            validToken = refreshedToken;
        } else {
            log("Playback: Token validation failed, cannot play with Web API");
            throw new Error("Token validation failed");
        }
    }

    if (!validToken) {
        log("Playback: No valid token available for Web API playback");
        throw new Error("No valid token");
    }

    // Try to get available devices to target the call properly
    let deviceId: string | undefined;
    try {
        const devicesResponse = await fetch(
            "https://api.spotify.com/v1/me/player/devices",
            {
                headers: {
                    Authorization: `Bearer ${validToken}`,
                },
            }
        );

        if (devicesResponse.ok) {
            const devicesData = await devicesResponse.json();
            const activeDevice = devicesData.devices?.find((d: any) => d.is_active);
            const availableDevice = devicesData.devices?.[0];
            deviceId = activeDevice?.id || availableDevice?.id;
        }
    } catch (deviceError) {
        log("Playback: Device detection failed, proceeding without device_id:", deviceError);
    }

    const playUrl = deviceId
        ? `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`
        : "https://api.spotify.com/v1/me/player/play";

    const response = await fetch(
        playUrl,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${validToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                uris: uris,
            }),
        }
    );

    if (response.ok) {
        log(
            "Playback: Web API successfully set context and initiated playback."
        );
        return;
    } else if (response.status === 401) {
        log(
            "Playback: Token expired, falling back to direct play"
        );
        throw new Error("Token expired - using fallback");
    } else {
        const errorText = await response.text();
        log("Playback: Web API context failed:", {
            status: response.status,
            statusText: response.statusText,
            error: errorText
        });
        throw new Error(`Web API context failed: ${errorText}`);
    }
};

export const getPlaybackState = async (): Promise<SpotifyCurrentlyPlaying | null> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) {
            log("Playback: Cannot get playback state - App Remote not connected");
            return null;
        }

        const playerState = await SpotifySdk.getPlayerState();
        if (!playerState || !playerState.track) {
            log("Playback: No player state or track available");
            return null;
        }

        let albumImages: SpotifyImage[] = [];
        const albumUri = playerState.track.album?.uri ?? "";
        const albumId = albumUri.split(":").pop() || "";
        const trackUri = playerState.track.uri;
        const trackId = trackUri.split(":").pop() || "";
        const isEpisode = playerState.track.isEpisode;

        if (albumUri) {
            const nativeImageUrl = await SpotifySdk.getCurrentTrackImage("LARGE");
            if (nativeImageUrl && nativeImageUrl.startsWith("data:image/")) {
                albumImages = [
                    {
                        url: nativeImageUrl,
                        height: 640,
                        width: 640,
                    },
                ];
            } else {
                throw new Error(
                    "Native SDK getCurrentTrackImage did not return valid image data"
                );
            }
        }

        const baseResponse: SpotifyCurrentlyPlaying = {
            timestamp: Date.now(),
            context: null,
            progress_ms: playerState.playbackPosition,
            is_playing: !playerState.isPaused,
            item: null,
            currently_playing_type: isEpisode ? "episode" : "track",
            actions: { disallows: {} },
            device: {
                id: "spotify_app_remote",
                is_active: true,
                is_private_session: false,
                is_restricted: false,
                name: "Spotify App Remote",
                type: "smartphone",
                volume_percent: 100,
                supports_volume: false,
                uri: "spotify:device:app_remote",
            },
            shuffle_state: playerState.playbackOptions.isShuffling,
            repeat_state:
                playerState.playbackOptions.repeatMode === 0
                    ? "off"
                    : playerState.playbackOptions.repeatMode === 1
                        ? "track"
                        : "context",
        };

        if (isEpisode) {
            const showData: SpotifyShow = {
                id: albumId,
                name: playerState.track.album?.name || playerState.track.name,
                description: "",
                publisher: playerState.track.artist.name,
                images: albumImages,
                total_episodes: 0,
                uri: albumUri,
                href: "",
                media_type: "audio",
                explicit: false,
                type: "show",
                languages: [],
            };

            const episodeItem: SpotifyEpisode = {
                id: trackId,
                name: playerState.track.name,
                description: "",
                duration_ms: playerState.track.duration,
                release_date: "",
                release_date_precision: "day",
                uri: trackUri,
                href: "",
                type: "episode",
                images: albumImages,
                explicit: false,
                is_externally_hosted: false,
                is_playable: true,
                languages: [],
                show: showData,
                isEpisode: true,
            };

            return {
                ...baseResponse,
                item: episodeItem,
            };
        }

        const trackItem: SpotifyTrackSimple = {
            artists: [
                {
                    external_urls: { spotify: "" },
                    href: "",
                    id: playerState.track.artist.uri.split(":").pop() || "",
                    name: playerState.track.artist.name,
                    type: "artist",
                    uri: playerState.track.artist.uri,
                },
            ],
            available_markets: [],
            disc_number: 1,
            duration_ms: playerState.track.duration,
            explicit: false,
            external_urls: { spotify: "" },
            href: "",
            id: trackId,
            is_local: false,
            name: playerState.track.name,
            preview_url: null,
            track_number: 1,
            type: "track",
            uri: trackUri,
            album: {
                album_type: "album",
                total_tracks: 1,
                available_markets: [],
                external_urls: { spotify: "" },
                href: "",
                id: albumId,
                images: albumImages,
                name: playerState.track.album.name,
                release_date: "",
                release_date_precision: "day",
                type: "album",
                uri: albumUri,
                artists: [
                    {
                        external_urls: { spotify: "" },
                        href: "",
                        id: playerState.track.artist.uri.split(":").pop() || "",
                        name: playerState.track.artist.name,
                        type: "artist",
                        uri: playerState.track.artist.uri,
                    },
                ],
            },
            isEpisode: false,
        };

        return {
            ...baseResponse,
            item: trackItem,
        };
    } catch (error) {
        log("Playback: Error getting playback state:", error);
        return null;
    }
};

export const startPlayback = async (): Promise<void> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) return;
        const result = await SpotifySdk.resume();
        if (result.resumed) log("Playback: Playback resumed");
    } catch (error) {
        logError("Playback: Error starting playback:", error);
    }
};

export const pausePlayback = async (): Promise<void> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) return;
        const result = await SpotifySdk.pause();
        if (result.paused) log("Playback: Playback paused");
    } catch (error) {
        logError("Playback: Error pausing playback:", error);
    }
};

export const skipToNext = async (): Promise<void> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) return;
        const result = await SpotifySdk.skipNext();
        if (result.skipped) log("Playback: Skipped to next track");
    } catch (error) {
        logError("Playback: Error skipping to next track:", error);
    }
};

export const skipToPrevious = async (): Promise<void> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) return;
        const result = await SpotifySdk.skipPrevious();
        if (result.skipped) log("Playback: Skipped to previous track");
    } catch (error) {
        logError("Playback: Error skipping to previous track:", error);
    }
};

export const toggleShuffle = async (state: boolean): Promise<void> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) return;
        const result = await SpotifySdk.setShuffle(state);
        if (result.shuffleSet) log(`Playback: Shuffle set to ${state}`);
    } catch (error) {
        logError("Playback: Error toggling shuffle:", error);
    }
};

export const toggleRepeat = async (
    state: "off" | "context" | "track"
): Promise<void> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) return;

        const repeatMode = state === "off" ? 0 : state === "track" ? 1 : 2;
        const result = await SpotifySdk.setRepeat(repeatMode);
        if (result.repeatSet) log(`Playback: Repeat set to ${state}`);
    } catch (error) {
        logError("Playback: Error toggling repeat:", error);
    }
};

export const seekToPosition = async (positionMs: number): Promise<void> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) return;
        const result = await SpotifySdk.seekTo(positionMs);
        if (result.seeked) log("Playback: Seek completed");
    } catch (error) {
        logError("Playback: Error seeking:", error);
    }
};

export const getCurrentTrack = async (): Promise<any | null> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) return null;
        const playerState = await SpotifySdk.getPlayerState();
        if (!playerState || !playerState.track) return null;
        return {
            ...playerState.track,
            albumArt: playerState.track.imageUri,
            position: playerState.playbackPosition,
            isPaused: playerState.isPaused,
            isShuffling: playerState.playbackOptions.isShuffling,
            repeatMode: playerState.playbackOptions.repeatMode,
        };
    } catch (error) {
        log("Playback: Error getting current track:", error);
        return null;
    }
};

export const getAlbumArt = async (
    uri?: string,
    size: string = "LARGE"
): Promise<string | null> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) return null;

        // If no URI provided, get current track image directly
        if (!uri) {
            try {
                log(
                    "Playback: Getting current track image from Native SDK"
                );
                const imageUrl = await SpotifySdk.getCurrentTrackImage(size);
                if (imageUrl && imageUrl.startsWith("data:image/")) {
                    log(
                        "Playback: Successfully got current track image from Native SDK"
                    );
                    return imageUrl;
                }
            } catch (error) {
                log(
                    "Playback: getCurrentTrackImage failed, trying player state approach:",
                    error
                );
            }

            // Fallback: get player state and use album URI
            try {
                const playerState = await SpotifySdk.getPlayerState();
                if (!playerState || !playerState.track) return null;
                uri = playerState.track.album.uri;
            } catch (error) {
                log(
                    "Playback: Failed to get player state for album art:",
                    error
                );
                return null;
            }
        }

        // Try to get image with provided or derived URI
        if (uri) {
            log("Playback: Getting image for URI:", uri);
            const imageUrl = await SpotifySdk.getImage(uri, size);
            if (imageUrl && imageUrl.startsWith("data:image/")) {
                log("Playback: Successfully got image from Native SDK");
                return imageUrl;
            }
        }

        return null;
    } catch (error) {
        log("Playback: Error getting album art:", error);
        return null;
    }
};

export const searchItems = async (
    query: string,
    types: string[],
    accessToken: string | null,
    ensureValidToken?: () => Promise<string | null>
): Promise<SpotifySearchResults | null> => {
    if (!query.trim()) return null;

    // Use token validation if available, otherwise use the provided token
    let validToken = accessToken;
    if (ensureValidToken) {
        const refreshedToken = await ensureValidToken();
        if (refreshedToken) {
            validToken = refreshedToken;
        }
    }

    if (!validToken) return null;

    const typeString = types.join(",");
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
        query
    )}&type=${encodeURIComponent(typeString)}&limit=10`;

    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${validToken}` },
        });
        if (!response.ok) {
            if (response.status === 401) {
                log("Search: Token expired");
            }
            return null;
        }
        return await response.json();
    } catch (error) {
        logError("Playback: Search error:", error);
        return null;
    }
};

export const addTrackToPlaylist = async (
    playlistId: string,
    trackUri: string,
    accessToken: string | null,
    ensureValidToken?: () => Promise<string | null>
): Promise<boolean> => {
    if (!playlistId || !trackUri) return false;

    // Use token validation if available, otherwise use the provided token
    let validToken = accessToken;
    if (ensureValidToken) {
        const refreshedToken = await ensureValidToken();
        if (refreshedToken) {
            validToken = refreshedToken;
        }
    }

    if (!validToken) return false;

    try {
        const response = await fetch(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${validToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ uris: [trackUri] }),
            }
        );
        if (!response.ok && response.status === 401) {
            log("AddTrackToPlaylist: Token expired");
        }
        return response.ok;
    } catch (error) {
        logError("Playback: Error adding track to playlist:", error);
        return false;
    }
};

export const playTrackWithContext = async (
    trackUri: string,
    accessToken: string | null,
    sourceContext?: {
        type: "album" | "playlist" | "liked" | "artist" | "podcast";
        uri?: string;
        tracks?: any[];
        currentIndex?: number;
    },
    ensureValidToken?: () => Promise<string | null>
): Promise<void> => {
    log(
        "Playback: Playing track with context:",
        sourceContext?.type || "none"
    );

    try {
        // Ensure we have App Remote connection
        const connected = await ensureAppRemoteConnection();
        if (!connected) {
            log("Playback: Cannot play - App Remote not connected");
            return;
        }

        // UNIFIED HYBRID APPROACH: Web API for context + Native SDK for control
        if (
            sourceContext?.uri &&
            sourceContext.type !== "artist"
        ) {
            try {
                log("Playback: Setting context via Web API");

                // Always validate token before attempting playback to ensure context works
                let validToken = accessToken;
                if (ensureValidToken) {
                    log("Playback: Validating token before context playback...");
                    const refreshedToken = await ensureValidToken();
                    if (refreshedToken) {
                        validToken = refreshedToken;
                        log("Playback: Using validated/refreshed token");
                    } else {
                        log("Playback: Token validation failed, cannot set context");
                        throw new Error("Token validation failed");
                    }
                }

                if (!validToken) {
                    log("Playback: No valid token available, falling back to direct play");
                    throw new Error("No valid token");
                }

                log("Playback: Making Web API call with context:", {
                    contextUri: sourceContext.uri,
                    trackUri: trackUri,
                    tokenLength: validToken.length
                });

                // First, try to get available devices to target the call properly
                let deviceId: string | undefined;
                try {
                    const devicesResponse = await fetch(
                        "https://api.spotify.com/v1/me/player/devices",
                        {
                            headers: {
                                Authorization: `Bearer ${validToken}`,
                            },
                        }
                    );

                    if (devicesResponse.ok) {
                        const devicesData = await devicesResponse.json();
                        log("Playback: Available devices:", devicesData.devices?.length || 0);

                        // Find an active device or use the first available one
                        const activeDevice = devicesData.devices?.find((d: any) => d.is_active);
                        const availableDevice = devicesData.devices?.[0];
                        deviceId = activeDevice?.id || availableDevice?.id;

                        if (deviceId) {
                            log("Playback: Using device:", {
                                id: deviceId,
                                name: activeDevice?.name || availableDevice?.name,
                                isActive: !!activeDevice
                            });
                        } else {
                            log("Playback: No devices found, trying without device_id");
                        }
                    } else {
                        log("Playback: Failed to get devices, proceeding without device_id");
                    }
                } catch (deviceError) {
                    log("Playback: Device detection failed, proceeding without device_id:", deviceError);
                }

                // Prepare the playback request body
                const playbackBody: Record<string, any> = {};

                if (sourceContext.uri) {
                    playbackBody.context_uri = sourceContext.uri;
                }

                const resolveLikedTrackPosition = () => {
                    if (
                        sourceContext?.currentIndex !== undefined &&
                        sourceContext?.currentIndex !== null
                    ) {
                        return sourceContext.currentIndex;
                    }

                    if (!sourceContext?.tracks?.length) {
                        return null;
                    }

                    const foundIndex = sourceContext.tracks.findIndex((track: any) => {
                        if (!track) return false;

                        if (typeof track === "string") {
                            return track === trackUri;
                        }

                        if (track?.uri) {
                            return track.uri === trackUri;
                        }

                        if (track?.track?.uri) {
                            return track.track.uri === trackUri;
                        }

                        return false;
                    });

                    return foundIndex >= 0 ? foundIndex : null;
                };

                if (sourceContext?.type === "liked") {
                    const likedPosition = resolveLikedTrackPosition();

                    if (likedPosition !== null) {
                        playbackBody.offset = { position: likedPosition };
                        log("Playback: Using liked songs position", likedPosition);
                    } else {
                        playbackBody.offset = { uri: trackUri };
                        log(
                            "Playback: Falling back to URI offset for liked songs",
                            trackUri
                        );
                    }
                } else if (trackUri) {
                    playbackBody.offset = { uri: trackUri }; // Start from specific track
                }

                // Web API to set context + track offset
                const playUrl = deviceId
                    ? `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`
                    : "https://api.spotify.com/v1/me/player/play";

                const response = await fetch(playUrl, {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${validToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(playbackBody),
                });

                log("Playback: Web API response status:", response.status);

                if (response.ok) {
                    log("Playback: Context set successfully, starting playback");
                    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for context
                    await SpotifySdk.play(); // Native SDK control
                    log("Playback: Started with context");
                    return;
                } else if (response.status === 401) {
                    const errorText = await response.text();
                    log("Playback: Token expired during context call:", errorText);
                    throw new Error("Token expired - using fallback");
                } else if (response.status === 404) {
                    const errorText = await response.text();
                    log("Playback: Device not found (404):", errorText);
                    throw new Error("Device not found - using fallback");
                } else {
                    const errorText = await response.text();
                    log("Playback: Web API context failed:", {
                        status: response.status,
                        statusText: response.statusText,
                        error: errorText
                    });
                    throw new Error(`HTTP ${response.status} - using fallback`);
                }
            } catch (webApiError: any) {
                log(
                    "Playback: Web API context failed, falling back to direct play:",
                    webApiError.message
                );
            }
        }

        // Fallback: Direct track play (no context)
        log("Playback: Direct track play (no context)");
        await SpotifySdk.play(trackUri);
        log("Playback: Direct playback started");
    } catch (error) {
        logError("Playback: Error in playTrackWithContext:", error);
        throw error;
    }
};

export const skipToIndex = async (
    sourceContext: {
        type: "album" | "playlist" | "liked" | "artist" | "podcast";
        uri?: string;
        tracks?: any[];
        currentIndex?: number;
    }
): Promise<void> => {
    log(
        "Playback: Playing track with context via SkipToIndex:",
        sourceContext?.type || "none"
    );
    {
        const connected = await ensureAppRemoteConnection(); if (!connected) {
            log("Playback: Cannot play - App Remote not connected");
            return;
        }

        if (
            sourceContext?.uri &&
            sourceContext.currentIndex !== undefined &&
            sourceContext.currentIndex !== null
        ) {
            log("Index:", {
                currentIndex: sourceContext.currentIndex,
            });
            log("URI:", {
                uri: sourceContext.uri,
            });
            await SpotifySdk.skipToIndex(sourceContext.uri, sourceContext.currentIndex);
        }
        log("Playback: Skipped to index");
        return;
    }
};

export const addToLibrary = async (uri: string, accessToken?: string | null): Promise<boolean> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) {
            log("Playback: Cannot add to library - App Remote not connected");
            return false;
        }
        const result = await SpotifySdk.addToLibrary(uri);
        log(`Playback: Added to library: ${uri}`, result);

        if (result.added && accessToken) {
            await addTrackToSavedCache(uri, accessToken);
        }

        return result.added;
    } catch (error) {
        logError("Playback: Error adding to library:", error);
        return false;
    }
};

export const removeFromLibrary = async (uri: string, accessToken?: string | null): Promise<boolean> => {
    try {
        const connected = await ensureAppRemoteConnection();
        if (!connected) {
            log("Playback: Cannot remove from library - App Remote not connected");
            return false;
        }
        const result = await SpotifySdk.removeFromLibrary(uri);
        log(`Playback: Removed from library: ${uri}`, result);

        if (result.removed) {
            const trackId = uri.replace("spotify:track:", "");
            await removeTrackFromSavedCache(trackId);
        }

        return result.removed;
    } catch (error) {
        logError("Playback: Error removing from library:", error);
        return false;
    }
};

export const getLibraryState = async (uri: string): Promise<{ isAdded: boolean; canAdd: boolean } | null> => {
    if (inFlightLibraryChecks.has(uri)) {
        log(`Playback: Reusing in-flight library check for ${uri}`);
        return await inFlightLibraryChecks.get(uri)!;
    }

    const requestPromise = (async () => {
        const trackId = uri.replace("spotify:track:", "");

        const isInCache = await isTrackInSavedCache(trackId);
        if (isInCache) {
            log(`Playback: Track ${trackId} found in cache - returning saved state`);
            return { isAdded: true, canAdd: true };
        }

        const connected = await ensureAppRemoteConnection();
        if (!connected) {
            log("Playback: Cannot get library state - App Remote not connected");
            return null;
        }

        const result = await SpotifySdk.getLibraryState(uri);
        inFlightLibraryChecks.delete(uri);
        return result;
    })();

    inFlightLibraryChecks.set(uri, requestPromise);
    return await requestPromise;
};
