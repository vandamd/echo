import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { ALBUMS_KEY } from "@/constants/spotify";
import type {
  SpotifyAlbum,
  SpotifyPaginatedResponse,
  SpotifySavedAlbum,
} from "@/shared/types/spotify";
import { apiDelete, apiGet, apiPut } from "@/shared/utils/api-client";
import { log, logError } from "@/shared/utils/logger";
import { saveCachedData } from "../utils/cache";

interface AlbumsState {
  albums: SpotifySavedAlbum[] | null;
  nextUrl: string | null;
  isRefreshing: boolean;
  isLoadingMore: boolean;
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
  isLoadingMore: false,

  fetch: async (options) => {
    const showRefreshing = options?.showRefreshing ?? true;
    if (showRefreshing) {
      set({ isRefreshing: true });
    }
    try {
      const data = await apiGet<SpotifyPaginatedResponse<SpotifySavedAlbum>>(
        "https://api.spotify.com/v1/me/albums?limit=50"
      );
      if (data) {
        set({ albums: data.items, nextUrl: data.next });
        await saveCachedData({ albums: data.items });
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
    const data =
      await apiGet<SpotifyPaginatedResponse<SpotifySavedAlbum>>(nextUrl);
    if (data) {
      set((state) => ({
        albums: [...(state.albums || []), ...data.items],
        nextUrl: data.next,
      }));
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
    const data = await apiGet<boolean[]>(
      `https://api.spotify.com/v1/me/albums/contains?ids=${albumId}`
    );
    return data ? (data[0] ?? false) : false;
  },

  setAlbums: (albums) => set({ albums }),
  reset: () =>
    set({
      albums: null,
      nextUrl: null,
      isRefreshing: false,
      isLoadingMore: false,
    }),
}));
