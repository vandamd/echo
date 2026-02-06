import {
  addTrackToSavedCache,
  isTrackInSavedCache,
  removeTrackFromSavedCache,
} from "@/features/library/utils/cache";
import { spotify } from "@/modules/spotify-sdk";
import type { SpotifyTrack as NativeSpotifyTrack } from "@/modules/spotify-sdk/src/SpotifySdk.types";
import type {
  SpotifyCurrentlyPlaying,
  SpotifyEpisode,
  SpotifyImage,
  SpotifyShow,
  SpotifyTrackSimple,
} from "@/shared/types/spotify";
import { log, logError } from "@/shared/utils/logger";
import { getValidToken } from "@/shared/utils/token-helper";

export type SpotifyPlayerTrack = NativeSpotifyTrack & {
  albumArt: string;
  position: number;
  isPaused: boolean;
  isShuffling: boolean;
  repeatMode: number;
};

type TrackInput = string | { uri?: string; track?: { uri?: string } };

export interface SourceContext {
  type?: string;
  uri?: string;
  currentIndex?: number | null;
  tracks?: TrackInput[];
}

const inFlightLibraryChecks = new Map<
  string,
  Promise<{ isAdded: boolean; canAdd: boolean } | null>
>();

const _getRepeatStateLabel = (mode: number): "off" | "track" | "context" => {
  if (mode === 0) {
    return "off";
  }
  if (mode === 1) {
    return "track";
  }
  return "context";
};

let cachedDeviceId: string | undefined;
let lastDeviceFetch = 0;
const DEVICE_CACHE_TTL = 30_000;

