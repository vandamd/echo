import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/features/auth";
import {
  getCachedPlaylistDetail,
  saveCachedPlaylistDetail,
} from "@/features/library";
import { usePlayback } from "@/features/playback";
import { useSettings } from "@/features/settings";
import {
  DetailScreen,
  MediaListItem,
  TrackListItem,
} from "@/shared/components";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import type {
  SpotifyPlaylist,
  SpotifyPlaylistFull,
  SpotifyPlaylistTrack,
  SpotifyTrackSimple,
} from "@/shared/types/spotify";
import { formatDuration, getArtistNames, log, logError } from "@/shared/utils";
import { apiGet, apiGetWithStatus } from "@/shared/utils/api-client";
import {
  parsePlaylist,
  parsePlaylistItems,
  parsePlaylistItemsPage,
} from "@/shared/utils/normalize-playlist";

const hasLoadedPlaylistItems = (
  playlist: SpotifyPlaylist | SpotifyPlaylistFull | null
): playlist is SpotifyPlaylistFull => {
  const maybeItems = playlist?.items as unknown;
  if (!maybeItems || typeof maybeItems !== "object") {
    return false;
  }
  const candidate = maybeItems as {
    items?: unknown;
    limit?: unknown;
    offset?: unknown;
  };
  return (
    Array.isArray(candidate.items) &&
    typeof candidate.limit === "number" &&
    typeof candidate.offset === "number"
  );
};

const PLAYLIST_RATE_LIMIT_MESSAGE =
  "Spotify has reduced playlist limits. Please try again later.";

