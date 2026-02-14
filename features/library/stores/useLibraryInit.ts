import { useEffect, useRef } from "react";
import { useAuth } from "@/features/auth";
import { useNetworkState } from "@/shared/hooks";
import { logInfo } from "@/shared/utils/logger";
import { loadCachedData } from "../utils/cache";
import { useAlbumsStore } from "./useAlbumsStore";
import { usePlaylistsStore } from "./usePlaylistsStore";
import { usePodcastsStore } from "./usePodcastsStore";
import { useSavedEpisodesStore } from "./useSavedEpisodesStore";
import { useSavedTracksStore } from "./useSavedTracksStore";

export const useLibraryInit = () => {
  const { accessToken, isLoading: authLoading } = useAuth();
  const { isOnline, isLoading: networkLoading } = useNetworkState();
  const initialFetchDone = useRef(false);

  useEffect(() => {
    if (!accessToken) {
      initialFetchDone.current = false;
    }
  }, [accessToken]);

  useEffect(() => {
    const load = async () => {
      const cached = await loadCachedData();
      usePlaylistsStore.getState().setPlaylists(cached.playlists);
      useAlbumsStore.getState().setAlbums(cached.albums);
      usePodcastsStore.getState().setPodcasts(cached.podcasts);
      useSavedTracksStore.getState().setSavedTracks(cached.savedTracks);
      useSavedEpisodesStore.getState().setSavedEpisodes(cached.savedEpisodes);
    };
    load();
  }, []);

  useEffect(() => {
    if (
      !accessToken ||
      authLoading ||
      initialFetchDone.current ||
      networkLoading
    ) {
      return;
    }

    if (!isOnline) {
      logInfo("LibraryInit: Offline, waiting for connectivity");
      return;
    }

    logInfo("LibraryInit: Starting initial data fetch");

    Promise.all([
      usePlaylistsStore.getState().fetch({ showRefreshing: false }),
      useAlbumsStore.getState().fetch({ showRefreshing: false }),
      usePodcastsStore.getState().fetch({ showRefreshing: false }),
      useSavedTracksStore.getState().fetch({ showRefreshing: false }),
    ]).then(() => {
      initialFetchDone.current = true;
      logInfo("LibraryInit: Initial data fetch completed");
    });
  }, [accessToken, authLoading, isOnline, networkLoading]);
};
