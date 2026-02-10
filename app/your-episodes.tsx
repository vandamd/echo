import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { RefreshControl, View } from "react-native";
import { useAuth } from "@/features/auth";
import { useSavedEpisodesStore } from "@/features/library/stores";
import { usePlayback } from "@/features/playback";
import {
  ContentContainer,
  CustomScrollView,
  ListFooter,
  MediaListItem,
  StyledText,
} from "@/shared/components";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";
import type { SpotifySavedEpisode } from "@/shared/types/spotify";
import { formatDuration, getLargestImage, n } from "@/shared/utils";

const ItemSeparator = () => <View style={{ height: n(8) }} />;

export default function YourEpisodesScreen() {
  const { accessToken, user, isLoading: isAuthLoading } = useAuth();
  const { playTrackWithContext } = usePlayback();
  const savedEpisodes = useSavedEpisodesStore((s) => s.savedEpisodes);
  const nextUrl = useSavedEpisodesStore((s) => s.nextUrl);
  const isRefreshing = useSavedEpisodesStore((s) => s.isRefreshing);
  const isLoadingMore = useSavedEpisodesStore((s) => s.isLoadingMore);
  const fetchEpisodes = useSavedEpisodesStore((s) => s.fetch);
  const fetchMoreEpisodes = useSavedEpisodesStore((s) => s.fetchMore);
  const router = useRouter();
  const { isOnline } = useNetworkState();
  const shouldAttachRefreshControl = savedEpisodes !== null;

  useEffect(() => {
    if (
      accessToken &&
      user &&
      !savedEpisodes &&
      !isAuthLoading &&
      !isRefreshing
    ) {
      fetchEpisodes({ showRefreshing: false });
    }
  }, [
    accessToken,
    user,
    savedEpisodes,
    isAuthLoading,
    isRefreshing,
    fetchEpisodes,
  ]);

  const handleRefresh = useCallback(() => {
    if (isRefreshing) {
      return;
    }
    if (isOnline) {
      fetchEpisodes();
    }
  }, [fetchEpisodes, isRefreshing, isOnline]);

  const handleEpisodePress = usePreventDoubleTap(
    async (savedEpisode: SpotifySavedEpisode) => {
      const episode = savedEpisode.episode;
      const albumArtUrl =
        getLargestImage(episode.images) ??
        getLargestImage(episode.show?.images) ??
        "";

      await playTrackWithContext(episode.uri);
      router.push({
        pathname: "/playing",
        params: {
          trackName: episode.name ?? "",
          artistName: episode.show?.name ?? "",
          albumArtUrl,
          durationMs: episode.duration_ms?.toString() ?? "0",
        },
      });
    }
  );

  const formatReleaseDate = (dateString: string): string => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleDateString();
  };

  const renderEpisodeItem = ({ item }: { item: SpotifySavedEpisode }) => {
    const episode = item.episode;
    const resumePoint = episode.resume_point;
    const remainingMs =
      resumePoint && !resumePoint.fully_played
        ? Math.max(
            episode.duration_ms - (resumePoint.resume_position_ms ?? 0),
            0
          )
        : 0;

    const releaseDate = formatReleaseDate(episode.release_date);
    const metaParts = [
      ...(releaseDate ? [releaseDate] : []),
      formatDuration(episode.duration_ms, true),
    ];

    if (resumePoint?.fully_played) {
      metaParts.push("Played");
    } else if (resumePoint && resumePoint.resume_position_ms > 0) {
      metaParts.push(`${formatDuration(remainingMs, true)} left`);
    }

    const imageUri =
      getLargestImage(episode.images) ?? getLargestImage(episode.show?.images);
    const isDisabled = !isOnline;

    return (
      <MediaListItem
        disabled={isDisabled}
        imageUri={imageUri}
        onPress={() => handleEpisodePress(item)}
        placeholderIcon="mic"
        primaryText={episode.name}
        secondaryText={metaParts.join(" · ")}
      />
    );
  };

  const renderFooter = () => {
    return <ListFooter isLoading={isLoadingMore} />;
  };

  return (
    <ContentContainer
      headerTitle="Your Episodes"
      style={{ paddingHorizontal: n(20), paddingBottom: n(20) }}
    >
      <CustomScrollView
        contentContainerStyle={{ ...styles.listContentContainer }}
        data={savedEpisodes ?? []}
        ItemSeparatorComponent={ItemSeparator}
        keyExtractor={(item) => item.episode.id}
        ListEmptyComponent={
          !isRefreshing && (!savedEpisodes || savedEpisodes.length === 0) ? (
            <StyledText style={styles.emptyText}>
              No saved episodes yet.
            </StyledText>
          ) : null
        }
        ListFooterComponent={renderFooter}
        onEndReached={() => {
          if (nextUrl && !isLoadingMore && isOnline) {
            fetchMoreEpisodes();
          }
        }}
        onEndReachedThreshold={2}
        overScrollMode="never"
        refreshControl={
          shouldAttachRefreshControl ? (
            <RefreshControl
              colors={["white"]}
              onRefresh={handleRefresh}
              progressBackgroundColor={"black"}
              refreshing={isRefreshing}
              size={"large" as unknown as number}
            />
          ) : undefined
        }
        renderItem={renderEpisodeItem}
        style={styles.list}
      />
    </ContentContainer>
  );
}