export default function PlaylistDetailScreen() {
  const { id, playlistString, playlistName } = useLocalSearchParams<{
    id: string;
    playlistString?: string;
    playlistName?: string;
  }>();
  const { user } = useAuth();
  const { skipToIndex } = usePlayback();
  const { showPlaylistTrackCovers } = useSettings();
  const router = useRouter();
  const { isOnline } = useNetworkState();

  const initialPlaylist = useMemo(() => {
    if (!playlistString) {
      return null;
    }
    try {
      return parsePlaylist(JSON.parse(playlistString));
    } catch {
      return null;
    }
  }, [playlistString]);

  const [fetchedPlaylist, setPlaylist] = useState<
    SpotifyPlaylist | SpotifyPlaylistFull | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [itemsUnavailableMessage, setItemsUnavailableMessage] = useState<
    string | null
  >(null);
  const [isLoadingMoreTracks, setIsLoadingMoreTracks] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(
    !hasLoadedPlaylistItems(initialPlaylist)
  );

  const playlist = fetchedPlaylist ?? initialPlaylist;
  const loadedPlaylist = hasLoadedPlaylistItems(playlist) ? playlist : null;
  const displayName = playlist?.name ?? playlistName ?? "Playlist";
  const displayImageUrl = playlist?.images?.[0]?.url;
  const canEditPlaylist = Boolean(
    id && user?.id && playlist?.owner?.id === user.id
  );

  const handleEditPress = useCallback(() => {
    if (id) {
      router.push({
        pathname: "/playlist/[id]/edit",
        params: {
          id,
          currentName: displayName,
        },
      });
    }
  }, [id, displayName, router]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: data fetching with cache fallback
  const fetchPlaylistDetails = useCallback(async () => {
    if (!id) {
      setError("Playlist ID is missing.");
      setIsInitialLoading(false);
      return;
    }

    const initialPlaylistWithItems = hasLoadedPlaylistItems(initialPlaylist)
      ? initialPlaylist
      : null;
    const hasInitialData = initialPlaylistWithItems !== null;
    let cachedPlaylistWithItems: SpotifyPlaylistFull | null =
      initialPlaylistWithItems;
    let hasDisplayedData = hasInitialData;

    try {
      setItemsUnavailableMessage(null);

      if (!hasInitialData) {
        try {
          const cachedPlaylist = await getCachedPlaylistDetail(id);
          if (hasLoadedPlaylistItems(cachedPlaylist)) {
            log("Playlist details: Displaying cached data");
            cachedPlaylistWithItems = cachedPlaylist;
            hasDisplayedData = true;
            setPlaylist(cachedPlaylist);
          }
        } catch (cacheError) {
          logError("Error retrieving cached playlist:", cacheError);
        }
      }

      if (!isOnline) {
        setPlaylist((current) => {
          if (!(hasInitialData || current)) {
            setError(
              "No cached data available. Connect to the internet to load this playlist."
            );
          }
          return current;
        });
        return;
      }

      try {
        const playlistResult = await apiGetWithStatus<unknown>(
          `https://api.spotify.com/v1/playlists/${id}`
        );
        if (playlistResult.status === 429) {
          if (!hasDisplayedData) {
            setError(PLAYLIST_RATE_LIMIT_MESSAGE);
          }
          return;
        }

        const data = playlistResult.data
          ? parsePlaylist(playlistResult.data)
          : null;
        if (data) {
          let playlistData: SpotifyPlaylist | SpotifyPlaylistFull = data;
          let itemsUnavailable = false;
          let itemsRateLimited = false;
          let itemsFetchFailed = false;

          if (!hasLoadedPlaylistItems(playlistData)) {
            const itemsResult = await apiGetWithStatus<unknown>(
              `https://api.spotify.com/v1/playlists/${id}/items?limit=50`
            );

            if (itemsResult.data) {
              const playlistItems = parsePlaylistItems(itemsResult.data);
              if (playlistItems) {
                playlistData = { ...playlistData, items: playlistItems };
              } else {
                itemsFetchFailed = true;
              }
            } else if (itemsResult.status === 429) {
              itemsRateLimited = true;
            } else if (itemsResult.status === 403) {
              itemsUnavailable = true;
            } else {
              itemsFetchFailed = true;
            }

            if (
              !hasLoadedPlaylistItems(playlistData) &&
              cachedPlaylistWithItems
            ) {
              playlistData = {
                ...playlistData,
                items: cachedPlaylistWithItems.items,
              };
            } else if (
              !hasLoadedPlaylistItems(playlistData) &&
              itemsUnavailable
            ) {
              setItemsUnavailableMessage(
                "Spotify now only provides access to playlists you own or collaborate on."
              );
            }
          }

          if (itemsRateLimited && !hasLoadedPlaylistItems(playlistData)) {
            setError(PLAYLIST_RATE_LIMIT_MESSAGE);
            setItemsUnavailableMessage(null);
          } else if (
            itemsFetchFailed &&
            !hasLoadedPlaylistItems(playlistData)
          ) {
            setError("Failed to load playlist tracks.");
            setItemsUnavailableMessage(null);
          } else {
            setError(null);
          }

          log("Playlist details: Fetched fresh data from API");
          setPlaylist(playlistData);
          if (hasLoadedPlaylistItems(playlistData)) {
            await saveCachedPlaylistDetail(playlistData);
          }
        } else if (!hasDisplayedData) {
          throw new Error("Failed to fetch playlist details");
        }
      } catch (e: unknown) {
        const errorMessage =
          e instanceof Error ? e.message : "An unexpected error occurred.";
        logError("Error fetching playlist details:", e);
        if (!hasDisplayedData) {
          setError(errorMessage);
        }
      }
    } finally {
      setIsInitialLoading(false);
    }
  }, [id, initialPlaylist, isOnline]);

  useFocusEffect(
    useCallback(() => {
      fetchPlaylistDetails();
    }, [fetchPlaylistDetails])
  );

  const loadMoreTracks = useCallback(async () => {
    if (!loadedPlaylist?.items.next || isLoadingMoreTracks) {
      return;
    }
    setIsLoadingMoreTracks(true);
    try {
      const raw = await apiGet<unknown>(loadedPlaylist.items.next);
      if (raw) {
        const data = parsePlaylistItemsPage(raw);
        if (!data) {
          return;
        }
        setPlaylist((prevPlaylist) => {
          if (!hasLoadedPlaylistItems(prevPlaylist)) {
            return prevPlaylist;
          }
          const updatedPlaylist = {
            ...prevPlaylist,
            items: {
              ...prevPlaylist.items,
              items: [...prevPlaylist.items.items, ...data.items],
              next: data.next,
            },
          };
          saveCachedPlaylistDetail(updatedPlaylist);
          return updatedPlaylist;
        });
      }
    } catch (e: unknown) {
      logError("Error fetching more playlist tracks:", e);
    } finally {
      setIsLoadingMoreTracks(false);
    }
  }, [loadedPlaylist, isLoadingMoreTracks]);

  const handleTrackPress = usePreventDoubleTap(async (trackIndex: number) => {
    const playlistTrack = loadedPlaylist?.items.items[trackIndex];
    const track = playlistTrack?.item;
    const artistName =
      track?.artists
        ?.map((a: SpotifyTrackSimple["artists"][0]) => a.name)
        .join(", ") ?? "";
    const albumArtUrl =
      track?.album?.images?.[0]?.url ?? playlist?.images?.[0]?.url ?? "";

    try {
      await skipToIndex({
        type: "playlist",
        uri: `spotify:playlist:${id}`,
        currentIndex: trackIndex,
      });
      router.push({
        pathname: "/playing",
        params: {
          trackName: track?.name ?? "",
          artistName,
          albumArtUrl,
          durationMs: track?.duration_ms?.toString() ?? "0",
        },
      });
    } catch (playError) {
      logError("Error playing track:", playError);
      router.push({
        pathname: "/playing",
        params: {
          trackName: track?.name ?? "",
          artistName,
          albumArtUrl,
          durationMs: track?.duration_ms?.toString() ?? "0",
        },
      });
    }
  });

  const renderTrackItem = ({
    item,
    index,
  }: {
    item: SpotifyPlaylistTrack;
    index: number;
  }) => {
    const track = item.item;
    if (!track) {
      return null;
    }

    if (showPlaylistTrackCovers) {
      const artistNames = getArtistNames(track.artists);
      const secondaryText = track.duration_ms
        ? `${artistNames} · ${formatDuration(track.duration_ms)}`
        : artistNames;

      return (
        <MediaListItem
          forceShowImage
          imageUri={track.album?.images?.[0]?.url}
          onPress={() => handleTrackPress(index)}
          placeholderIcon="music-note"
          primaryText={track.name}
          secondaryText={secondaryText}
        />
      );
    }

    return (
      <TrackListItem
        artists={track.artists}
        durationMs={track.duration_ms}
        imageUri={track.album?.images?.[0]?.url}
        name={track.name}
        onPress={() => handleTrackPress(index)}
        trackNumber={(loadedPlaylist?.items.offset || 0) + index + 1}
      />
    );
  };

  return (
    <DetailScreen
      data={loadedPlaylist?.items.items || []}
      emptyMessage={
        itemsUnavailableMessage ?? "No tracks found in this playlist."
      }
      error={error}
      headerIcon={canEditPlaylist ? "edit" : undefined}
      headerIconPress={handleEditPress}
      headerIconShowLength={canEditPlaylist ? 1 : 0}
      imageUrl={displayImageUrl}
      isInitialLoading={isInitialLoading}
      isLoadingMore={isLoadingMoreTracks}
      keyExtractor={(item, index) =>
        `${item.item?.id || "unknown-track"}-${index}`
      }
      onLoadMore={loadMoreTracks}
      placeholderIcon="music-note"
      renderItem={renderTrackItem}
      title={displayName}
    />
  );
}
