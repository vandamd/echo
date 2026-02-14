import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { PODCASTS_KEY } from "@/constants/spotify";
import type {
  SpotifySavedShow,
  SpotifySavedShowsResponse,
  SpotifyShow,
} from "@/shared/types/spotify";
import {
  apiDelete,
  apiGet,
  apiGetWithStatus,
  apiPut,
} from "@/shared/utils/api-client";
import { log, logError } from "@/shared/utils/logger";
import { saveCachedData, saveCachedShowDetail } from "../utils/cache";

interface PodcastsState {
  podcasts: SpotifySavedShow[] | null;
  nextUrl: string | null;
  isRefreshing: boolean;
  isFetching: boolean;
  isLoadingMore: boolean;
  isRateLimited: boolean;
  rateLimitRetryAt: number | null;
  fetch: (options?: { showRefreshing?: boolean }) => Promise<void>;
  fetchMore: () => Promise<void>;
  followPodcast: (showId: string) => Promise<boolean>;
  unfollowPodcast: (showId: string) => Promise<boolean>;
  checkIfFollowing: (showId: string) => Promise<boolean>;
  setPodcasts: (podcasts: SpotifySavedShow[] | null) => void;
  reset: () => void;
}

export const usePodcastsStore = create<PodcastsState>()((set, get) => ({
  podcasts: null,
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
      const result = await apiGetWithStatus<SpotifySavedShowsResponse>(
        "https://api.spotify.com/v1/me/shows?limit=50"
      );
      const data = result.data;
      if (data) {
        set({
          podcasts: data.items,
          nextUrl: data.next,
          isRateLimited: false,
          rateLimitRetryAt: null,
        });
        await saveCachedData({ podcasts: data.items });
      } else if (result.status === 429) {
        set({
          isRateLimited: true,
          rateLimitRetryAt:
            result.retryAfterMs !== null
              ? Date.now() + result.retryAfterMs
              : null,
        });
      } else if (get().podcasts === null) {
        set({
          podcasts: [],
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
    const result = await apiGetWithStatus<SpotifySavedShowsResponse>(nextUrl);
    const data = result.data;
    if (data) {
      set((state) => ({
        podcasts: [...(state.podcasts || []), ...data.items],
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

  followPodcast: async (showId: string) => {
    try {
      const uri = encodeURIComponent(`spotify:show:${showId}`);
      const followed = await apiPut(
        `https://api.spotify.com/v1/me/library?uris=${uri}`
      );
      if (!followed) {
        return false;
      }
      const showData = await apiGet<SpotifyShow>(
        `https://api.spotify.com/v1/shows/${showId}`
      );
      if (showData) {
        await saveCachedShowDetail(showData);
        const cachedShows = await AsyncStorage.getItem(PODCASTS_KEY);
        const parsedShows: SpotifySavedShow[] = cachedShows
          ? JSON.parse(cachedShows)
          : [];
        if (!parsedShows.some((item) => item.show.id === showId)) {
          const newSavedShow: SpotifySavedShow = {
            added_at: new Date().toISOString(),
            show: showData,
          };
          parsedShows.unshift(newSavedShow);
          await AsyncStorage.setItem(PODCASTS_KEY, JSON.stringify(parsedShows));
          set({ podcasts: parsedShows });
        }
        log(`Show ${showId} followed successfully`);
      }
      return true;
    } catch (error) {
      logError("Error following podcast:", error);
      return false;
    }
  },

  unfollowPodcast: async (showId: string) => {
    try {
      const uri = encodeURIComponent(`spotify:show:${showId}`);
      const unfollowed = await apiDelete(
        `https://api.spotify.com/v1/me/library?uris=${uri}`
      );
      if (!unfollowed) {
        return false;
      }
      const cachedShows = await AsyncStorage.getItem(PODCASTS_KEY);
      if (cachedShows) {
        const parsedShows: SpotifySavedShow[] = JSON.parse(cachedShows);
        const filtered = parsedShows.filter((item) => item.show.id !== showId);
        await AsyncStorage.setItem(PODCASTS_KEY, JSON.stringify(filtered));
        set({ podcasts: filtered });
        log(`Show ${showId} unfollowed successfully`);
      }
      return true;
    } catch (error) {
      logError("Error unfollowing podcast:", error);
      return false;
    }
  },

  checkIfFollowing: async (showId: string) => {
    try {
      const cachedShows = await AsyncStorage.getItem(PODCASTS_KEY);
      if (cachedShows) {
        const parsedShows: SpotifySavedShow[] = JSON.parse(cachedShows);
        if (parsedShows.some((item) => item.show.id === showId)) {
          return true;
        }
      }
    } catch (error) {
      logError("Error checking cached podcasts:", error);
    }
    const uri = encodeURIComponent(`spotify:show:${showId}`);
    const data = await apiGet<boolean[]>(
      `https://api.spotify.com/v1/me/library/contains?uris=${uri}`
    );
    return data ? (data[0] ?? false) : false;
  },

  setPodcasts: (podcasts) => set({ podcasts }),
  reset: () =>
    set({
      podcasts: null,
      nextUrl: null,
      isRefreshing: false,
      isFetching: false,
      isLoadingMore: false,
      isRateLimited: false,
      rateLimitRetryAt: null,
    }),
}));
