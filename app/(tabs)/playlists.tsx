import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    RefreshControl,
} from "react-native";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSpotifyLibrary } from "@/features/library/contexts/LibraryContext";
import type { SpotifyPlaylist } from "@/shared/types/spotify";
import { StyledText, ContentContainer, CustomScrollView, MediaListItem } from "@/shared/components";
import { useRouter, useFocusEffect } from "expo-router";
import { logError, log } from "@/shared/utils/logger";
import { n } from "@/shared/utils";
import { refreshPlaylistsFromCache, isPlaylistCached } from "@/features/library/utils/cache";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";
import { useSettings } from "@/features/settings";

const CREATE_NEW_PLAYLIST_ID = "CREATE_NEW_PLAYLIST_ID";

export default function PlaylistsScreen() {
    const { isLoading, accessToken, user } = useAuth();
    const {
        playlists,
        fetchPlaylists,
        isRefreshingPlaylists,
        fetchMorePlaylists,
        isLoadingMorePlaylists,
        playlistsNextUrl,
    } = useSpotifyLibrary();
    const router = useRouter();

    const { isOnline } = useNetworkState();
    const { hideCreatePlaylist } = useSettings();
    const [sortedPlaylists, setSortedPlaylists] = useState<
        SpotifyPlaylist[] | null
    >(null);
    const [cachedPlaylistIds, setCachedPlaylistIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (
            accessToken &&
            user &&
            !playlists &&
            !isLoading &&
            !isRefreshingPlaylists
        ) {
            fetchPlaylists();
        }
    }, [accessToken, user, playlists, fetchPlaylists, isLoading, isRefreshingPlaylists]);

    useEffect(() => {
        if (playlists) {
            const newSortedPlaylists = [...playlists].sort((a, b) => {
                const ownerA =
                    a.owner.display_name?.toLowerCase() ||
                    a.owner.id.toLowerCase() ||
                    "";
                const ownerB =
                    b.owner.display_name?.toLowerCase() ||
                    b.owner.id.toLowerCase() ||
                    "";
                if (ownerA < ownerB) return -1;
                if (ownerA > ownerB) return 1;
                const nameA = a.name.toLowerCase();
                const nameB = b.name.toLowerCase();
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return 0;
            });
            setSortedPlaylists(newSortedPlaylists);
        }
    }, [playlists]);

    const checkCachedPlaylists = useCallback(async () => {
        if (!sortedPlaylists) return;
        const cachedIds = new Set<string>();
        for (const playlist of sortedPlaylists) {
            const isCached = await isPlaylistCached(playlist.id);
            if (isCached) {
                cachedIds.add(playlist.id);
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
        if (isRefreshingPlaylists) return;

        if (!isOnline) {
            log("Playlists: Device is offline, loading cached playlists");
            try {
                const cachedPlaylists = await refreshPlaylistsFromCache();
                if (cachedPlaylists && cachedPlaylists.length > 0) {
                    const newSortedPlaylists = [...cachedPlaylists].sort((a, b) => {
                        const ownerA =
                            a.owner.display_name?.toLowerCase() ||
                            a.owner.id.toLowerCase() ||
                            "";
                        const ownerB =
                            b.owner.display_name?.toLowerCase() ||
                            b.owner.id.toLowerCase() ||
                            "";
                        if (ownerA < ownerB) return -1;
                        if (ownerA > ownerB) return 1;
                        // If owners are the same, sort by playlist name
                        const nameA = a.name.toLowerCase();
                        const nameB = b.name.toLowerCase();
                        if (nameA < nameB) return -1;
                        if (nameA > nameB) return 1;
                        return 0;
                    });
                    setSortedPlaylists(newSortedPlaylists);
                    log(`Playlists: Loaded ${cachedPlaylists.length} cached playlists`);
                } else {
                    log("Playlists: No cached playlists found");
                }
            } catch (error) {
                logError("Playlists: Error loading cached playlists:", error);
            }
        } else {
            fetchPlaylists();
        }
    }, [fetchPlaylists, isRefreshingPlaylists, isOnline]);

    const handleCreatePlaylistPress = usePreventDoubleTap(() => {
        router.push("/create-playlist");
    });

    const handlePlaylistPress = usePreventDoubleTap(
        (item: SpotifyPlaylist, isUncached: boolean) => {
            if (isUncached) return;

            router.push({
                pathname: `/playlist/${item.id}`,
                params: {
                    playlistName: item.name as string,
                    playlistString: JSON.stringify(item),
                },
            } as any);
        }
    );

    const renderPlaylistItem = ({ item }: { item: SpotifyPlaylist }) => {
        if (item.id === CREATE_NEW_PLAYLIST_ID) {
            if (hideCreatePlaylist) return null;
            const isDisabled = !isOnline;

            return (
                <MediaListItem
                    primaryText={item.name}
                    placeholderIcon="add"
                    disabled={isDisabled}
                    onPress={() => {
                        if (isDisabled) return;
                        handleCreatePlaylistPress();
                    }}
                />
            );
        }

        const isOffline = !isOnline;
        const isUncached = isOffline && !cachedPlaylistIds.has(item.id);

        return (
            <MediaListItem
                primaryText={item.name}
                secondaryText={item.owner.display_name || item.owner.id}
                imageUri={item.images && item.images.length > 0 ? item.images[0].url : undefined}
                placeholderIcon="music-note"
                disabled={isUncached}
                onPress={() => handlePlaylistPress(item, isUncached)}
            />
        );
    };

    // Show global loading indicator if initial data is loading and no playlists are yet available
    if (isLoading && !sortedPlaylists) {
        return <View style={styles.centeredMessageContainer}></View>;
    }

    // Show specific refresh indicator if only manual refresh is happening
    // This is a bit redundant if the TabHeader also shows an indicator, but can be a fallback
    // or primary if header doesn't have space/icon for it.
    // For now, let's assume the header icon is the primary indicator and this is for safety.
    if (isRefreshingPlaylists && !sortedPlaylists) {
        // Or perhaps (isRefreshingPlaylists && playlists) if we want to show stale data UNDER the spinner
        return <View style={styles.centeredMessageContainer}></View>;
    }

    const createNewPlaylistItem: SpotifyPlaylist = {
        id: CREATE_NEW_PLAYLIST_ID,
        name: "Create new playlist",
        images: [], // No image for this item
        owner: { display_name: "", id: "" }, // No owner
        description: "", // Default value
        tracks: { href: "", total: 0 }, // Default value
        public: false, // Default value
        collaborative: false, // Default value
        uri: "", // Default value
        href: "", // Default value
    };

    const displayPlaylists = sortedPlaylists
        ? (hideCreatePlaylist ? sortedPlaylists : [createNewPlaylistItem, ...sortedPlaylists])
        : (hideCreatePlaylist ? [] : [createNewPlaylistItem]);

    const handlePlayingPress = usePreventDoubleTap(() => {
        router.push("/playing");
    });

    const handleLoadMore = () => {
        if (isOnline && playlistsNextUrl && !isLoadingMorePlaylists) {
            fetchMorePlaylists();
        }
    };

    const renderFooter = () => {
        if (!isLoadingMorePlaylists) return null;
        return <View style={{ paddingVertical: n(20) }}></View>;
    };

    if (!sortedPlaylists || sortedPlaylists.length === 0) {
        const emptyData = hideCreatePlaylist ? [] : [createNewPlaylistItem];
        return (
            <ContentContainer
                headerTitle="Playlists"
                hideBackButton={true}
                style={{ paddingHorizontal: n(20) }}
                headerIcon="multitrack-audio"
                headerIconPress={handlePlayingPress}
                headerIconShowLength={1}
            >
                <CustomScrollView
                    data={emptyData}
                    renderItem={renderPlaylistItem}
                    keyExtractor={(item) => item.id}
                    style={styles.list}
                    contentContainerStyle={styles.listContentContainer}
                    ItemSeparatorComponent={() => <View style={{ height: n(8) }} />}
                    overScrollMode={"never"}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshingPlaylists}
                            onRefresh={handleRefresh}
                            colors={["white"]}
                            progressBackgroundColor={"black"}
                            size={"large" as any}
                        />
                    }
                />
            </ContentContainer>
        );
    }

    return (
        <ContentContainer
            headerTitle="Playlists"
            hideBackButton={true}
            style={{ paddingHorizontal: n(20) }}
            headerIcon="multitrack-audio"
            headerIconPress={handlePlayingPress}
            headerIconShowLength={1}
        >
            <CustomScrollView
                data={displayPlaylists}
                renderItem={renderPlaylistItem}
                keyExtractor={(item) => item.id}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                ItemSeparatorComponent={() => <View style={{ height: n(8) }} />}
                overScrollMode={"never"}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={2}
                ListFooterComponent={renderFooter}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshingPlaylists}
                        onRefresh={handleRefresh}
                        colors={["white"]}
                        progressBackgroundColor={"black"}
                        size={"large" as any}
                    />
                }
            />
        </ContentContainer>
    );
}
