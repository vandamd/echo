import { create } from "zustand";
import type {
  SavedTrackObject,
  SpotifyPaginatedResponse,
} from "@/shared/types/spotify";
import { apiGetWithStatus } from "@/shared/utils/api-client";
import { saveCachedData } from "../utils/cache";

interface SavedTracksState {
  savedTracks: SavedTrackObject[] | null;
  nextUrl: string | null;
  isRefreshing: boolean;
  isFetching: boolean;
  isLoadingMore: boolean;
  isRateLimited: boolean;
  rateLimitRetryAt: number | null;
  fetch: (options?: { showRefreshing?: boolean }) => Promise<void>;
  fetchMore: () => Promise<void>;
  setSavedTracks: (savedTracks: SavedTrackObject[] | null) => void;
  reset: () => void;
}

export const useSavedTracksStore = create<SavedTracksState>()((set, get) => ({
  savedTracks: null,
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
        SpotifyPaginatedResponse<SavedTrackObject>
      >("https://api.spotify.com/v1/me/tracks?limit=50");
      const data = result.data;
      if (data) {
        set({
          savedTracks: data.items,
          nextUrl: data.next,
          isRateLimited: false,
          rateLimitRetryAt: null,
        });
        await saveCachedData({ tracks: data.items });
      } else if (result.status === 429) {
        set({
          isRateLimited: true,
          rateLimitRetryAt:
            result.retryAfterMs !== null
              ? Date.now() + result.retryAfterMs
              : null,
        });
      } else if (get().savedTracks === null) {
        set({
          savedTracks: [],
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
      await apiGetWithStatus<SpotifyPaginatedResponse<SavedTrackObject>>(
        nextUrl
      );
    const data = result.data;
    if (data) {
      set((state) => ({
        savedTracks: [...(state.savedTracks || []), ...data.items],
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

  setSavedTracks: (savedTracks) => set({ savedTracks }),
  reset: () =>
    set({
      savedTracks: null,
      nextUrl: null,
      isRefreshing: false,
      isFetching: false,
      isLoadingMore: false,
      isRateLimited: false,
      rateLimitRetryAt: null,
    }),
}));