const getCachedDeviceId = async (
  token: string
): Promise<string | undefined> => {
  const now = Date.now();
  if (cachedDeviceId && now - lastDeviceFetch < DEVICE_CACHE_TTL) {
    return cachedDeviceId;
  }

  try {
    const devicesResponse = await fetch(
      "https://api.spotify.com/v1/me/player/devices",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (devicesResponse.ok) {
      const devicesData = await devicesResponse.json();
      const activeDevice = devicesData.devices?.find(
        (d: { is_active: boolean }) => d.is_active
      );
      const availableDevice = devicesData.devices?.[0];
      cachedDeviceId = activeDevice?.id || availableDevice?.id;
      lastDeviceFetch = now;
      return cachedDeviceId;
    }
  } catch (deviceError) {
    log("Playback: Device detection failed:", deviceError);
  }

  return undefined;
};

const invalidateDeviceCache = () => {
  cachedDeviceId = undefined;
  lastDeviceFetch = 0;
};

export const forceAppRemoteConnection = async (): Promise<boolean> => {
  log("Playback: Attempting force connection...");

  try {
    await spotify.disconnect();
  } catch (_error) {
    // Ignore disconnect errors
  }

  for (let i = 0; i < 3; i++) {
    try {
      const connected = await spotify.connect();

      if (connected) {
        return true;
      }
    } catch (_error) {
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
  const validToken = await getValidToken(accessToken, ensureValidToken);
  if (!validToken) {
    log("Playback: No valid token available for Web API playback");
    throw new Error("No valid token");
  }

  const deviceId = await getCachedDeviceId(validToken);

  const playUrl = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`
    : "https://api.spotify.com/v1/me/player/play";

  const response = await fetch(playUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${validToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uris,
    }),
  });

  if (response.ok) {
    log("Playback: Web API successfully set context and initiated playback.");
    return;
  }
  if (response.status === 401) {
    log("Playback: Token expired, falling back to direct play");
    throw new Error("Token expired - using fallback");
  }
  if (response.status === 404) {
    invalidateDeviceCache();
    const errorText = await response.text();
    log("Playback: Device not found, invalidating cache:", errorText);
    throw new Error(`Device not found: ${errorText}`);
  }
  const errorText = await response.text();
  log("Playback: Web API context failed:", {
    status: response.status,
    statusText: response.statusText,
    error: errorText,
  });
  throw new Error(`Web API context failed: ${errorText}`);
};

export const getPlaybackState =
  async (): Promise<SpotifyCurrentlyPlaying | null> => {
    try {
      const playerState = await spotify.getPlayerState();
      if (!playerState?.track) {
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
        const nativeImageUrl = await spotify.getCurrentTrackImage("LARGE");
        if (nativeImageUrl?.startsWith("data:image/")) {
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
          (["off", "track", "context"] as const)[
            playerState.playbackOptions.repeatMode
          ] ?? "off",
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
    await spotify.resume();
    log("Playback: Playback resumed");
  } catch (error) {
    logError("Playback: Error starting playback:", error);
  }
};

export const pausePlayback = async (): Promise<void> => {
  try {
    await spotify.pause();
    log("Playback: Playback paused");
  } catch (error) {
    logError("Playback: Error pausing playback:", error);
  }
};

export const skipToNext = async (): Promise<void> => {
  try {
    await spotify.skipNext();
    log("Playback: Skipped to next track");
  } catch (error) {
    logError("Playback: Error skipping to next track:", error);
  }
};

export const skipToPrevious = async (): Promise<void> => {
  try {
    await spotify.skipPrevious();
    log("Playback: Skipped to previous track");
  } catch (error) {
    logError("Playback: Error skipping to previous track:", error);
  }
};

export const toggleShuffle = async (state: boolean): Promise<void> => {
  try {
    await spotify.setShuffle(state);
    log(`Playback: Shuffle set to ${state}`);
  } catch (error) {
    logError("Playback: Error toggling shuffle:", error);
  }
};

export const toggleRepeat = async (
  state: "off" | "context" | "track"
): Promise<void> => {
  try {
    const repeatModes = { off: 0, track: 1, context: 2 } as const;
    const repeatMode = repeatModes[state];
    await spotify.setRepeat(repeatMode);
    log(`Playback: Repeat set to ${state}`);
  } catch (error) {
    logError("Playback: Error toggling repeat:", error);
  }
};

export const seekToPosition = async (positionMs: number): Promise<void> => {
  try {
    await spotify.seekTo(positionMs);
    log("Playback: Seek completed");
  } catch (error) {
    logError("Playback: Error seeking:", error);
  }
};

export const getCurrentTrack = async (): Promise<SpotifyPlayerTrack | null> => {
  try {
    const playerState = await spotify.getPlayerState();
    if (!playerState?.track) {
      return null;
    }
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
  size = "LARGE"
): Promise<string | null> => {
  try {
    let resolvedUri = uri;
    if (!resolvedUri) {
      try {
        log("Playback: Getting current track image from Native SDK");
        const imageUrl = await spotify.getCurrentTrackImage(size);
        if (imageUrl?.startsWith("data:image/")) {
          log("Playback: Successfully got current track image from Native SDK");
          return imageUrl;
        }
      } catch (error) {
        log(
          "Playback: getCurrentTrackImage failed, trying player state approach:",
          error
        );
      }

      try {
        const playerState = await spotify.getPlayerState();
        if (!playerState?.track) {
          return null;
        }
        resolvedUri = playerState.track.album.uri;
      } catch (error) {
        log("Playback: Failed to get player state for album art:", error);
        return null;
      }
    }

    if (resolvedUri) {
      log("Playback: Getting image for URI:", resolvedUri);
      const imageUrl = await spotify.getImage(resolvedUri, size);
      if (imageUrl?.startsWith("data:image/")) {
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

const findTrackPosition = (
  trackUri: string,
  sourceContext: SourceContext
): number | null => {
  if (
    sourceContext.currentIndex !== undefined &&
    sourceContext.currentIndex !== null
  ) {
    return sourceContext.currentIndex;
  }

  if (!sourceContext.tracks?.length) {
    return null;
  }

  const foundIndex = sourceContext.tracks.findIndex((track) => {
    if (!track) {
      return false;
    }
    if (typeof track === "string") {
      return track === trackUri;
    }
    if (track.uri) {
      return track.uri === trackUri;
    }
    return track.track?.uri === trackUri;
  });

  return foundIndex >= 0 ? foundIndex : null;
};

const buildPlaybackBody = (
  trackUri: string,
  sourceContext: SourceContext
): Record<string, unknown> => {
  const body: Record<string, unknown> = {};

  if (sourceContext.uri) {
    body.context_uri = sourceContext.uri;
  }

  if (sourceContext.type === "liked") {
    const position = findTrackPosition(trackUri, sourceContext);
    body.offset = position !== null ? { position } : { uri: trackUri };
  } else if (trackUri) {
    body.offset = { uri: trackUri };
  }

  return body;
};

const playViaWebApi = async (
  trackUri: string,
  token: string,
  sourceContext: SourceContext
): Promise<void> => {
  const deviceId = await getCachedDeviceId(token);
  const playbackBody = buildPlaybackBody(trackUri, sourceContext);

  const playUrl = deviceId
    ? `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`
    : "https://api.spotify.com/v1/me/player/play";

  const response = await fetch(playUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(playbackBody),
  });

  log("Playback: Web API response status:", response.status);

  if (response.ok) {
    await spotify.play();
    return;
  }

  if (response.status === 404) {
    invalidateDeviceCache();
  }

  const errorText = await response.text();
  throw new Error(`HTTP ${response.status}: ${errorText}`);
};

export const playTrackWithContext = async (
  trackUri: string,
  accessToken: string | null,
  sourceContext?: SourceContext,
  ensureValidToken?: () => Promise<string | null>
): Promise<void> => {
  log("Playback: Playing track with context:", sourceContext?.type || "none");

  try {
    if (sourceContext?.uri && sourceContext.type !== "artist") {
      const validToken = await getValidToken(accessToken, ensureValidToken);
      if (validToken) {
        try {
          await playViaWebApi(trackUri, validToken, sourceContext);
          return;
        } catch (webApiError: unknown) {
          log(
            "Playback: Web API failed, falling back to direct play:",
            webApiError instanceof Error
              ? webApiError.message
              : String(webApiError)
          );
        }
      }
    }

    log("Playback: Direct track play (no context)");
    await spotify.play(trackUri);
  } catch (error) {
    logError("Playback: Error in playTrackWithContext:", error);
    throw error;
  }
};

export const skipToIndex = async (
  sourceContext: SourceContext
): Promise<void> => {
  log(
    "Playback: Playing track with context via SkipToIndex:",
    sourceContext?.type || "none"
  );

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
    await spotify.skipToIndex(sourceContext.uri, sourceContext.currentIndex);
  }
  log("Playback: Skipped to index");
  return;
};

export const addToLibrary = async (
  uri: string,
  accessToken?: string | null
): Promise<boolean> => {
  try {
    const added = await spotify.addToLibrary(uri);
    log(`Playback: Added to library: ${uri}`, { added });

    if (added && accessToken) {
      await addTrackToSavedCache(uri, accessToken);
    }

    return added;
  } catch (error) {
    logError("Playback: Error adding to library:", error);
    return false;
  }
};

export const removeFromLibrary = async (
  uri: string,
  _accessToken?: string | null
): Promise<boolean> => {
  try {
    const removed = await spotify.removeFromLibrary(uri);
    log(`Playback: Removed from library: ${uri}`, { removed });

    if (removed) {
      const trackId = uri.replace("spotify:track:", "");
      await removeTrackFromSavedCache(trackId);
    }

    return removed;
  } catch (error) {
    logError("Playback: Error removing from library:", error);
    return false;
  }
};

export const getLibraryState = async (
  uri: string
): Promise<{ isAdded: boolean; canAdd: boolean } | null> => {
  if (inFlightLibraryChecks.has(uri)) {
    log(`Playback: Reusing in-flight library check for ${uri}`);
    const existing = inFlightLibraryChecks.get(uri);
    if (existing) {
      return await existing;
    }
    return null;
  }

  const requestPromise = (async () => {
    const trackId = uri.replace("spotify:track:", "");

    const isInCache = await isTrackInSavedCache(trackId);
    if (isInCache) {
      log(`Playback: Track ${trackId} found in cache - returning saved state`);
      return { isAdded: true, canAdd: true };
    }

    const result = await spotify.getLibraryState(uri);
    inFlightLibraryChecks.delete(uri);
    return result;
  })();

  inFlightLibraryChecks.set(uri, requestPromise);
  return await requestPromise;
};
