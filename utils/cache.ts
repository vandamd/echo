import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    PLAYLISTS_KEY,
    ALBUMS_KEY,
    PODCASTS_KEY,
    ARTISTS_KEY,
    SAVED_TRACKS_KEY,
    ALBUM_DETAIL_KEY_PREFIX,
    PLAYLIST_DETAIL_KEY_PREFIX,
    SHOW_DETAIL_KEY_PREFIX,
} from "../constants/spotify";
import { log, logError } from "../utils/logger";
import type {
    SpotifyPlaylist,
    SpotifySavedAlbum,
    SpotifySavedShow,
    SpotifyArtist,
    SavedTrackObject,
    SpotifyAlbum,
    SpotifyShow,
} from "../types/spotify";

interface SpotifyPlaylistFull extends SpotifyPlaylist {
    tracks: {
        href: string;
        items: any[];
        limit: number;
        next: string | null;
        offset: number;
        previous: string | null;
        total: number;
    };
}

export const loadCachedData = async () => {
    try {
        let hasAnyCache = false;
        const cachedData = {
            playlists: null as SpotifyPlaylist[] | null,
            albums: null as SpotifySavedAlbum[] | null,
            podcasts: null as SpotifySavedShow[] | null,
            artists: null as SpotifyArtist[] | null,
            savedTracks: null as SavedTrackObject[] | null,
        };

        const cachedPlaylists = await AsyncStorage.getItem(PLAYLISTS_KEY);
        if (cachedPlaylists) {
            cachedData.playlists = JSON.parse(cachedPlaylists);
            hasAnyCache = true;
        }

        const cachedAlbums = await AsyncStorage.getItem(ALBUMS_KEY);
        if (cachedAlbums) {
            cachedData.albums = JSON.parse(cachedAlbums);
            hasAnyCache = true;
        }

        const cachedPodcasts = await AsyncStorage.getItem(PODCASTS_KEY);
        if (cachedPodcasts) {
            cachedData.podcasts = JSON.parse(cachedPodcasts);
            hasAnyCache = true;
        }

        const cachedArtists = await AsyncStorage.getItem(ARTISTS_KEY);
        if (cachedArtists) {
            cachedData.artists = JSON.parse(cachedArtists);
            hasAnyCache = true;
        }

        const cachedSavedTracks = await AsyncStorage.getItem(SAVED_TRACKS_KEY);
        if (cachedSavedTracks) {
            cachedData.savedTracks = JSON.parse(cachedSavedTracks);
            hasAnyCache = true;
        }

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
            artists: null,
            savedTracks: null,
        };
    }
};

export const saveCachedData = async (
    playlistsData?: SpotifyPlaylist[],
    albumsData?: SpotifySavedAlbum[],
    artistsData?: SpotifyArtist[],
    tracksData?: SavedTrackObject[],
    podcastsData?: SpotifySavedShow[]
) => {
    try {
        if (playlistsData) {
            await AsyncStorage.setItem(
                PLAYLISTS_KEY,
                JSON.stringify(playlistsData)
            );
        }
        if (albumsData) {
            await AsyncStorage.setItem(ALBUMS_KEY, JSON.stringify(albumsData));
        }
        if (podcastsData) {
            await AsyncStorage.setItem(
                PODCASTS_KEY,
                JSON.stringify(podcastsData)
            );
        }
        if (artistsData) {
            await AsyncStorage.setItem(ARTISTS_KEY, JSON.stringify(artistsData));
        }
        if (tracksData) {
            await AsyncStorage.setItem(
                SAVED_TRACKS_KEY,
                JSON.stringify(tracksData)
            );
        }
    } catch (error) {
        logError("Cache: Error saving cached data:", error);
    }
};

export const clearCachedData = async () => {
    try {
        await AsyncStorage.removeItem(PLAYLISTS_KEY);
        await AsyncStorage.removeItem(ALBUMS_KEY);
        await AsyncStorage.removeItem(PODCASTS_KEY);
        await AsyncStorage.removeItem(ARTISTS_KEY);
        await AsyncStorage.removeItem(SAVED_TRACKS_KEY);
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
        logError(
            "Cache: Error refreshing saved albums from cache:",
            error
        );
    }
    return null;
};

export const refreshPlaylistsFromCache = async () => {
    try {
        const cachedPlaylists = await AsyncStorage.getItem(PLAYLISTS_KEY);
        if (cachedPlaylists) {
            const parsedPlaylists = JSON.parse(cachedPlaylists);
            log(
                `Cache: Refreshed playlists state from cache - ${parsedPlaylists.length} playlists`
            );
            return parsedPlaylists;
        }
    } catch (error) {
        logError(
            "Cache: Error refreshing playlists from cache:",
            error
        );
    }
    return null;
};

