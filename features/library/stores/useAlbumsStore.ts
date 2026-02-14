import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { ALBUMS_KEY } from "@/constants/spotify";
import type {
  SpotifyAlbum,
  SpotifyPaginatedResponse,
  SpotifySavedAlbum,
} from "@/shared/types/spotify";
import {
  apiDelete,
  apiGet,
  apiGetWithStatus,
  apiPut,
} from "@/shared/utils/api-client";
import { log, logError } from "@/shared/utils/logger";
import { saveCachedData } from "../utils/cache";

interface AlbumsState {
  albums: SpotifySavedAlbum[] | null;
  nextUrl: string | null;
  isRefreshing: boolean;
  isFetching: boolean;
  isLoadingMore: boolean;
  isRateLimited: boolean;
  rateLimitRetryAt: number | null;
  fetch: (options?: { showRefreshing?: boolean }) => Promise<void>;
  fetchMore: () => Promise<void>;
  saveAlbum: (albumId: string) => Promise<boolean>;
  removeAlbum: (albumId: string) => Promise<boolean>;
  checkIfSaved: (albumId: string) => Promise<boolean>;
  setAlbums: (albums: SpotifySavedAlbum[] | null) => void;
  reset: () => void;
}

export const useAlbumsStore = create<AlbumsState>()((set, get) => ({
  albums: null,
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
      const result = await apiGetWithStatus<
        SpotifyPaginatedResponse<SpotifySavedAlbum>
      >("https://api.spotify.com/v1/me/albums?limit=50");
      const data = result.data;
      if (data) {
        set({
          albums: data.items,
          nextUrl: data.next,
          isRateLimited: false,
          rateLimitRetryAt: null,
        });
        await saveCachedData({ albums: data.items });
      } else if (result.status === 429) {
        set({
          isRateLimited: true,
          rateLimitRetryAt:
            result.retryAfterMs !== null
              ? Date.now() + result.retryAfterMs
              : null,
        });
      } else if (get().albums === null) {
        set({
          albums: [],
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
      await apiGetWithStatus<SpotifyPaginatedResponse<SpotifySavedAlbum>>(
        nextUrl
      );
    const data = result.data;
    if (data) {
      set((state) => ({
        albums: [...(state.albums || []), ...data.items],
        nextUrl: data.next,
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

  saveAlbum: async (albumId: string) => {
    try {
      const uri = encodeURIComponent(`spotify:album:${albumId}`);
      const saved = await apiPut(
        `https://api.spotify.com/v1/me/library?uris=${uri}`
      );
      if (!saved) {
        return false;
      }
      const albumData = await apiGet<SpotifyAlbum>(
        `https://api.spotify.com/v1/albums/${albumId}`
      );
      if (albumData) {
        const cachedAlbums = await AsyncStorage.getItem(ALBUMS_KEY);
        const parsedAlbums: SpotifySavedAlbum[] = cachedAlbums
          ? JSON.parse(cachedAlbums)
          : [];
        const newSavedAlbum: SpotifySavedAlbum = {
          added_at: new Date().toISOString(),
          album: albumData,
        };
        parsedAlbums.unshift(newSavedAlbum);
        await AsyncStorage.setItem(ALBUMS_KEY, JSON.stringify(parsedAlbums));
        set({ albums: parsedAlbums });
        log(`Album ${albumId} saved successfully`);
      }
      return true;
    } catch (error) {
      logError("Error saving album:", error);
      return false;
    }
  },

  removeAlbum: async (albumId: string) => {
    try {
      const uri = encodeURIComponent(`spotify:album:${albumId}`);
      const removed = await apiDelete(
        `https://api.spotify.com/v1/me/library?uris=${uri}`
      );
      if (!removed) {
        return false;
      }
      const cachedAlbums = await AsyncStorage.getItem(ALBUMS_KEY);
      if (cachedAlbums) {
        const parsedAlbums: SpotifySavedAlbum[] = JSON.parse(cachedAlbums);
        const filtered = parsedAlbums.filter((sa) => sa.album?.id !== albumId);
        await AsyncStorage.setItem(ALBUMS_KEY, JSON.stringify(filtered));
        set({ albums: filtered });
        log(`Album ${albumId} removed successfully`);
      }
      return true;
    } catch (error) {
      logError("Error removing album:", error);
      return false;
    }
  },

  checkIfSaved: async (albumId: string) => {
    try {
      const cachedAlbums = await AsyncStorage.getItem(ALBUMS_KEY);
      if (cachedAlbums) {
        const parsedAlbums: SpotifySavedAlbum[] = JSON.parse(cachedAlbums);
        if (parsedAlbums.some((sa) => sa.album?.id === albumId)) {
          return true;
        }
      }
    } catch (error) {
      logError("Error checking cached albums:", error);
    }
    const uri = encodeURIComponent(`spotify:album:${albumId}`);
    const data = await apiGet<boolean[]>(
      `https://api.spotify.com/v1/me/library/contains?uris=${uri}`
    );
    return data ? (data[0] ?? false) : false;
  },

  setAlbums: (albums) => set({ albums }),
  reset: () =>
    set({
      albums: null,
      nextUrl: null,
      isRefreshing: false,
      isFetching: false,
      isLoadingMore: false,
      isRateLimited: false,
      rateLimitRetryAt: null,
    }),
}));
