import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ALBUM_DETAIL_KEY_PREFIX,
  ALBUMS_KEY,
  PLAYLIST_DETAIL_KEY_PREFIX,
  PLAYLISTS_KEY,
  PODCASTS_KEY,
  SAVED_EPISODES_KEY,
  SAVED_TRACKS_KEY,
  SAVED_TRACKS_META_KEY,
  SAVED_TRACKS_PAGE_KEY_PREFIX,
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
  SpotifyTrack,
} from "@/shared/types/spotify";
import { log, logError, logWarn } from "@/shared/utils/logger";
import {
  parsePlaylist,
  parsePlaylists,
} from "@/shared/utils/normalize-playlist";
import {
  chunkSavedTracks,
  dedupeSavedTracks,
  getSavedTrackTrackId,
} from "./savedTracks";

const LEGACY_ARTISTS_KEY = "spotifyArtists";
const SAVED_TRACKS_CACHE_VERSION = 2;
const SAVED_TRACKS_PAGE_SIZE = 50;

interface SavedTracksCacheMetadata {
  version: typeof SAVED_TRACKS_CACHE_VERSION;
  pageSize: typeof SAVED_TRACKS_PAGE_SIZE;
  pageCount: number;
  freshPageCount: number;
  nextUrl: string | null;
  updatedAt: string;
}

interface SavedTracksCacheState {
  metadata: SavedTracksCacheMetadata;
  pages: SavedTrackObject[][];
}

export interface CachedSavedTracksData {
  savedTracks: SavedTrackObject[] | null;
  nextUrl: string | null;
  pageCount: number;
}

export interface CachedLibraryData {
  playlists: SpotifyPlaylist[] | null;
  albums: SpotifySavedAlbum[] | null;
  podcasts: SpotifySavedShow[] | null;
  savedTracks: SavedTrackObject[] | null;
  savedTracksNextUrl: string | null;
  savedTracksPageCount: number;
  savedEpisodes: SpotifySavedEpisode[] | null;
}

export interface SaveCachedDataOptions {
  playlists?: SpotifyPlaylist[];
  albums?: SpotifySavedAlbum[];
  tracks?: SavedTrackObject[];
  podcasts?: SpotifySavedShow[];
  savedEpisodes?: SpotifySavedEpisode[];
}