export const refreshFollowedArtistsFromCache = async () => {
    try {
        const cachedFollowedArtists = await AsyncStorage.getItem(ARTISTS_KEY);
        if (cachedFollowedArtists) {
            const parsedArtists = JSON.parse(cachedFollowedArtists);
            log(
                `Cache: Refreshed followed artists state from cache - ${parsedArtists.length} artists`
            );
            return parsedArtists;
        }
    } catch (error) {
        logError(
            "Cache: Error refreshing followed artists from cache:",
            error
        );
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
        logError(
            "Cache: Error refreshing followed podcasts from cache:",
            error
        );
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

export const getCachedAlbumDetail = async (albumId: string): Promise<SpotifyAlbum | null> => {
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

export const getCachedShowDetail = async (showId: string): Promise<SpotifyShow | null> => {
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

export const saveCachedPlaylistDetail = async (playlist: SpotifyPlaylistFull) => {
    try {
        const key = `${PLAYLIST_DETAIL_KEY_PREFIX}${playlist.id}`;
        await AsyncStorage.setItem(key, JSON.stringify(playlist));
        log(`Cache: Saved playlist detail for ${playlist.name} (${playlist.id})`);
    } catch (error) {
        logError("Cache: Error saving playlist detail:", error);
    }
};

export const getCachedPlaylistDetail = async (playlistId: string): Promise<SpotifyPlaylistFull | null> => {
    try {
        const key = `${PLAYLIST_DETAIL_KEY_PREFIX}${playlistId}`;
        const cachedPlaylist = await AsyncStorage.getItem(key);
        if (cachedPlaylist) {
            const parsedPlaylist = JSON.parse(cachedPlaylist);
            log(`Cache: Retrieved cached playlist detail for ${playlistId}`);
            return parsedPlaylist;
        }
    } catch (error) {
        logError("Cache: Error retrieving cached playlist detail:", error);
    }
    return null;
};

export const clearCachedPlaylistDetails = async () => {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const playlistDetailKeys = keys.filter(key => key.startsWith(PLAYLIST_DETAIL_KEY_PREFIX));
        if (playlistDetailKeys.length > 0) {
            await AsyncStorage.multiRemove(playlistDetailKeys);
            log(`Cache: Cleared ${playlistDetailKeys.length} cached playlist details`);
        }
    } catch (error) {
        logError("Cache: Error clearing cached playlist details:", error);
    }
};

export const clearCachedAlbumDetails = async () => {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const albumDetailKeys = keys.filter(key => key.startsWith(ALBUM_DETAIL_KEY_PREFIX));
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
        const showDetailKeys = keys.filter(key => key.startsWith(SHOW_DETAIL_KEY_PREFIX));
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

export const isPlaylistCached = async (playlistId: string): Promise<boolean> => {
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

export const refreshSavedTracksFromCache = async (): Promise<SavedTrackObject[] | null> => {
    const cachedSavedTracks = await AsyncStorage.getItem(SAVED_TRACKS_KEY);
    if (cachedSavedTracks) {
        const parsedTracks = JSON.parse(cachedSavedTracks);
        log(
            `Cache: Refreshed saved tracks state from cache - ${parsedTracks.length} tracks`
        );
        return parsedTracks;
    }
    return null;
};

export const isTrackInSavedCache = async (trackId: string): Promise<boolean> => {
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
        let parsedTracks = cachedTracks ? JSON.parse(cachedTracks) : [];

        const newSavedTrack: SavedTrackObject = {
            added_at: new Date().toISOString(),
            track: trackData,
        };
        parsedTracks.unshift(newSavedTrack);

        await AsyncStorage.setItem(
            SAVED_TRACKS_KEY,
            JSON.stringify(parsedTracks)
        );
        log(`Cache: Updated cached tracks - added track ${trackId}`);
    } else {
        log(`Cache: Failed to fetch track details for ${trackId}`);
    }
};

export const removeTrackFromSavedCache = async (trackId: string): Promise<void> => {
    const cachedTracks = await AsyncStorage.getItem(SAVED_TRACKS_KEY);
    if (cachedTracks) {
        let parsedTracks = JSON.parse(cachedTracks);
        parsedTracks = parsedTracks.filter(
            (savedTrack: SavedTrackObject) => savedTrack.track?.id !== trackId
        );
        await AsyncStorage.setItem(
            SAVED_TRACKS_KEY,
            JSON.stringify(parsedTracks)
        );
        log(`Cache: Updated cached tracks - removed track ${trackId}`);
    }
};


