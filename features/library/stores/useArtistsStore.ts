import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { ARTISTS_KEY } from "@/constants/spotify";
import type {
  SpotifyAlbumSimple,
  SpotifyArtist,
  SpotifyFollowedArtistsResponse,
  SpotifyPaginatedResponse,
  SpotifyTrack,
} from "@/shared/types/spotify";
import { apiDelete, apiGet, apiPut } from "@/shared/utils/api-client";
import { log, logError } from "@/shared/utils/logger";
import { saveCachedData } from "../utils/cache";

interface ArtistsState {
  artists: SpotifyArtist[] | null;
  nextUrl: string | null;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  fetch: (options?: { showRefreshing?: boolean }) => Promise<void>;
  fetchMore: () => Promise<void>;
  followArtist: (artistId: string) => Promise<boolean>;
  unfollowArtist: (artistId: string) => Promise<boolean>;
  checkIfFollowing: (artistId: string) => Promise<boolean>;
  fetchArtistTopTracks: (artistId: string) => Promise<SpotifyTrack[]>;
  fetchArtistAlbums: (
    artistId: string
  ) => Promise<{ albums: SpotifyAlbumSimple[] | null; nextUrl: string | null }>;
  fetchMoreArtistAlbums: (
    nextUrl: string | null
  ) => Promise<{ albums: SpotifyAlbumSimple[] | null; nextUrl: string | null }>;
  setArtists: (artists: SpotifyArtist[] | null) => void;
  reset: () => void;
}

export const useArtistsStore = create<ArtistsState>()((set, get) => ({
  artists: null,
  nextUrl: null,
  isRefreshing: false,
  isLoadingMore: false,

  fetch: async (options) => {
    const showRefreshing = options?.showRefreshing ?? true;
    if (showRefreshing) {
      set({ isRefreshing: true });
    }
    try {
      const data = await apiGet<SpotifyFollowedArtistsResponse>(
        "https://api.spotify.com/v1/me/following?type=artist&limit=50"
      );
      if (data) {
        set({ artists: data.artists.items, nextUrl: data.artists.next });
        await saveCachedData({ artists: data.artists.items });
      }
    } finally {
      if (showRefreshing) {
        set({ isRefreshing: false });
      }
    }
  },

  fetchMore: async () => {
    const { nextUrl, isLoadingMore } = get();
    if (!nextUrl || isLoadingMore) {
      return;
    }
    set({ isLoadingMore: true });
    const data = await apiGet<SpotifyFollowedArtistsResponse>(nextUrl);
    if (data) {
      set((state) => ({
        artists: [...(state.artists || []), ...data.artists.items],
        nextUrl: data.artists.next,
      }));
    }
    set({ isLoadingMore: false });
  },

  followArtist: async (artistId: string) => {
    try {
      const followed = await apiPut(
        `https://api.spotify.com/v1/me/following?type=artist&ids=${artistId}`
      );
      if (!followed) {
        return false;
      }
      const artistData = await apiGet<SpotifyArtist>(
        `https://api.spotify.com/v1/artists/${artistId}`
      );
      if (artistData) {
        const cachedArtists = await AsyncStorage.getItem(ARTISTS_KEY);
        const parsedArtists: SpotifyArtist[] = cachedArtists
          ? JSON.parse(cachedArtists)
          : [];
        parsedArtists.unshift(artistData);
        await AsyncStorage.setItem(ARTISTS_KEY, JSON.stringify(parsedArtists));
        set({ artists: parsedArtists });
        log(`Artist ${artistId} followed successfully`);
      }
      return true;
    } catch (error) {
      logError("Error following artist:", error);
      return false;
    }
  },

  unfollowArtist: async (artistId: string) => {
    try {
      const unfollowed = await apiDelete(
        `https://api.spotify.com/v1/me/following?type=artist&ids=${artistId}`
      );
      if (!unfollowed) {
        return false;
      }
      const cachedArtists = await AsyncStorage.getItem(ARTISTS_KEY);
      if (cachedArtists) {
        const parsedArtists: SpotifyArtist[] = JSON.parse(cachedArtists);
        const filtered = parsedArtists.filter((a) => a.id !== artistId);
        await AsyncStorage.setItem(ARTISTS_KEY, JSON.stringify(filtered));
        set({ artists: filtered });
        log(`Artist ${artistId} unfollowed successfully`);
      }
      return true;
    } catch (error) {
      logError("Error unfollowing artist:", error);
      return false;
    }
  },

  checkIfFollowing: async (artistId: string) => {
    try {
      const cachedArtists = await AsyncStorage.getItem(ARTISTS_KEY);
      if (cachedArtists) {
        const parsedArtists: SpotifyArtist[] = JSON.parse(cachedArtists);
        if (parsedArtists.some((a) => a.id === artistId)) {
          return true;
        }
      }
    } catch (error) {
      logError("Error checking cached artists:", error);
    }
    const data = await apiGet<boolean[]>(
      `https://api.spotify.com/v1/me/following/contains?type=artist&ids=${artistId}`
    );
    return data ? (data[0] ?? false) : false;
  },

  fetchArtistTopTracks: async (artistId: string) => {
    const data = await apiGet<{ tracks: SpotifyTrack[] }>(
      `https://api.spotify.com/v1/artists/${artistId}/top-tracks`
    );
    return data?.tracks ?? [];
  },

  fetchArtistAlbums: async (artistId: string) => {
    const data = await apiGet<SpotifyPaginatedResponse<SpotifyAlbumSimple>>(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=50`
    );
    if (data) {
      return { albums: data.items, nextUrl: data.next };
    }
    return { albums: [], nextUrl: null };
  },

  fetchMoreArtistAlbums: async (nextUrl: string | null) => {
    if (!nextUrl) {
      return { albums: null, nextUrl: null };
    }
    const data =
      await apiGet<SpotifyPaginatedResponse<SpotifyAlbumSimple>>(nextUrl);
    if (data) {
      return { albums: data.items, nextUrl: data.next };
    }
    return { albums: null, nextUrl: null };
  },

  setArtists: (artists) => set({ artists }),
  reset: () =>
    set({
      artists: null,
      nextUrl: null,
      isRefreshing: false,
      isLoadingMore: false,
    }),
}));
