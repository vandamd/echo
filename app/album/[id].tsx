import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/features/auth";
import {
  getCachedAlbumDetail,
  saveCachedAlbumDetail,
} from "@/features/library";
import { useAlbumsStore } from "@/features/library/stores";
import { usePlayback } from "@/features/playback";
import { DetailScreen, TrackListItem } from "@/shared/components";
import {
  useNetworkState,
  usePreventDoubleTap,
  useSaveStatus,
} from "@/shared/hooks";
import type { SpotifyAlbum, SpotifyTrackSimple } from "@/shared/types/spotify";
import { log, logError, n } from "@/shared/utils";
import { apiGet } from "@/shared/utils/api-client";

export default function AlbumDetailScreen() {
  const { id, albumString, albumName } = useLocalSearchParams<{
    id: string;
    albumString?: string;
    albumName?: string;
  }>();

  const { accessToken } = useAuth();
  const { skipToIndex } = usePlayback();
  const saveAlbum = useAlbumsStore((s) => s.saveAlbum);
  const removeAlbum = useAlbumsStore((s) => s.removeAlbum);
  const checkIfSaved = useAlbumsStore((s) => s.checkIfSaved);
  const router = useRouter();
  const { isOnline } = useNetworkState();

  const initialAlbum = albumString
    ? (JSON.parse(albumString) as SpotifyAlbum)
    : null;

  const [album, setAlbum] = useState<SpotifyAlbum | null>(initialAlbum);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMoreTracks, setIsLoadingMoreTracks] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(
    !initialAlbum?.tracks?.items
  );

  const {
    isSaved: isAlbumSaved,
    isChecking: isCheckingAlbumSaved,
    toggle: handleToggleAlbumSave,
  } = useSaveStatus({
    id,
    checkFn: checkIfSaved,
    saveFn: saveAlbum,
    removeFn: removeAlbum,
    accessToken,
  });

  useEffect(() => {
    if (!id) {
      setError("Album ID is missing.");
      setIsInitialLoading(false);
      return;
    }

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: data fetching with cache fallback
    const fetchAlbumDetails = async () => {
      let hasDisplayedData = !!initialAlbum?.tracks?.items;

      try {
        if (!hasDisplayedData) {
          try {
            const cachedAlbum = await getCachedAlbumDetail(id);
            if (cachedAlbum?.tracks?.items) {
              log("Album details: Displaying cached data");
              setAlbum(cachedAlbum);
              hasDisplayedData = true;
            }
          } catch (cacheError) {
            logError("Error retrieving cached album:", cacheError);
          }
        }

        if (isOnline) {
          try {
            const data = await apiGet<SpotifyAlbum>(
              `https://api.spotify.com/v1/albums/${id}`
            );
            if (data) {
              log("Album details: Fetched fresh data from API");
              setAlbum(data);
              await saveCachedAlbumDetail(data);
            } else if (!hasDisplayedData) {
              throw new Error("Failed to fetch album details");
            }
          } catch (e: unknown) {
            const msg =
              e instanceof Error ? e.message : "An unexpected error occurred.";
            logError("Error fetching album details:", e);
            if (!hasDisplayedData) {
              setError(msg);
            }
          }
        } else if (!hasDisplayedData) {
          setError(
            "No cached data available. Connect to the internet to load this album."
          );
        }
      } finally {
        setIsInitialLoading(false);
      }
    };

    fetchAlbumDetails();
  }, [id, initialAlbum?.tracks?.items, isOnline]);

  const loadMoreTracks = useCallback(async () => {
    if (!album?.tracks?.next || isLoadingMoreTracks) {
      return;
    }
    setIsLoadingMoreTracks(true);
    try {
      const data = await apiGet<{
        items: SpotifyTrackSimple[];
        next: string | null;
      }>(album.tracks.next);
      if (data) {
        setAlbum((prevAlbum) => {
          if (!prevAlbum?.tracks) {
            return prevAlbum;
          }
          return {
            ...prevAlbum,
            tracks: {
              ...prevAlbum.tracks,
              items: [...prevAlbum.tracks.items, ...data.items],
              next: data.next,
            },
          };
        });
      }
    } catch (e: unknown) {
      logError("Error fetching more album tracks:", e);
    } finally {
      setIsLoadingMoreTracks(false);
    }
  }, [album, isLoadingMoreTracks]);

  const handleTrackPress = usePreventDoubleTap(async (trackIndex: number) => {
    const track = album?.tracks?.items[trackIndex];
    const artistName =
      track?.artists
        ?.map((a: SpotifyTrackSimple["artists"][0]) => a.name)
        .join(", ") ?? "";
    const albumArtUrl = album?.images?.[0]?.url ?? "";

    try {
      await skipToIndex({
        type: "album",
        uri: `spotify:album:${id}`,
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

  if (!album) {
    return (
      <DetailScreen
        data={[]}
        emptyMessage=""
        error={error}
        headerIcon={isAlbumSaved ? "remove" : "add"}
        headerIconPress={handleToggleAlbumSave}
        headerIconShowLength={isCheckingAlbumSaved ? 0 : 1}
        isInitialLoading={isInitialLoading}
        keyExtractor={(_item, index) => index.toString()}
        placeholderIcon="album"
        renderItem={() => null}
        title={albumName || "Album"}
      />
    );
  }

  const renderTrackItem = ({
    item: track,
    index,
  }: {
    item: SpotifyTrackSimple;
    index: number;
  }) => {
    const tracks = album?.tracks?.items || [];
    const previousTrack = index > 0 ? tracks[index - 1] : null;
    const showDiscGap =
      previousTrack && track.disc_number !== previousTrack.disc_number;

    return (
      <>
        {showDiscGap && <View style={{ height: n(40) }} />}
        <TrackListItem
          artists={track.artists}
          durationMs={track.duration_ms}
          key={track.id || index.toString()}
          name={track.name}
          onPress={() => handleTrackPress(index)}
          trackNumber={track.track_number}
        />
      </>
    );
  };

  return (
    <DetailScreen
      data={album.tracks?.items || []}
      emptyMessage="No tracks found in this album."
      error={error}
      headerIcon={isAlbumSaved ? "remove" : "add"}
      headerIconPress={handleToggleAlbumSave}
      headerIconShowLength={isCheckingAlbumSaved ? 0 : 1}
      imageUrl={album.images?.[0]?.url}
      isInitialLoading={isInitialLoading}
      isLoadingMore={isLoadingMoreTracks}
      keyExtractor={(item, index) => item.id || index.toString()}
      onLoadMore={loadMoreTracks}
      placeholderIcon="album"
      renderItem={renderTrackItem}
      title={album.name}
    />
  );
}
