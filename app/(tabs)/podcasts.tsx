import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { SHOW_DETAIL_KEY_PREFIX } from "@/constants/spotify";
import { refreshFollowedPodcastsFromCache } from "@/features/library";
import { usePodcastsStore } from "@/features/library/stores";
import { useSettings } from "@/features/settings";
import {
  ListScreen,
  MediaListItem,
  RateLimitListMessage,
} from "@/shared/components";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";
import type { SpotifySavedShow } from "@/shared/types/spotify";
import type { WithRateLimitItem } from "@/shared/utils";
import {
  getAddedAtTimestamp,
  getRateLimitMessage,
  isRateLimitItem,
  prependRateLimitItem,
} from "@/shared/utils";
import { getLargestImage } from "@/shared/utils/formatters";
import { log, logError } from "@/shared/utils/logger";

const YOUR_EPISODES_ID = "YOUR_EPISODES_ID";

type PodcastListItem = WithRateLimitItem<SpotifySavedShow>;

export default function PodcastsScreen() {
  const podcasts = usePodcastsStore((s) => s.podcasts);
  const fetchPodcasts = usePodcastsStore((s) => s.fetch);
  const isRefreshing = usePodcastsStore((s) => s.isRefreshing);
  const isFetching = usePodcastsStore((s) => s.isFetching);
  const fetchMore = usePodcastsStore((s) => s.fetchMore);
  const isLoadingMore = usePodcastsStore((s) => s.isLoadingMore);
  const isRateLimited = usePodcastsStore((s) => s.isRateLimited);
  const rateLimitRetryAt = usePodcastsStore((s) => s.rateLimitRetryAt);
  const nextUrl = usePodcastsStore((s) => s.nextUrl);
  const router = useRouter();

  const { isOnline } = useNetworkState();
  const { hideYourEpisodes, podcastSortOrder } = useSettings();
  const [offlinePodcasts, setOfflinePodcasts] = useState<
    SpotifySavedShow[] | null
  >(null);
  const [cachedShowIds, setCachedShowIds] = useState<Set<string>>(new Set());

  const podcastSource = podcasts ?? offlinePodcasts;
  const sortedPodcasts = useMemo(() => {
    if (!podcastSource) {
      return null;
    }

    return [...podcastSource].sort((a, b) => {
      if (podcastSortOrder === "recentlyAdded") {
        const timeDifference =
          getAddedAtTimestamp(b.added_at) - getAddedAtTimestamp(a.added_at);
        if (timeDifference !== 0) {
          return timeDifference;
        }
        return a.show.name.localeCompare(b.show.name);
      }

      if (podcastSortOrder === "creator") {
        const creatorDifference = (
          a.show.publisher ?? a.show.name
        ).localeCompare(b.show.publisher ?? b.show.name);
        if (creatorDifference !== 0) {
          return creatorDifference;
        }
        return a.show.name.localeCompare(b.show.name);
      }

      return a.show.name.localeCompare(b.show.name);
    });
  }, [podcastSortOrder, podcastSource]);
  const podcastRateLimitMessage = useMemo(
    () => getRateLimitMessage("podcasts", rateLimitRetryAt),
    [rateLimitRetryAt]
  );

  const checkCachedShows = useCallback(async () => {
    if (!sortedPodcasts) {
      return;
    }
    const keys = sortedPodcasts.map(
      (s) => `${SHOW_DETAIL_KEY_PREFIX}${s.show.id}`
    );
    const results = await AsyncStorage.multiGet(keys);
    const cachedIds = new Set<string>();
    for (const [index, [, value]] of results.entries()) {
      if (value !== null) {
        cachedIds.add(sortedPodcasts[index].show.id);
      }
    }
    setCachedShowIds(cachedIds);
  }, [sortedPodcasts]);

  useFocusEffect(
    useCallback(() => {
      checkCachedShows();
    }, [checkCachedShows])
  );

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) {
      return;
    }

    if (isOnline) {
      fetchPodcasts();
    } else {
      log("Podcasts: Device is offline, loading cached shows");
      try {
        const cachedShows = await refreshFollowedPodcastsFromCache();
        if (cachedShows && cachedShows.length > 0) {
          setOfflinePodcasts(cachedShows);
          log(
            `Podcasts: Loaded ${cachedShows.length} cached followed podcasts`
          );
        } else {
          log("Podcasts: No cached podcasts found");
        }
      } catch (error) {
        logError("Podcasts: Error loading cached podcasts:", error);
      }
    }
  }, [fetchPodcasts, isRefreshing, isOnline]);

  const handleYourEpisodesPress = usePreventDoubleTap(() => {
    router.push("/your-episodes" as never);
  });

  const handleShowPress = usePreventDoubleTap(
    (item: SpotifySavedShow, isUncached: boolean) => {
      if (isUncached) {
        return;
      }

      router.push({
        pathname: `/podcast/${item.show.id}`,
        params: {
          showName: item.show.name as string,
          showString: JSON.stringify(item.show),
        },
      } as never);
    }
  );

  const yourEpisodesItem: SpotifySavedShow = useMemo(
    () => ({
      added_at: "",
      show: {
        id: YOUR_EPISODES_ID,
        name: "Your Episodes",
        description: "",
        publisher: "",
        images: [],
        total_episodes: 0,
        uri: "",
        href: "",
        media_type: "",
        explicit: false,
        type: "show",
        languages: [],
      },
    }),
    []
  );

  const withEpisodes = sortedPodcasts
    ? [yourEpisodesItem, ...sortedPodcasts]
    : [yourEpisodesItem];
  const withoutEpisodes: SpotifySavedShow[] = sortedPodcasts ?? [];
  const basePodcasts = hideYourEpisodes ? withoutEpisodes : withEpisodes;
  const displayPodcasts: PodcastListItem[] = prependRateLimitItem(
    basePodcasts,
    isRateLimited,
    podcastRateLimitMessage
  );

  const renderShowItem = ({ item }: { item: PodcastListItem }) => {
    if (isRateLimitItem(item)) {
      return <RateLimitListMessage message={item.message} />;
    }

    if (item.show.id === YOUR_EPISODES_ID) {
      if (hideYourEpisodes) {
        return null;
      }
      const isDisabled = !isOnline;

      return (
        <MediaListItem
          disabled={isDisabled}
          onPress={handleYourEpisodesPress}
          placeholderIcon="bookmark"
          primaryText={item.show.name}
        />
      );
    }

    const isOffline = !isOnline;
    const isUncached = isOffline && !cachedShowIds.has(item.show.id);

    return (
      <MediaListItem
        disabled={isUncached}
        imageUri={getLargestImage(item.show.images)}
        onPress={() => handleShowPress(item, isUncached)}
        placeholderIcon="mic"
        primaryText={item.show.name}
        secondaryText={item.show.publisher ?? ""}
      />
    );
  };

  const handleSortPress = usePreventDoubleTap(() => {
    router.push("/podcasts-sort" as never);
  });
  const handlePlayingPress = usePreventDoubleTap(() => {
    router.push("/playing");
  });

  if (isFetching && !sortedPodcasts) {
    return <View style={styles.centeredMessageContainer} />;
  }

  if (!sortedPodcasts || sortedPodcasts.length === 0) {
    return (
      <ListScreen
        data={displayPodcasts}
        emptyMessage="No followed podcasts yet."
        headerIconPress={handlePlayingPress}
        headerLeftIcon="sort"
        headerLeftIconPress={handleSortPress}
        isRefreshing={isRefreshing}
        keyExtractor={(item) =>
          isRateLimitItem(item) ? item.id : item.show.id
        }
        onRefresh={handleRefresh}
        renderItem={renderShowItem}
        title="Podcasts"
      />
    );
  }

  return (
    <ListScreen
      data={displayPodcasts}
      emptyMessage="No followed podcasts yet."
      headerIconPress={handlePlayingPress}
      headerLeftIcon="sort"
      headerLeftIconPress={handleSortPress}
      isLoadingMore={isLoadingMore}
      isRefreshing={isRefreshing}
      keyExtractor={(item) => (isRateLimitItem(item) ? item.id : item.show.id)}
      onLoadMore={() => {
        if (nextUrl && !isLoadingMore) {
          fetchMore();
        }
      }}
      onRefresh={handleRefresh}
      renderItem={renderShowItem}
      title="Podcasts"
    />
  );
}
