import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    StyleSheet,
    RefreshControl,
} from "react-native";
import { useAuth, SpotifyPlaylist } from "@/contexts/AuthContext";
import { StyledText } from "@/components/StyledText";
import { useRouter } from "expo-router";
import ContentContainer from "@/components/ContentContainer";
import { MediaListItem } from "@/components/MediaListItem";
import { useTabPreferences } from "@/contexts/TabPreferencesContext";
import CustomScrollView from "@/components/CustomScrollView";
import { logError, log } from "@/utils/logger";
import { saveCachedPlaylistDetail, refreshPlaylistsFromCache, isPlaylistCached } from "@/utils/cache";
import { useNetworkState } from "@/hooks/useNetworkState";
import { usePreventDoubleTap } from "@/hooks/usePreventDoubleTap";

const CREATE_NEW_PLAYLIST_ID = "CREATE_NEW_PLAYLIST_ID";

export default function PlaylistsScreen() {
    const {
        playlists,
        isLoading,
        accessToken,
        fetchPlaylists,
        user,
        isRefreshingPlaylists,
        fetchMorePlaylists,
        isLoadingMorePlaylists,
        playlistsNextUrl,
        makeApiRequest,
    } = useAuth();
    const router = useRouter();
    const { preferences } = useTabPreferences();
    const { isOnline } = useNetworkState();
    const [sortedPlaylists, setSortedPlaylists] = useState<
        SpotifyPlaylist[] | null
    >(null);
    const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(
        null
    );
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
                // If owners are the same, sort by playlist name
                const nameA = a.name.toLowerCase();
                const nameB = b.name.toLowerCase();
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return 0;
            });
            setSortedPlaylists(newSortedPlaylists);
            
            // Check which playlists are cached
            const checkCachedPlaylists = async () => {
                const cachedIds = new Set<string>();
                for (const playlist of newSortedPlaylists) {
                    const isCached = await isPlaylistCached(playlist.id);
                    if (isCached) {
                        cachedIds.add(playlist.id);
                    }
                }
                setCachedPlaylistIds(cachedIds);
            };
            checkCachedPlaylists();
        }
    }, [playlists]);

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
        async (item: SpotifyPlaylist, isUncached: boolean) => {
            if (loadingPlaylistId || isUncached) return;

            setLoadingPlaylistId(item.id);

            try {
                if (isOnline) {
                    const playlistDetails = await makeApiRequest(
                        `https://api.spotify.com/v1/playlists/${item.id}`,
                        "Playlist details for caching"
                    );

                    if (playlistDetails) {
                        await saveCachedPlaylistDetail(playlistDetails);
                        setCachedPlaylistIds((prev) => new Set(prev).add(item.id));

                        router.push({
                            pathname: `/playlist/${item.id}`,
                            params: {
                                playlistName: item.name as string,
                                playlistString: JSON.stringify(playlistDetails),
                            },
                        } as any);
                    } else {
                        router.push({
                            pathname: `/playlist/${item.id}`,
                            params: {
                                playlistName: item.name as string,
                            },
                        } as any);
                    }
                } else {
                    router.push({
                        pathname: `/playlist/${item.id}`,
                        params: {
                            playlistName: item.name as string,
                        },
                    } as any);
                }
            } catch (error) {
                logError("Error navigating to playlist:", error);
                router.push({
                    pathname: `/playlist/${item.id}`,
                    params: {
                        playlistName: item.name as string,
                    },
                } as any);
            } finally {
                setLoadingPlaylistId(null);
            }
        }
    );

    const renderPlaylistItem = ({ item }: { item: SpotifyPlaylist }) => {
        if (item.id === CREATE_NEW_PLAYLIST_ID) {
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
                isLoading={loadingPlaylistId === item.id}
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
        ? [createNewPlaylistItem, ...sortedPlaylists]
        : [createNewPlaylistItem];

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
        return <View style={{ paddingVertical: 20 }}></View>;
    };

    if (!sortedPlaylists || sortedPlaylists.length === 0) {
        return (
            <ContentContainer
                headerTitle="Playlists"
                hideBackButton={true}
                style={{ paddingHorizontal: 20 }}
                headerIcon="multitrack-audio"
                headerIconPress={handlePlayingPress}
                headerIconShowLength={preferences.showPlayingInNavbar ? 0 : 1}
            >
                <CustomScrollView
                    data={[createNewPlaylistItem]}
                    renderItem={renderPlaylistItem}
                    keyExtractor={(item) => item.id}
                    style={styles.list}
                    contentContainerStyle={styles.listContentContainer}
                    ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
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
            style={{ paddingHorizontal: 20 }}
            headerIcon="multitrack-audio"
            headerIconPress={handlePlayingPress}
            headerIconShowLength={preferences.showPlayingInNavbar ? 0 : 1}
        >
            <CustomScrollView
                data={displayPlaylists}
                renderItem={renderPlaylistItem}
                keyExtractor={(item) => item.id}
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
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

const styles = StyleSheet.create({
    list: {
        flex: 1,
        width: "100%",
    },
    listContentContainer: {
        paddingTop: 0,
        paddingBottom: 0,
    },
    centeredMessageContainer: {
        flex: 1,
        backgroundColor: "black",
        justifyContent: "center",
        alignItems: "center",
    },
    emptyText: {
        fontSize: 22,
        textAlign: "center",
        marginBottom: 10,
    },
    emptySubText: {
        fontSize: 14,
        textAlign: "center",
    },
});
