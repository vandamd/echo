import { create } from "zustand";
import type { SpotifyPlaylist } from "@/shared/types/spotify";
import { apiGetWithStatus, apiPost } from "@/shared/utils/api-client";
import { logError } from "@/shared/utils/logger";
import { parsePlaylistsPage } from "@/shared/utils/normalize-playlist";
import { saveCachedData } from "../utils/cache";

interface PlaylistsState {
  playlists: SpotifyPlaylist[] | null;
  nextUrl: string | null;
  isRefreshing: boolean;
  isFetching: boolean;
  isLoadingMore: boolean;
  isRateLimited: boolean;
  rateLimitRetryAt: number | null;
  fetch: (options?: { showRefreshing?: boolean }) => Promise<void>;
  fetchMore: () => Promise<void>;
  addTrackToPlaylist: (
    playlistId: string,
    trackUri: string
  ) => Promise<boolean>;
  setPlaylists: (playlists: SpotifyPlaylist[] | null) => void;
  reset: () => void;
}

export const usePlaylistsStore = create<PlaylistsState>()((set, get) => ({
  playlists: null,
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
      const result = await apiGetWithStatus<unknown>(
        "https://api.spotify.com/v1/me/playlists?limit=50"
      );
      const data = result.data ? parsePlaylistsPage(result.data) : null;
      if (data) {
        set({
          playlists: data.items,
          nextUrl: data.next,
          isRateLimited: false,
          rateLimitRetryAt: null,
        });
        await saveCachedData({ playlists: data.items });
      } else if (result.status === 429) {
        set({
          isRateLimited: true,
          rateLimitRetryAt:
            result.retryAfterMs !== null
              ? Date.now() + result.retryAfterMs
              : null,
        });
      } else if (get().playlists === null) {
        set({
          playlists: [],
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
    const result = await apiGetWithStatus<unknown>(nextUrl);
    const data = result.data ? parsePlaylistsPage(result.data) : null;
    if (data) {
      set((state) => ({
        playlists: [...(state.playlists || []), ...data.items],
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

  addTrackToPlaylist: async (playlistId: string, trackUri: string) => {
    try {
      const result = await apiPost(
        `https://api.spotify.com/v1/playlists/${playlistId}/items`,
        { uris: [trackUri] }
      );
      return result !== null;
    } catch (error) {
      logError("Error adding track to playlist:", error);
      return false;
    }
  },

  setPlaylists: (playlists) => set({ playlists }),
  reset: () =>
    set({
      playlists: null,
      nextUrl: null,
      isRefreshing: false,
      isFetching: false,
      isLoadingMore: false,
      isRateLimited: false,
      rateLimitRetryAt: null,
    }),
}));
