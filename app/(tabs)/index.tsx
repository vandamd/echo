import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useAuth } from "@/features/auth";
import { useSavedTracksStore } from "@/features/library/stores";
import { usePlayback } from "@/features/playback";
import {
  ListScreen,
  MediaListItem,
  RateLimitListMessage,
} from "@/shared/components";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";
import type { SavedTrackObject } from "@/shared/types/spotify";
import type { WithRateLimitItem } from "@/shared/utils";
import {
  getArtistNames,
  getRateLimitMessage,
  isRateLimitItem,
  log,
  logError,
  logWarn,
  prependRateLimitItem,
} from "@/shared/utils";

type LikedSongsListItem = WithRateLimitItem<SavedTrackObject>;
const getSavedTrackKey = (item: SavedTrackObject): string =>
  `${item.added_at}-${item.track?.id ?? item.track?.uri ?? "unknown"}`;

export default function LikedSongsScreen() {
  const { isLoading } = useAuth();
  const savedTracks = useSavedTracksStore((s) => s.savedTracks);
  const fetchSavedTracks = useSavedTracksStore((s) => s.fetch);
  const isRefreshing = useSavedTracksStore((s) => s.isRefreshing);
  const isFetching = useSavedTracksStore((s) => s.isFetching);
  const fetchMore = useSavedTracksStore((s) => s.fetchMore);
  const isLoadingMore = useSavedTracksStore((s) => s.isLoadingMore);
  const isRateLimited = useSavedTracksStore((s) => s.isRateLimited);
  const rateLimitRetryAt = useSavedTracksStore((s) => s.rateLimitRetryAt);
  const nextUrl = useSavedTracksStore((s) => s.nextUrl);
  const { playTrackWithContext, getPlaybackState, toggleShuffle } =
    usePlayback();
  const router = useRouter();
  const { isLoading: isNetworkLoading, isOnline } = useNetworkState();

  const handleRefresh = useCallback(() => {
    log("LikedSongs: Manual refresh triggered", {
      isRefreshing,
    });
    if (!isRefreshing) {
      fetchSavedTracks();
    }
  }, [fetchSavedTracks, isRefreshing]);

  const filteredTracks = useMemo(
    () => savedTracks?.filter((item) => item.track !== null) ?? [],
    [savedTracks]
  );
  const baseTracks = useMemo(
    () => (filteredTracks.length > 0 ? filteredTracks : (savedTracks ?? [])),
    [filteredTracks, savedTracks]
  );
  const trackIndicesByKey = useMemo(() => {
    const indices = new Map<string, number>();
    for (const [index, track] of baseTracks.entries()) {
      if (!track.track) {
        continue;
      }
      indices.set(getSavedTrackKey(track), index);
    }
    return indices;
  }, [baseTracks]);
  const rateLimitMessage = useMemo(
    () => getRateLimitMessage("liked songs", rateLimitRetryAt),
    [rateLimitRetryAt]
  );

  const handleTrackPress = usePreventDoubleTap(
    async (
      item: SavedTrackObject,
      index: number,
      sourceTracks: SavedTrackObject[],
      isDisabled: boolean
    ) => {
      if (isDisabled) {
        return;
      }

      if (sourceTracks.length === 0) {
        return;
      }

      const collectionUri = "spotify:collection:tracks";

      try {
        const track = item.track;
        const artistName = getArtistNames(track.artists ?? []);
        const albumArtUrl = track.album?.images?.[0]?.url ?? "";

        let wasShuffling = false;
        try {
          const playbackState = await getPlaybackState();
          wasShuffling = !!playbackState?.shuffle_state;
        } catch {
          logWarn(
            "Could not get playback state, proceeding without shuffle workaround"
          );
        }
        if (wasShuffling) {
          await toggleShuffle(false);
        }
        await playTrackWithContext(item.track.uri, {
          type: "liked",
          uri: collectionUri,
          tracks: sourceTracks,
          currentIndex: index,
        });
        if (wasShuffling) {
          await toggleShuffle(true);
        }
        router.push({
          pathname: "/playing",
          params: {
            trackName: track.name ?? "",
            artistName,
            albumArtUrl,
            durationMs: track.duration_ms?.toString() ?? "0",
          },
        });
      } catch (error) {
        logError("Error playing track:", error);
        router.push("/playing");
      }
    }
  );

  const renderTrackItem = ({ item }: { item: LikedSongsListItem }) => {
    if (isRateLimitItem(item)) {
      return <RateLimitListMessage message={item.message} />;
    }

    if (!item.track) {
      logWarn("Track is null for item:", item);
      return null;
    }

    const isDisabled = !isOnline;
    const trackKey = getSavedTrackKey(item);
    const trackIndex = trackIndicesByKey.get(trackKey);
    if (trackIndex === undefined) {
      logWarn("Could not resolve track index for liked song", {
        key: trackKey,
      });
      return null;
    }

    return (
      <MediaListItem
        disabled={isDisabled}
        imageUri={
          item.track.album?.images && item.track.album.images.length > 0
            ? item.track.album.images[0].url
            : undefined
        }
        onPress={() =>
          handleTrackPress(item, trackIndex, baseTracks, isDisabled)
        }
        placeholderIcon="music-note"
        primaryText={item.track.name}
        secondaryText={getArtistNames(item.track.artists)}
      />
    );
  };

  const handlePlayingPress = usePreventDoubleTap(() => {
    router.push("/playing");
  });

  if (isNetworkLoading || (isLoading && !savedTracks)) {
    return <View style={styles.centeredMessageContainer} />;
  }

  if (isFetching && !savedTracks) {
    return <View style={styles.centeredMessageContainer} />;
  }

  const handleLoadMore = () => {
    if (isOnline && nextUrl && !isLoadingMore) {
      fetchMore();
    }
  };

  const displayTracks: LikedSongsListItem[] = prependRateLimitItem(
    baseTracks,
    isRateLimited,
    rateLimitMessage
  );

  return (
    <ListScreen
      data={displayTracks}
      emptyMessage="No saved tracks found."
      headerIconPress={handlePlayingPress}
      isLoadingMore={isLoadingMore}
      isOnline={isOnline}
      isRefreshing={isRefreshing}
      keyExtractor={(item: LikedSongsListItem) =>
        isRateLimitItem(item) ? item.id : getSavedTrackKey(item)
      }
      onLoadMore={handleLoadMore}
      onRefresh={handleRefresh}
      refreshEnabled={isOnline === true}
      renderItem={renderTrackItem}
      title="Liked Songs"
    />
  );
}
