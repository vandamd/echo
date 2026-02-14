import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { ALBUM_DETAIL_KEY_PREFIX } from "@/constants/spotify";
import { useAuth } from "@/features/auth";
import {
  refreshSavedAlbumsFromCache,
  useAlbumsStore,
} from "@/features/library";
import {
  ListScreen,
  MediaListItem,
  RateLimitListMessage,
} from "@/shared/components";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";
import type { SpotifySavedAlbum } from "@/shared/types/spotify";
import type { WithRateLimitItem } from "@/shared/utils";
import {
  getArtistNames,
  getRateLimitMessage,
  isRateLimitItem,
  log,
  logError,
  prependRateLimitItem,
} from "@/shared/utils";

type AlbumsListItem = WithRateLimitItem<SpotifySavedAlbum>;

export default function AlbumsScreen() {
  const { isLoading } = useAuth();
  const albums = useAlbumsStore((s) => s.albums);
  const fetchAlbums = useAlbumsStore((s) => s.fetch);
  const isRefreshing = useAlbumsStore((s) => s.isRefreshing);
  const isFetching = useAlbumsStore((s) => s.isFetching);
  const fetchMore = useAlbumsStore((s) => s.fetchMore);
  const isLoadingMore = useAlbumsStore((s) => s.isLoadingMore);
  const isRateLimited = useAlbumsStore((s) => s.isRateLimited);
  const rateLimitRetryAt = useAlbumsStore((s) => s.rateLimitRetryAt);
  const nextUrl = useAlbumsStore((s) => s.nextUrl);
  const router = useRouter();

  const { isOnline } = useNetworkState();
  const [offlineAlbums, setOfflineAlbums] = useState<
    SpotifySavedAlbum[] | null
  >(null);
  const [cachedAlbumIds, setCachedAlbumIds] = useState<Set<string>>(new Set());

  const albumSource = albums ?? offlineAlbums;
  const sortedAlbums = useMemo(
    () =>
      albumSource
        ? [...albumSource].sort((a, b) =>
            (a.album.artists[0]?.name ?? "").localeCompare(
              b.album.artists[0]?.name ?? ""
            )
          )
        : null,
    [albumSource]
  );
  const albumRateLimitMessage = useMemo(
    () => getRateLimitMessage("albums", rateLimitRetryAt),
    [rateLimitRetryAt]
  );

  const checkCachedAlbums = useCallback(async () => {
    if (!sortedAlbums) {
      return;
    }
    const keys = sortedAlbums.map(
      (a) => `${ALBUM_DETAIL_KEY_PREFIX}${a.album.id}`
    );
    const results = await AsyncStorage.multiGet(keys);
    const cachedIds = new Set<string>();
    results.forEach(([, value], index) => {
      if (value !== null) {
        cachedIds.add(sortedAlbums[index].album.id);
      }
    });
    setCachedAlbumIds(cachedIds);
  }, [sortedAlbums]);

  useFocusEffect(
    useCallback(() => {
      checkCachedAlbums();
    }, [checkCachedAlbums])
  );

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) {
      return;
    }

    if (isOnline) {
      fetchAlbums();
    } else {
      log("Albums: Device is offline, loading cached albums");
      try {
        const cachedAlbums = await refreshSavedAlbumsFromCache();
        if (cachedAlbums && cachedAlbums.length > 0) {
          setOfflineAlbums(cachedAlbums);
          log(`Albums: Loaded ${cachedAlbums.length} cached albums`);
        } else {
          log("Albums: No cached albums found");
        }
      } catch (error) {
        logError("Albums: Error loading cached albums:", error);
      }
    }
  }, [fetchAlbums, isRefreshing, isOnline]);

  const handleAlbumPress = usePreventDoubleTap(
    (item: SpotifySavedAlbum, isUncached: boolean) => {
      if (isUncached) {
        return;
      }

      const minimalAlbum = {
        id: item.album.id,
        name: item.album.name,
        images: item.album.images,
        artists: item.album.artists,
        album_type: item.album.album_type,
        release_date: item.album.release_date,
        uri: item.album.uri,
      };

      router.push({
        pathname: `/album/${item.album.id}`,
        params: {
          albumName: item.album.name as string,
          albumString: JSON.stringify(minimalAlbum),
        },
      } as never);
    }
  );

  const handlePlayingPress = usePreventDoubleTap(() => {
    router.push("/playing");
  });

  const renderAlbumItem = ({ item }: { item: AlbumsListItem }) => {
    if (isRateLimitItem(item)) {
      return <RateLimitListMessage message={item.message} />;
    }

    const isOffline = !isOnline;
    const isUncached = isOffline && !cachedAlbumIds.has(item.album.id);

    return (
      <MediaListItem
        disabled={isUncached}
        imageUri={
          item.album.images && item.album.images.length > 0
            ? item.album.images[0].url
            : undefined
        }
        onPress={() => handleAlbumPress(item, isUncached)}
        placeholderIcon="album"
        primaryText={item.album.name}
        secondaryText={getArtistNames(item.album.artists)}
      />
    );
  };

  if (isLoading && !sortedAlbums) {
    return <View style={styles.centeredMessageContainer} />;
  }

  if (isFetching && !sortedAlbums) {
    return <View style={styles.centeredMessageContainer} />;
  }

  const handleLoadMore = () => {
    if (nextUrl && !isLoadingMore) {
      fetchMore();
    }
  };

  const displayAlbums: AlbumsListItem[] | null = prependRateLimitItem(
    sortedAlbums,
    isRateLimited,
    albumRateLimitMessage
  );

  return (
    <ListScreen
      data={displayAlbums}
      emptyMessage="No saved albums found."
      headerIconPress={handlePlayingPress}
      isLoadingMore={isLoadingMore}
      isOnline={isOnline}
      isRefreshing={isRefreshing}
      keyExtractor={(item) => (isRateLimitItem(item) ? item.id : item.album.id)}
      onLoadMore={handleLoadMore}
      onRefresh={handleRefresh}
      renderItem={renderAlbumItem}
      title="Albums"
    />
  );
}
