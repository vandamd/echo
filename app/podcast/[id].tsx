import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@/features/auth";
import { getCachedShowDetail, saveCachedShowDetail } from "@/features/library";
import { usePodcastsStore } from "@/features/library/stores";
import { usePlayback } from "@/features/playback";
import { DetailScreen, HapticPressable, StyledText } from "@/shared/components";
import {
  useNetworkState,
  usePreventDoubleTap,
  useSaveStatus,
} from "@/shared/hooks";
import type { SpotifyEpisode, SpotifyShow } from "@/shared/types/spotify";
import {
  formatDuration,
  getLargestImage,
  log,
  logError,
  n,
} from "@/shared/utils";
import { apiGet } from "@/shared/utils/api-client";

export default function PodcastDetailScreen() {
  const { id, showString, showName } = useLocalSearchParams<{
    id: string;
    showString?: string;
    showName?: string;
  }>();

  const { accessToken } = useAuth();
  const { playTrackWithContext } = usePlayback();
  const followPodcast = usePodcastsStore((s) => s.followPodcast);
  const unfollowPodcast = usePodcastsStore((s) => s.unfollowPodcast);
  const checkIfFollowing = usePodcastsStore((s) => s.checkIfFollowing);
  const router = useRouter();
  const { isOnline } = useNetworkState();

  const initialShow = useMemo(() => {
    if (!showString) {
      return null;
    }
    try {
      return JSON.parse(showString) as SpotifyShow;
    } catch {
      return null;
    }
  }, [showString]);

  const [fetchedShow, setShow] = useState<SpotifyShow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMoreEpisodes, setIsLoadingMoreEpisodes] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const show = fetchedShow ?? initialShow;
  const displayName = show?.name ?? showName ?? "Podcast";
  const displayImageUrl = getLargestImage(show?.images);

  const {
    isSaved: isShowFollowed,
    isChecking: isCheckingFollowed,
    toggle: handleToggleFollowShow,
  } = useSaveStatus({
    id,
    checkFn: checkIfFollowing,
    saveFn: followPodcast,
    removeFn: unfollowPodcast,
    accessToken,
  });

  useEffect(() => {
    if (!id) {
      setError("Podcast ID is missing.");
      return;
    }

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: data fetching with cache fallback
    const fetchShowDetails = async () => {
      let hasDisplayedData = !!initialShow?.episodes?.items;

      if (!hasDisplayedData) {
        try {
          const cachedShow = await getCachedShowDetail(id);
          if (cachedShow?.episodes?.items) {
            log("Podcast details: Displaying cached data");
            setShow(cachedShow);
            hasDisplayedData = true;
          }
        } catch (cacheError) {
          logError("Error retrieving cached show:", cacheError);
        }
      }

      if (isOnline) {
        try {
          const data = await apiGet<SpotifyShow>(
            `https://api.spotify.com/v1/shows/${id}?market=from_token&limit=10`
          );
          if (data) {
            log("Podcast details: Fetched fresh data from API");
            setShow(data);
            await saveCachedShowDetail(data);
          } else if (!hasDisplayedData) {
            throw new Error("Failed to fetch podcast details");
          }
        } catch (e: unknown) {
          const msg =
            e instanceof Error ? e.message : "An unexpected error occurred.";
          logError("Error fetching podcast details:", e);
          if (!hasDisplayedData) {
            setError(msg);
          }
        }
      } else if (!hasDisplayedData) {
        setError(
          "No cached data available. Connect to the internet to load this podcast."
        );
      }

      setIsInitialLoading(false);
    };

    fetchShowDetails();
  }, [id, initialShow?.episodes?.items, isOnline]);

  const loadMoreEpisodes = useCallback(async () => {
    if (!show?.episodes?.next || isLoadingMoreEpisodes) {
      return;
    }
    setIsLoadingMoreEpisodes(true);
    try {
      const data = await apiGet<{
        items: SpotifyEpisode[];
        next: string | null;
      }>(show.episodes.next);
      if (data) {
        setShow((prevShow) => {
          if (!prevShow?.episodes) {
            return prevShow;
          }
          const updatedShow = {
            ...prevShow,
            episodes: {
              ...prevShow.episodes,
              items: [...prevShow.episodes.items, ...data.items],
              next: data.next,
            },
          } as SpotifyShow;
          saveCachedShowDetail(updatedShow);
          return updatedShow;
        });
      }
    } catch (e: unknown) {
      logError("Error fetching more podcast episodes:", e);
    } finally {
      setIsLoadingMoreEpisodes(false);
    }
  }, [show, isLoadingMoreEpisodes]);

  const episodeItems = useMemo(
    () =>
      (show?.episodes?.items || []).filter(
        (episode: unknown): episode is SpotifyEpisode =>
          !!episode &&
          typeof episode === "object" &&
          !!(episode as SpotifyEpisode).id
      ),
    [show?.episodes?.items]
  );

  const handleEpisodePress = usePreventDoubleTap(
    async (episode: SpotifyEpisode, index: number) => {
      const albumArtUrl =
        getLargestImage(episode.images) ?? getLargestImage(show?.images) ?? "";

      try {
        await playTrackWithContext(episode.uri, {
          type: "podcast",
          uri: `spotify:show:${id}`,
          currentIndex: index,
        });
        router.push({
          pathname: "/playing",
          params: {
            trackName: episode.name ?? "",
            artistName: show?.name ?? "",
            albumArtUrl,
            durationMs: episode.duration_ms?.toString() ?? "0",
          },
        });
      } catch (playError) {
        logError("Error playing episode:", playError);
        router.push({
          pathname: "/playing",
          params: {
            trackName: episode.name ?? "",
            artistName: show?.name ?? "",
            albumArtUrl,
            durationMs: episode.duration_ms?.toString() ?? "0",
          },
        });
      }
    }
  );

  const renderEpisodeItem = ({
    item: episode,
    index,
  }: {
    item: SpotifyEpisode;
    index: number;
  }) => (
    <HapticPressable
      onPress={() => handleEpisodePress(episode, index)}
      style={styles.episodeItemContainer}
    >
      <View style={styles.episodeInfoContainer}>
        <View style={styles.titleRow}>
          {episode.resume_point?.fully_played && (
            <MaterialIcons
              color="#ffffff"
              name="check-circle"
              size={16}
              style={{ marginTop: n(6) }}
            />
          )}
          <StyledText numberOfLines={1} style={styles.episodeName}>
            {episode.name}
          </StyledText>
        </View>
        {(() => {
          const resumePoint = episode.resume_point;
          const remainingMs =
            resumePoint && !resumePoint.fully_played
              ? Math.max(
                  episode.duration_ms - (resumePoint.resume_position_ms ?? 0),
                  0
                )
              : 0;
          let progressLabel: string | null = null;
          if (resumePoint?.fully_played) {
            progressLabel = "Played";
          } else if (resumePoint && resumePoint.resume_position_ms > 0) {
            progressLabel = `${formatDuration(remainingMs, true)} left`;
          }
          return (
            <StyledText numberOfLines={1} style={styles.episodeMeta}>
              {new Date(episode.release_date).toLocaleDateString()} ·{" "}
              {formatDuration(episode.duration_ms, true)}
              {progressLabel ? ` · ${progressLabel}` : ""}
            </StyledText>
          );
        })()}
      </View>
    </HapticPressable>
  );

  return (
    <DetailScreen
      data={episodeItems}
      emptyMessage="No episodes found for this podcast."
      error={error}
      headerIcon={isShowFollowed ? "remove" : "add"}
      headerIconPress={handleToggleFollowShow}
      headerIconShowLength={isCheckingFollowed ? 0 : 1}
      imageUrl={displayImageUrl}
      isInitialLoading={isInitialLoading}
      isLoadingMore={isLoadingMoreEpisodes}
      keyExtractor={(item, index) => item?.id || index.toString()}
      onLoadMore={loadMoreEpisodes}
      placeholderIcon="mic"
      placeholderText={displayName.charAt(0)}
      renderItem={renderEpisodeItem}
      title={displayName}
    />
  );
}

const styles = StyleSheet.create({
  episodeItemContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
  },
  episodeName: {
    flex: 1,
    fontSize: n(26),
    paddingRight: n(10),
  },
  episodeMeta: {
    fontSize: n(16),
    lineHeight: n(18),
    paddingBottom: n(6),
  },
  episodeInfoContainer: {
    flex: 1,
    alignItems: "flex-start",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: n(6),
    marginBottom: n(4),
  },
});
