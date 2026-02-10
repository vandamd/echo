import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  getCachedPlaylistDetail,
  saveCachedPlaylistDetail,
} from "@/features/library";
import { usePlayback } from "@/features/playback";
import { DetailScreen, TrackListItem } from "@/shared/components";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import type {
  SpotifyPlaylistFull,
  SpotifyPlaylistTrack,
  SpotifyTrackSimple,
} from "@/shared/types/spotify";
import { log, logError } from "@/shared/utils";
import { apiGet } from "@/shared/utils/api-client";
import {
  normalizePlaylist,
  normalizePlaylistItemsPage,
} from "@/shared/utils/normalize-playlist";

export default function PlaylistDetailScreen() {
  const { id, playlistString, playlistName } = useLocalSearchParams<{
    id: string;
    playlistString?: string;
    playlistName?: string;
  }>();
  const { skipToIndex } = usePlayback();
  const router = useRouter();
  const { isOnline } = useNetworkState();

  const initialPlaylist = useMemo(() => {
    if (!playlistString) {
      return null;
    }
    try {
      return normalizePlaylist(
        JSON.parse(playlistString) as Record<string, unknown>
      );
    } catch {
      return null;
    }
  }, [playlistString]);

  const [fetchedPlaylist, setPlaylist] = useState<SpotifyPlaylistFull | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMoreTracks, setIsLoadingMoreTracks] = useState(false);

  const playlist = fetchedPlaylist ?? initialPlaylist;
  const displayName = playlist?.name ?? playlistName ?? "Playlist";
  const displayImageUrl = playlist?.images?.[0]?.url;

  const handleTitlePress = useCallback(() => {
    if (id) {
      router.push({
        pathname: "/rename-playlist",
        params: {
          playlistId: id,
          currentName: displayName,
        },
      });
    }
  }, [id, displayName, router]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: data fetching with cache fallback
  const fetchPlaylistDetails = useCallback(async () => {
    if (!id) {
      setError("Playlist ID is missing.");
      return;
    }

    const hasInitialData = !!(initialPlaylist as SpotifyPlaylistFull)?.items
      ?.items;

    if (!hasInitialData) {
      try {
        const cachedPlaylist = await getCachedPlaylistDetail(id);
        if (cachedPlaylist?.items?.items) {
          log("Playlist details: Displaying cached data");
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
      const raw = await apiGet<Record<string, unknown>>(
        `https://api.spotify.com/v1/playlists/${id}`
      );
      const data = raw ? normalizePlaylist(raw) : null;
      if (data) {
        log("Playlist details: Fetched fresh data from API");
        setPlaylist(data);
        await saveCachedPlaylistDetail(data);
      } else if (!hasInitialData) {
        throw new Error("Failed to fetch playlist details");
      }
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : "An unexpected error occurred.";
      logError("Error fetching playlist details:", e);
      if (!hasInitialData) {
        setError(errorMessage);
      }
    }
  }, [id, initialPlaylist, isOnline]);

  useFocusEffect(
    useCallback(() => {
      fetchPlaylistDetails();
    }, [fetchPlaylistDetails])
  );

  const loadMoreTracks = useCallback(async () => {
    if (!playlist?.items?.next || isLoadingMoreTracks) {
      return;
    }
    setIsLoadingMoreTracks(true);
    try {
      const raw = await apiGet<Record<string, unknown>>(playlist.items.next);
      if (raw) {
        const data = normalizePlaylistItemsPage(raw);
        setPlaylist((prevPlaylist) => {
          if (!prevPlaylist?.items) {
            return prevPlaylist;
          }
          return {
            ...prevPlaylist,
            items: {
              ...prevPlaylist.items,
              items: [...prevPlaylist.items.items, ...data.items],
              next: data.next,
            },
          };
        });
      }
    } catch (e: unknown) {
      logError("Error fetching more playlist tracks:", e);
    } finally {
      setIsLoadingMoreTracks(false);
    }
  }, [playlist, isLoadingMoreTracks]);

  const handleTrackPress = usePreventDoubleTap(async (trackIndex: number) => {
    const playlistTrack = playlist?.items?.items[trackIndex];
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

    return (
      <TrackListItem
        artists={track.artists}
        durationMs={track.duration_ms}
        key={`${track.id || "unknown"}-${index}`}
        name={track.name}
        onPress={() => handleTrackPress(index)}
        trackNumber={(playlist?.items?.offset || 0) + index + 1}
      />
    );
  };

  return (
    <DetailScreen
      data={playlist?.items?.items || []}
      emptyMessage="No tracks found in this playlist."
      error={error}
      imageUrl={displayImageUrl}
      isLoadingMore={isLoadingMoreTracks}
      keyExtractor={(item, index) =>
        `${item.item?.id || "unknown-track"}-${index}`
      }
      onLoadMore={loadMoreTracks}
      onTitlePress={handleTitlePress}
      placeholderIcon="music-note"
      renderItem={renderTrackItem}
      title={displayName}
    />
  );
}
