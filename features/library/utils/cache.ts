import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ALBUM_DETAIL_KEY_PREFIX,
  ALBUMS_KEY,
  PLAYLIST_DETAIL_KEY_PREFIX,
  PLAYLISTS_KEY,
  PODCASTS_KEY,
  SAVED_EPISODES_KEY,
  SAVED_TRACKS_KEY,
  SHOW_DETAIL_KEY_PREFIX,
} from "@/constants/spotify";
import type {
  SavedTrackObject,
  SpotifyAlbum,
  SpotifyPlaylist,
  SpotifyPlaylistFull,
  SpotifySavedAlbum,
  SpotifySavedEpisode,
  SpotifySavedShow,
  SpotifyShow,
} from "@/shared/types/spotify";
import { log, logError } from "@/shared/utils/logger";
import {
  parsePlaylist,
  parsePlaylists,
} from "@/shared/utils/normalize-playlist";

const LEGACY_ARTISTS_KEY = "spotifyArtists";

export const loadCachedData = async () => {
  try {
    const keys = [
      PLAYLISTS_KEY,
      ALBUMS_KEY,
      PODCASTS_KEY,
      SAVED_TRACKS_KEY,
      SAVED_EPISODES_KEY,
    ];
    const results = await AsyncStorage.multiGet(keys);

    const cachedData = {
      playlists: results[0][1]
        ? parsePlaylists(JSON.parse(results[0][1]))
        : null,
      albums: results[1][1]
        ? (JSON.parse(results[1][1]) as SpotifySavedAlbum[])
        : null,
      podcasts: results[2][1]
        ? (JSON.parse(results[2][1]) as SpotifySavedShow[])
        : null,
      savedTracks: results[3][1]
        ? (JSON.parse(results[3][1]) as SavedTrackObject[])
        : null,
      savedEpisodes: results[4][1]
        ? (JSON.parse(results[4][1]) as SpotifySavedEpisode[])
        : null,
    };

    const hasAnyCache = Object.values(cachedData).some((v) => v !== null);

    if (hasAnyCache) {
      log("Cache: Loaded cached data");
    } else {
      log("Cache: No cached data found");
    }

    return cachedData;
  } catch (error) {
    logError("Cache: Error loading cached data:", error);
    return {
      playlists: null,
      albums: null,
      podcasts: null,
      savedTracks: null,
      savedEpisodes: null,
    };
  }
};

export interface SaveCachedDataOptions {
  playlists?: SpotifyPlaylist[];
  albums?: SpotifySavedAlbum[];
  tracks?: SavedTrackObject[];
  podcasts?: SpotifySavedShow[];
  savedEpisodes?: SpotifySavedEpisode[];
}

export const saveCachedData = async (options: SaveCachedDataOptions) => {
  try {
    const pairs: [string, string][] = [];
    if (options.playlists) {
      const canonicalPlaylists = parsePlaylists(options.playlists);
      pairs.push([
        PLAYLISTS_KEY,
        JSON.stringify(canonicalPlaylists ?? options.playlists),
      ]);
    }
    if (options.albums) {
      pairs.push([ALBUMS_KEY, JSON.stringify(options.albums)]);
    }
    if (options.podcasts) {
      pairs.push([PODCASTS_KEY, JSON.stringify(options.podcasts)]);
    }
    if (options.tracks) {
      pairs.push([SAVED_TRACKS_KEY, JSON.stringify(options.tracks)]);
    }
    if (options.savedEpisodes) {
      pairs.push([SAVED_EPISODES_KEY, JSON.stringify(options.savedEpisodes)]);
    }
    if (pairs.length > 0) {
      await AsyncStorage.multiSet(pairs);
    }
  } catch (error) {
    logError("Cache: Error saving cached data:", error);
  }
};

export const clearCachedData = async () => {
  try {
    await AsyncStorage.multiRemove([
      PLAYLISTS_KEY,
      ALBUMS_KEY,
      PODCASTS_KEY,
      LEGACY_ARTISTS_KEY,
      SAVED_TRACKS_KEY,
      SAVED_EPISODES_KEY,
    ]);
    await clearCachedAlbumDetails();
    await clearCachedPlaylistDetails();
    await clearCachedShowDetails();
    log("Cache: Cache cleared");
  } catch (error) {
    logError("Cache: Error clearing cache:", error);
  }
};

export const refreshSavedAlbumsFromCache = async () => {
  try {
    const cachedSavedAlbums = await AsyncStorage.getItem(ALBUMS_KEY);
    if (cachedSavedAlbums) {
      const parsedAlbums = JSON.parse(cachedSavedAlbums);
      log(
        `Cache: Refreshed saved albums state from cache - ${parsedAlbums.length} albums`
      );
      return parsedAlbums;
    }
  } catch (error) {
    logError("Cache: Error refreshing saved albums from cache:", error);
  }
  return null;
};