const getSavedTracksPageKey = (pageIndex: number): string =>
  `${SAVED_TRACKS_PAGE_KEY_PREFIX}${pageIndex}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseStoredJson = <T>(value: string, label: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    logWarn(`Cache: Invalid ${label} JSON`, error);
    return null;
  }
};

const createSavedTracksMetadata = (
  pageCount: number,
  freshPageCount: number,
  nextUrl: string | null,
  updatedAt = new Date().toISOString()
): SavedTracksCacheMetadata => ({
  version: SAVED_TRACKS_CACHE_VERSION,
  pageSize: SAVED_TRACKS_PAGE_SIZE,
  pageCount,
  freshPageCount: Math.min(freshPageCount, pageCount),
  nextUrl,
  updatedAt,
});

const normaliseSavedTracksMetadata = (
  value: unknown
): SavedTracksCacheMetadata | null => {
  if (!isRecord(value)) {
    return null;
  }

  const version = value.version;
  const pageSize = value.pageSize;
  const pageCount = value.pageCount;
  const freshPageCount = value.freshPageCount;
  const nextUrl = value.nextUrl;
  const updatedAt = value.updatedAt;

  if (
    version !== SAVED_TRACKS_CACHE_VERSION ||
    pageSize !== SAVED_TRACKS_PAGE_SIZE ||
    typeof pageCount !== "number" ||
    !Number.isInteger(pageCount) ||
    pageCount < 0 ||
    typeof freshPageCount !== "number" ||
    !Number.isInteger(freshPageCount) ||
    freshPageCount < 0 ||
    (nextUrl !== null && typeof nextUrl !== "string") ||
    typeof updatedAt !== "string"
  ) {
    return null;
  }

  return createSavedTracksMetadata(
    pageCount,
    freshPageCount,
    nextUrl,
    updatedAt
  );
};

const materialiseSavedTracks = (
  savedTrackPages: SavedTrackObject[][]
): SavedTrackObject[] => dedupeSavedTracks(savedTrackPages.flat());

const clearSavedTracksPagedCache = async () => {
  const allKeys = await AsyncStorage.getAllKeys();
  const savedTracksPageKeys = allKeys.filter((key) =>
    key.startsWith(SAVED_TRACKS_PAGE_KEY_PREFIX)
  );

  await AsyncStorage.multiRemove([
    SAVED_TRACKS_META_KEY,
    ...savedTracksPageKeys,
  ]);
};

const persistSavedTracksCacheState = async (
  pages: SavedTrackObject[][],
  metadata: SavedTracksCacheMetadata,
  previousPageCount: number
) => {
  const pairs: [string, string][] = [
    [SAVED_TRACKS_META_KEY, JSON.stringify(metadata)],
    ...pages.map(
      (page, pageIndex) =>
        [getSavedTracksPageKey(pageIndex), JSON.stringify(page)] as [
          string,
          string,
        ]
    ),
  ];

  await AsyncStorage.multiSet(pairs);

  if (previousPageCount > pages.length) {
    const stalePageKeys = Array.from(
      { length: previousPageCount - pages.length },
      (_, index) => getSavedTracksPageKey(pages.length + index)
    );
    await AsyncStorage.multiRemove(stalePageKeys);
  }

  await AsyncStorage.removeItem(SAVED_TRACKS_KEY);
};

const loadLegacySavedTracks = async (): Promise<SavedTrackObject[] | null> => {
  const cachedSavedTracks = await AsyncStorage.getItem(SAVED_TRACKS_KEY);
  if (!cachedSavedTracks) {
    return null;
  }

  const parsedSavedTracks = parseStoredJson<unknown>(
    cachedSavedTracks,
    "legacy saved tracks cache"
  );

  if (!Array.isArray(parsedSavedTracks)) {
    await AsyncStorage.removeItem(SAVED_TRACKS_KEY);
    return null;
  }

  return dedupeSavedTracks(parsedSavedTracks as SavedTrackObject[]);
};

const createSavedTracksCacheResult = (
  cacheState: SavedTracksCacheState | null
): CachedSavedTracksData => {
  if (!cacheState) {
    return {
      savedTracks: null,
      nextUrl: null,
      pageCount: 0,
    };
  }

  return {
    savedTracks: materialiseSavedTracks(cacheState.pages),
    nextUrl: cacheState.metadata.nextUrl,
    pageCount: cacheState.metadata.pageCount,
  };
};

const readPagedSavedTracksCache = async (
  visiblePageCount?: number
): Promise<SavedTracksCacheState | null> => {
  const cachedMetadata = await AsyncStorage.getItem(SAVED_TRACKS_META_KEY);
  if (!cachedMetadata) {
    return null;
  }

  const parsedMetadata = parseStoredJson<unknown>(
    cachedMetadata,
    "saved tracks cache metadata"
  );
  const metadata = normaliseSavedTracksMetadata(parsedMetadata);

  if (!metadata) {
    logWarn("Cache: Saved tracks cache metadata was invalid, clearing it");
    await clearSavedTracksPagedCache();
    return null;
  }

  if (metadata.pageCount === 0) {
    return {
      metadata,
      pages: [],
    };
  }

  const targetPageCount = Math.min(
    visiblePageCount ?? metadata.pageCount,
    metadata.pageCount
  );

  if (targetPageCount === 0) {
    return {
      metadata,
      pages: [],
    };
  }

  const pageKeys = Array.from({ length: targetPageCount }, (_, pageIndex) =>
    getSavedTracksPageKey(pageIndex)
  );
  const pageResults = await AsyncStorage.multiGet(pageKeys);
  const pages: SavedTrackObject[][] = [];

  for (const [pageKey, value] of pageResults) {
    if (!value) {
      break;
    }

    const pageIndex = pages.length;
    const parsedPage = parseStoredJson<unknown>(
      value,
      `saved tracks cache page ${pageIndex}`
    );

    if (!Array.isArray(parsedPage)) {
      logWarn(`Cache: Saved tracks cache page ${pageKey} was invalid`);
      break;
    }

    pages.push(parsedPage as SavedTrackObject[]);
  }

  if (pages.length !== targetPageCount) {
    const truncatedMetadata = createSavedTracksMetadata(
      pages.length,
      Math.min(metadata.freshPageCount, pages.length),
      pages.length >= metadata.freshPageCount ? metadata.nextUrl : null,
      metadata.updatedAt
    );
    await persistSavedTracksCacheState(
      pages,
      truncatedMetadata,
      metadata.pageCount
    );
    logWarn("Cache: Truncated saved tracks cache after a missing page", {
      previousPageCount: metadata.pageCount,
      nextPageCount: pages.length,
    });

    return {
      metadata: truncatedMetadata,
      pages,
    };
  }

  return {
    metadata,
    pages,
  };
};

const loadSavedTracksCacheState = async (
  visiblePageCount?: number
): Promise<SavedTracksCacheState | null> => {
  const pagedState = await readPagedSavedTracksCache(visiblePageCount);
  if (pagedState) {
    return pagedState;
  }

  const legacySavedTracks = await loadLegacySavedTracks();
  if (!legacySavedTracks) {
    return null;
  }

  const legacyPages = chunkSavedTracks(
    legacySavedTracks,
    SAVED_TRACKS_PAGE_SIZE
  );

  const metadata = createSavedTracksMetadata(legacyPages.length, 0, null);
  const targetPageCount = Math.min(
    visiblePageCount ?? metadata.pageCount,
    metadata.pageCount
  );

  return {
    metadata,
    pages: legacyPages.slice(0, targetPageCount),
  };
};

const loadVisibleSavedTracksCache = async (
  visiblePageCount?: number
): Promise<CachedSavedTracksData> => {
  const cacheState = await loadSavedTracksCacheState(visiblePageCount);
  return createSavedTracksCacheResult(cacheState);
};

const rewriteSavedTracksCache = async (
  savedTracks: SavedTrackObject[],
  nextUrl: string | null,
  freshPageCount: number,
  previousPageCount: number,
  visiblePageCount?: number
): Promise<CachedSavedTracksData> => {
  const dedupedSavedTracks = dedupeSavedTracks(savedTracks);
  const pages = chunkSavedTracks(dedupedSavedTracks, SAVED_TRACKS_PAGE_SIZE);
  const metadata = createSavedTracksMetadata(
    pages.length,
    freshPageCount,
    nextUrl
  );

  await persistSavedTracksCacheState(pages, metadata, previousPageCount);

  return createSavedTracksCacheResult({
    metadata,
    pages: pages.slice(0, visiblePageCount ?? metadata.pageCount),
  });
};

export const loadSavedTracksCache = async (options?: {
  visiblePageCount?: number;
}): Promise<CachedSavedTracksData> => {
  try {
    return await loadVisibleSavedTracksCache(options?.visiblePageCount);
  } catch (error) {
    logError("Cache: Error loading saved tracks cache:", error);
    return {
      savedTracks: null,
      nextUrl: null,
      pageCount: 0,
    };
  }
};

export const replaceSavedTracksFirstPage = async (
  savedTracks: SavedTrackObject[],
  nextUrl: string | null,
  visiblePageCount = 1
): Promise<CachedSavedTracksData> => {
  try {
    const cacheState = await loadSavedTracksCacheState();
    const existingPages = cacheState?.pages ?? [];
    const shouldKeepDeeperPages = nextUrl !== null;
    let nextPages: SavedTrackObject[][];

    if (savedTracks.length === 0 && !shouldKeepDeeperPages) {
      nextPages = [];
    } else if (shouldKeepDeeperPages) {
      nextPages = [savedTracks, ...existingPages.slice(1)];
    } else {
      nextPages = [savedTracks];
    }
    const previousPageCount = cacheState?.metadata.pageCount ?? 0;
    const metadata = createSavedTracksMetadata(
      nextPages.length,
      nextPages.length > 0 ? 1 : 0,
      nextUrl
    );

    await persistSavedTracksCacheState(nextPages, metadata, previousPageCount);

    return createSavedTracksCacheResult({
      metadata,
      pages: nextPages.slice(0, Math.min(visiblePageCount, metadata.pageCount)),
    });
  } catch (error) {
    logError("Cache: Error replacing saved tracks first page:", error);
    return {
      savedTracks,
      nextUrl,
      pageCount: Math.max(savedTracks.length > 0 ? 1 : 0, 0),
    };
  }
};

export const appendSavedTracksPage = async (
  savedTracks: SavedTrackObject[],
  nextUrl: string | null,
  visiblePageCount: number
): Promise<CachedSavedTracksData> => {
  try {
    const cacheState = await loadSavedTracksCacheState();
    const existingPages = [...(cacheState?.pages ?? [])];
    const previousPageCount = cacheState?.metadata.pageCount ?? 0;
    const previousFreshPageCount = cacheState?.metadata.freshPageCount ?? 0;

    existingPages[previousFreshPageCount] = savedTracks;

    const metadata = createSavedTracksMetadata(
      Math.max(existingPages.length, previousPageCount),
      previousFreshPageCount + 1,
      nextUrl
    );

    await persistSavedTracksCacheState(
      existingPages,
      metadata,
      previousPageCount
    );

    return createSavedTracksCacheResult({
      metadata,
      pages: existingPages.slice(
        0,
        Math.min(visiblePageCount, metadata.pageCount)
      ),
    });
  } catch (error) {
    logError("Cache: Error appending saved tracks page:", error);
    return {
      savedTracks,
      nextUrl,
      pageCount: visiblePageCount,
    };
  }
};

export const loadCachedData = async (): Promise<CachedLibraryData> => {
  try {
    const keys = [PLAYLISTS_KEY, ALBUMS_KEY, PODCASTS_KEY, SAVED_EPISODES_KEY];
    const [results, savedTracksCache] = await Promise.all([
      AsyncStorage.multiGet(keys),
      loadSavedTracksCache({ visiblePageCount: 1 }),
    ]);

    const cachedData: CachedLibraryData = {
      playlists: results[0][1]
        ? parsePlaylists(JSON.parse(results[0][1]))
        : null,
      albums: results[1][1]
        ? (JSON.parse(results[1][1]) as SpotifySavedAlbum[])
        : null,
      podcasts: results[2][1]
        ? (JSON.parse(results[2][1]) as SpotifySavedShow[])
        : null,
      savedTracks: savedTracksCache.savedTracks,
      savedTracksNextUrl: savedTracksCache.nextUrl,
      savedTracksPageCount: savedTracksCache.pageCount,
      savedEpisodes: results[3][1]
        ? (JSON.parse(results[3][1]) as SpotifySavedEpisode[])
        : null,
    };

    const hasAnyCache =
      cachedData.playlists !== null ||
      cachedData.albums !== null ||
      cachedData.podcasts !== null ||
      cachedData.savedTracks !== null ||
      cachedData.savedEpisodes !== null;

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
      savedTracksNextUrl: null,
      savedTracksPageCount: 0,
      savedEpisodes: null,
    };
  }
};

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
    if (options.savedEpisodes) {
      pairs.push([SAVED_EPISODES_KEY, JSON.stringify(options.savedEpisodes)]);
    }
    if (pairs.length > 0) {
      await AsyncStorage.multiSet(pairs);
    }
    if (options.tracks) {
      const cacheState = await loadSavedTracksCacheState();
      await rewriteSavedTracksCache(
        options.tracks,
        cacheState?.metadata.nextUrl ?? null,
        cacheState?.metadata.freshPageCount ?? 0,
        cacheState?.metadata.pageCount ?? 0
      );
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
    await clearSavedTracksPagedCache();
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
  try {
    const savedTracksCache = await loadSavedTracksCache();
    return (
      savedTracksCache.savedTracks?.some(
        (savedTrack) => getSavedTrackTrackId(savedTrack) === trackId
      ) ?? false
    );
  } catch (error) {
    logError("Cache: Error checking saved tracks cache:", error);
    return false;
  }
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
    const trackData = (await trackResponse.json()) as SpotifyTrack;
    const cacheState = await loadSavedTracksCacheState();
    const cachedTracks = cacheState
      ? materialiseSavedTracks(cacheState.pages)
      : [];
    const nextTracks = cachedTracks.filter(
      (savedTrack) => getSavedTrackTrackId(savedTrack) !== trackId
    );

    const newSavedTrack: SavedTrackObject = {
      added_at: new Date().toISOString(),
      track: trackData as unknown as SavedTrackObject["track"],
    };
    nextTracks.unshift(newSavedTrack);

    await rewriteSavedTracksCache(
      nextTracks,
      cacheState?.metadata.nextUrl ?? null,
      cacheState?.metadata.freshPageCount ?? 0,
      cacheState?.metadata.pageCount ?? 0
    );
    log(`Cache: Updated cached tracks - added track ${trackId}`);
  } else {
    log(`Cache: Failed to fetch track details for ${trackId}`);
  }
};

export const removeTrackFromSavedCache = async (
  trackId: string
): Promise<void> => {
  const cacheState = await loadSavedTracksCacheState();
  if (!cacheState) {
    return;
  }

  const nextTracks = materialiseSavedTracks(cacheState.pages).filter(
    (savedTrack) => getSavedTrackTrackId(savedTrack) !== trackId
  );

  await rewriteSavedTracksCache(
    nextTracks,
    cacheState.metadata.nextUrl,
    cacheState.metadata.freshPageCount,
    cacheState.metadata.pageCount
  );
  log(`Cache: Updated cached tracks - removed track ${trackId}`);
};
