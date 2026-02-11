import { create } from "zustand";
import type { SpotifyPlaylist } from "@/shared/types/spotify";
import { apiGet, apiPost } from "@/shared/utils/api-client";
import { logError } from "@/shared/utils/logger";
import { parsePlaylistsPage } from "@/shared/utils/normalize-playlist";
import { saveCachedData } from "../utils/cache";

interface PlaylistsState {
  playlists: SpotifyPlaylist[] | null;
  nextUrl: string | null;
  isRefreshing: boolean;
  isLoadingMore: boolean;
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
  isLoadingMore: false,

  fetch: async (options) => {
    const showRefreshing = options?.showRefreshing ?? true;
    if (showRefreshing) {
      set({ isRefreshing: true });
    }
    try {
      const raw = await apiGet<unknown>(
        "https://api.spotify.com/v1/me/playlists?limit=50"
      );
      const data = raw ? parsePlaylistsPage(raw) : null;
      if (data) {
        set({ playlists: data.items, nextUrl: data.next });
        await saveCachedData({ playlists: data.items });
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
    const raw = await apiGet<unknown>(nextUrl);
    const data = raw ? parsePlaylistsPage(raw) : null;
    if (data) {
      set((state) => ({
        playlists: [...(state.playlists || []), ...data.items],
        nextUrl: data.next,
      }));
    }
    set({ isLoadingMore: false });
  },

  addTrackToPlaylist: async (playlistId: string, trackUri: string) => {
    try {
      const result = await apiPost(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
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
      isLoadingMore: false,
    }),
}));