export const refreshPlaylistsFromCache = async () => {
  try {
    const cachedPlaylists = await AsyncStorage.getItem(PLAYLISTS_KEY);
    if (cachedPlaylists) {
      const parsedPlaylists = parsePlaylists(JSON.parse(cachedPlaylists));
      if (!parsedPlaylists) {
        return null;
      }
      log(
        `Cache: Refreshed playlists state from cache - ${parsedPlaylists.length} playlists`
      );
      return parsedPlaylists;
    }
  } catch (error) {
    logError("Cache: Error refreshing playlists from cache:", error);
  }
  return null;
};

export const refreshFollowedPodcastsFromCache = async () => {
  try {
    const cachedPodcasts = await AsyncStorage.getItem(PODCASTS_KEY);
    if (cachedPodcasts) {
      const parsedPodcasts = JSON.parse(cachedPodcasts);
      log(
        `Cache: Refreshed followed podcasts state from cache - ${parsedPodcasts.length} shows`
      );
      return parsedPodcasts;
    }
  } catch (error) {
    logError("Cache: Error refreshing followed podcasts from cache:", error);
  }
  return null;
};

export const refreshSavedEpisodesFromCache = async (): Promise<
  SpotifySavedEpisode[] | null
> => {
  try {
    const cachedEpisodes = await AsyncStorage.getItem(SAVED_EPISODES_KEY);
    if (cachedEpisodes) {
      const parsedEpisodes = JSON.parse(cachedEpisodes);
      log(
        `Cache: Refreshed saved episodes state from cache - ${parsedEpisodes.length} episodes`
      );
      return parsedEpisodes;
    }
  } catch (error) {
    logError("Cache: Error refreshing saved episodes from cache:", error);
  }
  return null;
};

export const saveCachedAlbumDetail = async (album: SpotifyAlbum) => {
  try {
    const key = `${ALBUM_DETAIL_KEY_PREFIX}${album.id}`;
    await AsyncStorage.setItem(key, JSON.stringify(album));
    log(`Cache: Saved album detail for ${album.name} (${album.id})`);
  } catch (error) {
    logError("Cache: Error saving album detail:", error);
  }
};

export const getCachedAlbumDetail = async (
  albumId: string
): Promise<SpotifyAlbum | null> => {
  try {
    const key = `${ALBUM_DETAIL_KEY_PREFIX}${albumId}`;
    const cachedAlbum = await AsyncStorage.getItem(key);
    if (cachedAlbum) {
      const parsedAlbum = JSON.parse(cachedAlbum);
      log(`Cache: Retrieved cached album detail for ${albumId}`);
      return parsedAlbum;
    }
  } catch (error) {
    logError("Cache: Error retrieving cached album detail:", error);
  }
  return null;
};

export const saveCachedShowDetail = async (show: SpotifyShow) => {
  try {
    const key = `${SHOW_DETAIL_KEY_PREFIX}${show.id}`;
    await AsyncStorage.setItem(key, JSON.stringify(show));
    log(`Cache: Saved show detail for ${show.name} (${show.id})`);
  } catch (error) {
    logError("Cache: Error saving show detail:", error);
  }
};

export const getCachedShowDetail = async (
  showId: string
): Promise<SpotifyShow | null> => {
  try {
    const key = `${SHOW_DETAIL_KEY_PREFIX}${showId}`;
    const cachedShow = await AsyncStorage.getItem(key);
    if (cachedShow) {
      const parsedShow = JSON.parse(cachedShow);
      log(`Cache: Retrieved cached show detail for ${showId}`);
      return parsedShow;
    }
  } catch (error) {
    logError("Cache: Error retrieving cached show detail:", error);
  }
  return null;
};

export const saveCachedPlaylistDetail = async (
  playlist: SpotifyPlaylist | SpotifyPlaylistFull
) => {
  try {
    const canonicalPlaylist = parsePlaylist(playlist) ?? playlist;
    const key = `${PLAYLIST_DETAIL_KEY_PREFIX}${canonicalPlaylist.id}`;
    await AsyncStorage.setItem(key, JSON.stringify(canonicalPlaylist));
    log(
      `Cache: Saved playlist detail for ${canonicalPlaylist.name} (${canonicalPlaylist.id})`
    );
  } catch (error) {
    logError("Cache: Error saving playlist detail:", error);
  }
};

export const getCachedPlaylistDetail = async (
  playlistId: string
): Promise<SpotifyPlaylist | SpotifyPlaylistFull | null> => {
  try {
    const key = `${PLAYLIST_DETAIL_KEY_PREFIX}${playlistId}`;
    const cachedPlaylist = await AsyncStorage.getItem(key);
    if (cachedPlaylist) {
      const parsedPlaylist = parsePlaylist(JSON.parse(cachedPlaylist));
      if (parsedPlaylist) {
        log(`Cache: Retrieved cached playlist detail for ${playlistId}`);
        return parsedPlaylist;
      }
    }
  } catch (error) {
    logError("Cache: Error retrieving cached playlist detail:", error);
  }
  return null;
};

