import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { PLAYLIST_DETAIL_KEY_PREFIX } from "@/constants/spotify";
import { useAuth } from "@/features/auth";
import { refreshPlaylistsFromCache } from "@/features/library";
import { usePlaylistsStore } from "@/features/library/stores";
import { useSettings } from "@/features/settings";
import { ListScreen, MediaListItem } from "@/shared/components";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";
import type { SpotifyPlaylist } from "@/shared/types/spotify";
import { log, logError } from "@/shared/utils/logger";

const CREATE_NEW_PLAYLIST_ID = "CREATE_NEW_PLAYLIST_ID";

export default function PlaylistsScreen() {
  const { isLoading } = useAuth();
  const playlists = usePlaylistsStore((s) => s.playlists);
  const fetchPlaylists = usePlaylistsStore((s) => s.fetch);
  const isRefreshing = usePlaylistsStore((s) => s.isRefreshing);
  const fetchMore = usePlaylistsStore((s) => s.fetchMore);
  const isLoadingMore = usePlaylistsStore((s) => s.isLoadingMore);
  const nextUrl = usePlaylistsStore((s) => s.nextUrl);
  const router = useRouter();

  const { isOnline } = useNetworkState();
  const { hideCreatePlaylist } = useSettings();
  const [offlinePlaylists, setOfflinePlaylists] = useState<
    SpotifyPlaylist[] | null
  >(null);
  const [cachedPlaylistIds, setCachedPlaylistIds] = useState<Set<string>>(
    new Set()
  );

  const playlistSource = playlists ?? offlinePlaylists;
  const sortedPlaylists = useMemo(
    () =>
      playlistSource
        ? [...playlistSource].sort((a, b) => {
            const ownerCmp = (
              a.owner.display_name ??
              a.owner.id ??
              ""
            ).localeCompare(b.owner.display_name ?? b.owner.id ?? "");
            if (ownerCmp !== 0) {
              return ownerCmp;
            }
            return a.name.localeCompare(b.name);
          })
        : null,
    [playlistSource]
  );

  const checkCachedPlaylists = useCallback(async () => {
    if (!sortedPlaylists) {
      return;
    }
    const keys = sortedPlaylists.map(
      (p) => `${PLAYLIST_DETAIL_KEY_PREFIX}${p.id}`
    );
    const results = await AsyncStorage.multiGet(keys);
    const cachedIds = new Set<string>();
    for (const [index, [, value]] of results.entries()) {
      if (value !== null) {
        cachedIds.add(sortedPlaylists[index].id);
      }
    }
    setCachedPlaylistIds(cachedIds);
  }, [sortedPlaylists]);

  useFocusEffect(
    useCallback(() => {
      checkCachedPlaylists();
    }, [checkCachedPlaylists])
  );

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) {
      return;
    }

    if (isOnline) {
      fetchPlaylists();
    } else {
      log("Playlists: Device is offline, loading cached playlists");
      try {
        const cachedPlaylists = await refreshPlaylistsFromCache();
        if (cachedPlaylists && cachedPlaylists.length > 0) {
          setOfflinePlaylists(cachedPlaylists);
          log(`Playlists: Loaded ${cachedPlaylists.length} cached playlists`);
        } else {
          log("Playlists: No cached playlists found");
        }
      } catch (error) {
        logError("Playlists: Error loading cached playlists:", error);
      }
    }
  }, [fetchPlaylists, isRefreshing, isOnline]);

  const handleCreatePlaylistPress = usePreventDoubleTap(() => {
    router.push("/create-playlist");
  });

  const handlePlaylistPress = usePreventDoubleTap(
    (item: SpotifyPlaylist, isUncached: boolean) => {
      if (isUncached) {
        return;
      }

      router.push({
        pathname: `/playlist/${item.id}`,
        params: {
          playlistName: item.name as string,
          playlistString: JSON.stringify(item),
        },
      } as never);
    }
  );

  const renderPlaylistItem = ({ item }: { item: SpotifyPlaylist }) => {
    if (item.id === CREATE_NEW_PLAYLIST_ID) {
      if (hideCreatePlaylist) {
        return null;
      }
      const isDisabled = !isOnline;

      return (
        <MediaListItem
          disabled={isDisabled}
          onPress={() => {
            if (isDisabled) {
              return;
            }
            handleCreatePlaylistPress();
          }}
          placeholderIcon="add"
          primaryText={item.name}
        />
      );
    }

    const isOffline = !isOnline;
    const isUncached = isOffline && !cachedPlaylistIds.has(item.id);

    return (
      <MediaListItem
        disabled={isUncached}
        imageUri={
          item.images && item.images.length > 0 ? item.images[0].url : undefined
        }
        onPress={() => handlePlaylistPress(item, isUncached)}
        placeholderIcon="music-note"
        primaryText={item.name}
        secondaryText={item.owner.display_name || item.owner.id}
      />
    );
  };

  const handlePlayingPress = usePreventDoubleTap(() => {
    router.push("/playing");
  });

  if (isLoading && !sortedPlaylists) {
    return <View style={styles.centeredMessageContainer} />;
  }

  if (isRefreshing && !sortedPlaylists) {
    return <View style={styles.centeredMessageContainer} />;
  }

  const createNewPlaylistItem: SpotifyPlaylist = {
    id: CREATE_NEW_PLAYLIST_ID,
    name: "Create new playlist",
    images: [],
    owner: { display_name: "", id: "" },
    description: "",
    items: { href: "", total: 0 },
    public: false,
    collaborative: false,
    uri: "",
    href: "",
  };

  const withCreate = sortedPlaylists
    ? [createNewPlaylistItem, ...sortedPlaylists]
    : [createNewPlaylistItem];
  const withoutCreate: SpotifyPlaylist[] = sortedPlaylists ?? [];
  const displayPlaylists = hideCreatePlaylist ? withoutCreate : withCreate;

  const handleLoadMore = () => {
    if (isOnline && nextUrl && !isLoadingMore) {
      fetchMore();
    }
  };

  return (
    <ListScreen
      data={displayPlaylists}
      emptyMessage="No playlists found."
      headerIconPress={handlePlayingPress}
      isLoadingMore={isLoadingMore}
      isOnline={isOnline}
      isRefreshing={isRefreshing}
      keyExtractor={(item) => item.id}
      onLoadMore={handleLoadMore}
      onRefresh={handleRefresh}
      renderItem={renderPlaylistItem}
      title="Playlists"
    />
  );
}
