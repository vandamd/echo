import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { ARTISTS_KEY } from "@/constants/spotify";
import type {
  SpotifyAlbumSimple,
  SpotifyArtist,
  SpotifyFollowedArtistsResponse,
  SpotifyPaginatedResponse,
} from "@/shared/types/spotify";
import {
  apiDelete,
  apiGet,
  apiGetWithStatus,
  apiPut,
} from "@/shared/utils/api-client";
import { log, logError } from "@/shared/utils/logger";
import { saveCachedData } from "../utils/cache";

interface ArtistsState {
  artists: SpotifyArtist[] | null;
  nextUrl: string | null;
  isRefreshing: boolean;
  isFetching: boolean;
  isLoadingMore: boolean;
  isRateLimited: boolean;
  rateLimitRetryAt: number | null;
  fetch: (options?: { showRefreshing?: boolean }) => Promise<void>;
  fetchMore: () => Promise<void>;
  followArtist: (artistId: string) => Promise<boolean>;
  unfollowArtist: (artistId: string) => Promise<boolean>;
  checkIfFollowing: (artistId: string) => Promise<boolean>;
  fetchArtistAlbums: (artistId: string) => Promise<{
    albums: SpotifyAlbumSimple[] | null;
    nextUrl: string | null;
    isRateLimited: boolean;
  }>;
  fetchMoreArtistAlbums: (nextUrl: string | null) => Promise<{
    albums: SpotifyAlbumSimple[] | null;
    nextUrl: string | null;
    isRateLimited: boolean;
  }>;
  setArtists: (artists: SpotifyArtist[] | null) => void;
  reset: () => void;
}

export const useArtistsStore = create<ArtistsState>()((set, get) => ({
  artists: null,
  nextUrl: null,
  isRefreshing: false,
  isFetching: false,
  isLoadingMore: false,
  isRateLimited: false,
  rateLimitRetryAt: null,

  fetch: async (options) => {
    const showRefreshing = options?.showRefreshing ?? true;
    if (showRefreshing) {
      set({ isRefreshing: true, isFetching: true });
    } else {
      set({ isFetching: true });
    }
    try {
      const result = await apiGetWithStatus<SpotifyFollowedArtistsResponse>(
        "https://api.spotify.com/v1/me/following?type=artist&limit=50"
      );
      const data = result.data;
      if (data) {
        set({
          artists: data.artists.items,
          nextUrl: data.artists.next,
          isRateLimited: false,
          rateLimitRetryAt: null,
        });
        await saveCachedData({ artists: data.artists.items });
      } else if (result.status === 429) {
        set({
          isRateLimited: true,
          rateLimitRetryAt:
            result.retryAfterMs !== null
              ? Date.now() + result.retryAfterMs
              : null,
        });
      } else if (get().artists === null) {
        set({
          artists: [],
          nextUrl: null,
          isRateLimited: false,
          rateLimitRetryAt: null,
        });
      }
    } finally {
      if (showRefreshing) {
        set({ isRefreshing: false, isFetching: false });
      } else {
        set({ isFetching: false });
      }
    }
  },

  fetchMore: async () => {
    const { nextUrl, isLoadingMore } = get();
    if (!nextUrl || isLoadingMore) {
      return;
    }
    set({ isLoadingMore: true });
    const result =
      await apiGetWithStatus<SpotifyFollowedArtistsResponse>(nextUrl);
    const data = result.data;
    if (data) {
      set((state) => ({
        artists: [...(state.artists || []), ...data.artists.items],
        nextUrl: data.artists.next,
        isRateLimited: false,
        rateLimitRetryAt: null,
      }));
    } else if (result.status === 429) {
      set({
        isRateLimited: true,
        rateLimitRetryAt:
          result.retryAfterMs !== null
            ? Date.now() + result.retryAfterMs
            : null,
      });
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
    const uri = encodeURIComponent(`spotify:artist:${artistId}`);
    const data = await apiGet<boolean[]>(
      `https://api.spotify.com/v1/me/library/contains?uris=${uri}`
    );
    return data ? (data[0] ?? false) : false;
  },

  fetchArtistAlbums: async (artistId: string) => {
    const result = await apiGetWithStatus<
      SpotifyPaginatedResponse<SpotifyAlbumSimple>
    >(`https://api.spotify.com/v1/artists/${artistId}/albums?limit=10`);
    if (result.data) {
      return {
        albums: result.data.items,
        nextUrl: result.data.next,
        isRateLimited: false,
      };
    }
    if (result.status === 429) {
      return { albums: null, nextUrl: null, isRateLimited: true };
    }
    return { albums: [], nextUrl: null, isRateLimited: false };
  },

  fetchMoreArtistAlbums: async (nextUrl: string | null) => {
    if (!nextUrl) {
      return { albums: null, nextUrl: null, isRateLimited: false };
    }
    const result =
      await apiGetWithStatus<SpotifyPaginatedResponse<SpotifyAlbumSimple>>(
        nextUrl
      );
    if (result.data) {
      return {
        albums: result.data.items,
        nextUrl: result.data.next,
        isRateLimited: false,
      };
    }
    if (result.status === 429) {
      return { albums: null, nextUrl, isRateLimited: true };
    }
    return { albums: null, nextUrl: null, isRateLimited: false };
  },

  setArtists: (artists) => set({ artists }),
  reset: () =>
    set({
      artists: null,
      nextUrl: null,
      isRefreshing: false,
      isFetching: false,
      isLoadingMore: false,
      isRateLimited: false,
      rateLimitRetryAt: null,
    }),
}));