export const clearCachedPlaylistDetails = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const playlistDetailKeys = keys.filter((key) =>
      key.startsWith(PLAYLIST_DETAIL_KEY_PREFIX)
    );
    if (playlistDetailKeys.length > 0) {
      await AsyncStorage.multiRemove(playlistDetailKeys);
      log(
        `Cache: Cleared ${playlistDetailKeys.length} cached playlist details`
      );
    }
  } catch (error) {
    logError("Cache: Error clearing cached playlist details:", error);
  }
};

export const clearCachedAlbumDetails = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const albumDetailKeys = keys.filter((key) =>
      key.startsWith(ALBUM_DETAIL_KEY_PREFIX)
    );
    if (albumDetailKeys.length > 0) {
      await AsyncStorage.multiRemove(albumDetailKeys);
      log(`Cache: Cleared ${albumDetailKeys.length} cached album details`);
    }
  } catch (error) {
    logError("Cache: Error clearing cached album details:", error);
  }
};

export const clearCachedShowDetails = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const showDetailKeys = keys.filter((key) =>
      key.startsWith(SHOW_DETAIL_KEY_PREFIX)
    );
    if (showDetailKeys.length > 0) {
      await AsyncStorage.multiRemove(showDetailKeys);
      log(`Cache: Cleared ${showDetailKeys.length} cached show details`);
    }
  } catch (error) {
    logError("Cache: Error clearing cached show details:", error);
  }
};

export const isAlbumCached = async (albumId: string): Promise<boolean> => {
  try {
    const key = `${ALBUM_DETAIL_KEY_PREFIX}${albumId}`;
    const cachedAlbum = await AsyncStorage.getItem(key);
    return cachedAlbum !== null;
  } catch (error) {
    logError("Cache: Error checking if album is cached:", error);
    return false;
  }
};

export const isPlaylistCached = async (
  playlistId: string
): Promise<boolean> => {
  try {
    const key = `${PLAYLIST_DETAIL_KEY_PREFIX}${playlistId}`;
    const cachedPlaylist = await AsyncStorage.getItem(key);
    return cachedPlaylist !== null;
  } catch (error) {
    logError("Cache: Error checking if playlist is cached:", error);
    return false;
  }
};

export const isShowCached = async (showId: string): Promise<boolean> => {
  try {
    const key = `${SHOW_DETAIL_KEY_PREFIX}${showId}`;
    const cachedShow = await AsyncStorage.getItem(key);
    return cachedShow !== null;
  } catch (error) {
    logError("Cache: Error checking if show is cached:", error);
    return false;
  }
};

export const isTrackInSavedCache = async (
  trackId: string
): Promise<boolean> => {
  const cachedSavedTracks = await AsyncStorage.getItem(SAVED_TRACKS_KEY);
  if (cachedSavedTracks) {
    const parsedTracks = JSON.parse(cachedSavedTracks);
    return parsedTracks.some(
      (savedTrack: SavedTrackObject) => savedTrack.track?.id === trackId
    );
  }
  return false;
};

export const addTrackToSavedCache = async (
  trackUri: string,
  accessToken: string | null
): Promise<void> => {
  const trackId = trackUri.replace("spotify:track:", "");

  if (!accessToken) {
    log("Cache: Cannot fetch track details - no access token");
    return;
  }

  const trackResponse = await fetch(
    `https://api.spotify.com/v1/tracks/${trackId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (trackResponse.ok) {
    const trackData = await trackResponse.json();
    const cachedTracks = await AsyncStorage.getItem(SAVED_TRACKS_KEY);
    const parsedTracks = cachedTracks ? JSON.parse(cachedTracks) : [];

    const newSavedTrack: SavedTrackObject = {
      added_at: new Date().toISOString(),
      track: trackData,
    };
    parsedTracks.unshift(newSavedTrack);

    await AsyncStorage.setItem(SAVED_TRACKS_KEY, JSON.stringify(parsedTracks));
    log(`Cache: Updated cached tracks - added track ${trackId}`);
  } else {
    log(`Cache: Failed to fetch track details for ${trackId}`);
  }
};

export const removeTrackFromSavedCache = async (
  trackId: string
): Promise<void> => {
  const cachedTracks = await AsyncStorage.getItem(SAVED_TRACKS_KEY);
  if (cachedTracks) {
    let parsedTracks = JSON.parse(cachedTracks);
    parsedTracks = parsedTracks.filter(
      (savedTrack: SavedTrackObject) => savedTrack.track?.id !== trackId
    );
    await AsyncStorage.setItem(SAVED_TRACKS_KEY, JSON.stringify(parsedTracks));
    log(`Cache: Updated cached tracks - removed track ${trackId}`);
  }
};
