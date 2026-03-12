import { create } from "zustand";
import type {
  SavedTrackObject,
  SpotifyPaginatedResponse,
} from "@/shared/types/spotify";
import { apiGetWithStatus } from "@/shared/utils/api-client";
import {
  appendSavedTracksPage,
  loadSavedTracksCache,
  replaceSavedTracksFirstPage,
} from "../utils/cache";

interface SavedTracksState {
  savedTracks: SavedTrackObject[] | null;
  nextUrl: string | null;
  cachedPageCount: number;
  visiblePageCount: number;
  hasMoreCachedPages: boolean;
  isRefreshing: boolean;
  isFetching: boolean;
  isLoadingMore: boolean;
  isRateLimited: boolean;
  rateLimitRetryAt: number | null;
  fetch: (options?: { showRefreshing?: boolean }) => Promise<void>;
  fetchMore: (options: { isOnline: boolean }) => Promise<void>;
  hydrateSavedTracks: (options: {
    savedTracks: SavedTrackObject[] | null;
    nextUrl: string | null;
    pageCount: number;
  }) => void;
  reset: () => void;
}

type SavedTracksPaginationState = Pick<
  SavedTracksState,
  | "savedTracks"
  | "nextUrl"
  | "cachedPageCount"
  | "visiblePageCount"
  | "hasMoreCachedPages"
  | "isRateLimited"
  | "rateLimitRetryAt"
>;

const getHasMoreCachedPages = (
  visiblePageCount: number,
  cachedPageCount: number
): boolean => visiblePageCount < cachedPageCount;

const createSavedTracksPaginationState = (
  savedTracks: SavedTrackObject[] | null,
  nextUrl: string | null,
  pageCount: number,
  visiblePageCount: number
): SavedTracksPaginationState => ({
  savedTracks,
  nextUrl,
  cachedPageCount: pageCount,
  visiblePageCount,
  hasMoreCachedPages: getHasMoreCachedPages(visiblePageCount, pageCount),
  isRateLimited: false,
  rateLimitRetryAt: null,
});

const loadCachedSavedTracksMore = async (
  visiblePageCount: number
): Promise<SavedTracksPaginationState> => {
  const cachedSavedTracks = await loadSavedTracksCache({
    visiblePageCount: visiblePageCount + 1,
  });
  const nextVisiblePageCount = Math.min(
    visiblePageCount + 1,
    cachedSavedTracks.pageCount
  );

  return createSavedTracksPaginationState(
    cachedSavedTracks.savedTracks ?? [],
    cachedSavedTracks.nextUrl,
    cachedSavedTracks.pageCount,
    nextVisiblePageCount
  );
};

const loadRemoteSavedTracksMore = async (
  nextUrl: string,
  visiblePageCount: number
): Promise<
  | { kind: "success"; state: SavedTracksPaginationState }
  | { kind: "rate_limited"; retryAt: number | null }
  | null
> => {
  const result =
    await apiGetWithStatus<SpotifyPaginatedResponse<SavedTrackObject>>(nextUrl);
  const data = result.data;

  if (!data) {
    if (result.status === 429) {
      return {
        kind: "rate_limited",
        retryAt:
          result.retryAfterMs !== null
            ? Date.now() + result.retryAfterMs
            : null,
      };
    }

    return null;
  }

  const nextVisiblePageCount = visiblePageCount + 1;
  const cachedSavedTracks = await appendSavedTracksPage(
    data.items,
    data.next,
    nextVisiblePageCount
  );

  return {
    kind: "success",
    state: createSavedTracksPaginationState(
      cachedSavedTracks.savedTracks ?? [],
      cachedSavedTracks.nextUrl,
      cachedSavedTracks.pageCount,
      Math.min(nextVisiblePageCount, cachedSavedTracks.pageCount)
    ),
  };
};

export const useSavedTracksStore = create<SavedTracksState>()((set, get) => ({
  savedTracks: null,
  nextUrl: null,
  cachedPageCount: 0,
  visiblePageCount: 0,
  hasMoreCachedPages: false,
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
        const cachedSavedTracks = await replaceSavedTracksFirstPage(
          data.items,
          data.next,
          1
        );
        set(
          createSavedTracksPaginationState(
            cachedSavedTracks.savedTracks ?? [],
            cachedSavedTracks.nextUrl,
            cachedSavedTracks.pageCount,
            cachedSavedTracks.pageCount > 0 ? 1 : 0
          )
        );
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
          cachedPageCount: 0,
          visiblePageCount: 0,
          hasMoreCachedPages: false,
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

  fetchMore: async ({ isOnline }) => {
    const {
      nextUrl,
      isLoadingMore,
      isFetching,
      visiblePageCount,
      cachedPageCount,
    } = get();
    if (isLoadingMore || isFetching) {
      return;
    }

    if (!isOnline) {
      if (visiblePageCount >= cachedPageCount) {
        return;
      }

      set({ isLoadingMore: true });
      try {
        set(await loadCachedSavedTracksMore(visiblePageCount));
      } finally {
        set({ isLoadingMore: false });
      }
      return;
    }

    if (!nextUrl) {
      return;
    }

    set({ isLoadingMore: true });
    try {
      const nextState = await loadRemoteSavedTracksMore(
        nextUrl,
        visiblePageCount
      );
      if (nextState?.kind === "success") {
        set(nextState.state);
      } else if (nextState?.kind === "rate_limited") {
        set({
          isRateLimited: true,
          rateLimitRetryAt: nextState.retryAt,
        });
      }
    } finally {
      set({ isLoadingMore: false });
    }
  },

  hydrateSavedTracks: ({ savedTracks, nextUrl, pageCount }) =>
    set({
      savedTracks,
      nextUrl,
      cachedPageCount: pageCount,
      visiblePageCount: pageCount > 0 ? 1 : 0,
      hasMoreCachedPages: pageCount > 1,
    }),
  reset: () =>
    set({
      savedTracks: null,
      nextUrl: null,
      cachedPageCount: 0,
      visiblePageCount: 0,
      hasMoreCachedPages: false,
      isRefreshing: false,
      isFetching: false,
      isLoadingMore: false,
      isRateLimited: false,
      rateLimitRetryAt: null,
    }),
}));
