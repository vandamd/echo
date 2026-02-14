import { create } from "zustand";
import type {
  SpotifySavedEpisode,
  SpotifySavedEpisodesResponse,
} from "@/shared/types/spotify";
import { apiGetWithStatus } from "@/shared/utils/api-client";
import { saveCachedData } from "../utils/cache";

interface SavedEpisodesState {
  savedEpisodes: SpotifySavedEpisode[] | null;
  nextUrl: string | null;
  isRefreshing: boolean;
  isFetching: boolean;
  isLoadingMore: boolean;
  isRateLimited: boolean;
  rateLimitRetryAt: number | null;
  fetch: (options?: { showRefreshing?: boolean }) => Promise<void>;
  fetchMore: () => Promise<void>;
  setSavedEpisodes: (savedEpisodes: SpotifySavedEpisode[] | null) => void;
  reset: () => void;
}

export const useSavedEpisodesStore = create<SavedEpisodesState>()(
  (set, get) => ({
    savedEpisodes: null,
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
        const result = await apiGetWithStatus<SpotifySavedEpisodesResponse>(
          "https://api.spotify.com/v1/me/episodes?limit=50&market=from_token"
        );
        const data = result.data;
        if (data) {
          set({
            savedEpisodes: data.items,
            nextUrl: data.next,
            isRateLimited: false,
            rateLimitRetryAt: null,
          });
          await saveCachedData({ savedEpisodes: data.items });
        } else if (result.status === 429) {
          set({
            isRateLimited: true,
            rateLimitRetryAt:
              result.retryAfterMs !== null
                ? Date.now() + result.retryAfterMs
                : null,
          });
        } else if (get().savedEpisodes === null) {
          set({
            savedEpisodes: [],
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
        await apiGetWithStatus<SpotifySavedEpisodesResponse>(nextUrl);
      const data = result.data;
      if (data) {
        set((state) => ({
          savedEpisodes: [...(state.savedEpisodes || []), ...data.items],
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

    setSavedEpisodes: (savedEpisodes) => set({ savedEpisodes }),
    reset: () =>
      set({
        savedEpisodes: null,
        nextUrl: null,
        isRefreshing: false,
        isFetching: false,
        isLoadingMore: false,
        isRateLimited: false,
        rateLimitRetryAt: null,
      }),
  })
);
