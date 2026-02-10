import { useEffect, useRef } from "react";
import { useAuth } from "@/features/auth";
import { useNetworkState } from "@/shared/hooks";
import { logInfo } from "@/shared/utils/logger";
import { loadCachedData } from "../utils/cache";
import { useAlbumsStore } from "./useAlbumsStore";
import { useArtistsStore } from "./useArtistsStore";
import { usePlaylistsStore } from "./usePlaylistsStore";
import { usePodcastsStore } from "./usePodcastsStore";
import { useSavedEpisodesStore } from "./useSavedEpisodesStore";
import { useSavedTracksStore } from "./useSavedTracksStore";

export const useLibraryInit = () => {
  const { accessToken } = useAuth();
  const { isOnline, isLoading: networkLoading } = useNetworkState();
  const initialFetchDone = useRef(false);

  useEffect(() => {
    const load = async () => {
      const cached = await loadCachedData();
      usePlaylistsStore.getState().setPlaylists(cached.playlists);
      useAlbumsStore.getState().setAlbums(cached.albums);
      usePodcastsStore.getState().setPodcasts(cached.podcasts);
      useArtistsStore.getState().setArtists(cached.artists);
      useSavedTracksStore.getState().setSavedTracks(cached.savedTracks);
      useSavedEpisodesStore.getState().setSavedEpisodes(cached.savedEpisodes);
    };
    load();
  }, []);

  useEffect(() => {
    if (!accessToken || initialFetchDone.current || networkLoading) {
      return;
    }

    if (!isOnline) {
      logInfo("LibraryInit: Offline, using cached data");
      initialFetchDone.current = true;
      return;
    }

    initialFetchDone.current = true;
    logInfo("LibraryInit: Starting initial data fetch");

    Promise.all([
      usePlaylistsStore.getState().fetch({ showRefreshing: false }),
      useAlbumsStore.getState().fetch({ showRefreshing: false }),
      usePodcastsStore.getState().fetch({ showRefreshing: false }),
      useArtistsStore.getState().fetch({ showRefreshing: false }),
      useSavedTracksStore.getState().fetch({ showRefreshing: false }),
    ]).then(() => {
      logInfo("LibraryInit: Initial data fetch completed");
    });
  }, [accessToken, isOnline, networkLoading]);
};
