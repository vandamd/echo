import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    StyleSheet,
    RefreshControl,
} from "react-native";
import {
    useAuth,
    SpotifySavedAlbum,
    SpotifyArtistSimple,
} from "@/contexts/AuthContext";
import { StyledText } from "@/components/StyledText";
import { useRouter } from "expo-router";
import ContentContainer from "@/components/ContentContainer";
import { MediaListItem } from "@/components/MediaListItem";
import { useTabPreferences } from "@/contexts/TabPreferencesContext";
import CustomScrollView from "@/components/CustomScrollView";
import { log, logError } from "@/utils/logger";
import { saveCachedAlbumDetail, refreshSavedAlbumsFromCache, isAlbumCached } from "@/utils/cache";
import { useNetworkState } from "@/hooks/useNetworkState";
import { usePreventDoubleTap } from "@/hooks/usePreventDoubleTap";

export default function AlbumsScreen() {
    const {
        albums,
        isLoading,
        accessToken,
        fetchAlbums,
        user,
        isRefreshingAlbums,
        fetchMoreAlbums,
        isLoadingMoreAlbums,
        albumsNextUrl,
        makeApiRequest,
    } = useAuth();
    const router = useRouter();
    const { preferences } = useTabPreferences();
    const { isOnline, isLoading: networkLoading } = useNetworkState();
    const [sortedAlbums, setSortedAlbums] = useState<
        SpotifySavedAlbum[] | null
    >(null);
    const [loadingAlbumId, setLoadingAlbumId] = useState<string | null>(null);
    const [cachedAlbumIds, setCachedAlbumIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (
            accessToken &&
            user &&
            !albums &&
            !isLoading &&
            !isRefreshingAlbums
        ) {
            fetchAlbums();
        }
    }, [accessToken, user, albums, isLoading, isRefreshingAlbums]);

    useEffect(() => {
        if (albums) {
            const newSortedAlbums = [...albums].sort((a, b) => {
                const artistA = a.album.artists[0]?.name.toLowerCase() || "";
                const artistB = b.album.artists[0]?.name.toLowerCase() || "";
                if (artistA < artistB) return -1;
                if (artistA > artistB) return 1;
                return 0;
            });
            setSortedAlbums(newSortedAlbums);
            
            // Check which albums are cached
            const checkCachedAlbums = async () => {
                const cachedIds = new Set<string>();
                for (const album of newSortedAlbums) {
                    const isCached = await isAlbumCached(album.album.id);
                    if (isCached) {
                        cachedIds.add(album.album.id);
                    }
                }
                setCachedAlbumIds(cachedIds);
            };
            checkCachedAlbums();
        }
    }, [albums]);

    const handleRefresh = useCallback(async () => {
        if (isRefreshingAlbums) return;
        
        if (!isOnline) {
            log("Albums: Device is offline, loading cached albums");
            try {
                const cachedAlbums = await refreshSavedAlbumsFromCache();
                if (cachedAlbums && cachedAlbums.length > 0) {
                    const newSortedAlbums = [...cachedAlbums].sort((a, b) => {
                        const artistA = a.album.artists[0]?.name.toLowerCase() || "";
                        const artistB = b.album.artists[0]?.name.toLowerCase() || "";
                        if (artistA < artistB) return -1;
                        if (artistA > artistB) return 1;
                        return 0;
                    });
                    setSortedAlbums(newSortedAlbums);
                    log(`Albums: Loaded ${cachedAlbums.length} cached albums`);
                } else {
                    log("Albums: No cached albums found");
                }
            } catch (error) {
                logError("Albums: Error loading cached albums:", error);
            }
        } else {
            fetchAlbums();
        }
    }, [fetchAlbums, isRefreshingAlbums, isOnline]);

    const getArtistNames = (artists: SpotifyArtistSimple[]) => {
        return artists.map((artist) => artist.name).join(", ");
    };

    const handleAlbumPress = usePreventDoubleTap(
        async (item: SpotifySavedAlbum, isUncached: boolean) => {
            if (loadingAlbumId || isUncached) return;

            setLoadingAlbumId(item.album.id);

            try {
                if (isOnline) {
                    const albumDetails = await makeApiRequest(
                        `https://api.spotify.com/v1/albums/${item.album.id}`,
                        "Album details for caching"
                    );

                    if (albumDetails) {
                        await saveCachedAlbumDetail(albumDetails);
                        setCachedAlbumIds((prev) => new Set(prev).add(item.album.id));

                        router.push({
                            pathname: `album/${item.album.id}`,
                            params: {
                                albumName: item.album.name as string,
                                albumString: JSON.stringify(albumDetails),
                            },
                        } as any);
                    } else {
                        router.push({
                            pathname: `album/${item.album.id}`,
                            params: {
                                albumName: item.album.name as string,
                            },
                        } as any);
                    }
                } else {
                    router.push({
                        pathname: `album/${item.album.id}`,
                        params: {
                            albumName: item.album.name as string,
                        },
                    } as any);
                }
            } catch (error) {
                logError("Error navigating to album:", error);
                router.push({
                    pathname: `album/${item.album.id}`,
                    params: {
                        albumName: item.album.name as string,
                    },
                } as any);
            } finally {
                setLoadingAlbumId(null);
            }
        }
    );

    const renderAlbumItem = ({ item }: { item: SpotifySavedAlbum }) => {
        const isOffline = !isOnline;
        const isUncached = isOffline && !cachedAlbumIds.has(item.album.id);

        return (
            <MediaListItem
                primaryText={item.album.name}
                secondaryText={getArtistNames(item.album.artists)}
                imageUri={item.album.images && item.album.images.length > 0 ? item.album.images[0].url : undefined}
                placeholderIcon="album"
                isLoading={loadingAlbumId === item.album.id}
                disabled={isUncached}
                onPress={() => handleAlbumPress(item, isUncached)}
            />
        );
    };

    const handlePlayingPress = usePreventDoubleTap(() => {
        router.push("/playing");
    });

    // Show global loading indicator if initial data is loading and no albums are yet available
    if (isLoading && !sortedAlbums) {
        return <View style={styles.centeredMessageContainer}></View>;
    }

    // Show specific refresh indicator if only manual refresh is happening for albums
    if (isRefreshingAlbums && !sortedAlbums) {
        return <View style={styles.centeredMessageContainer}></View>;
    }

    const handleLoadMore = () => {
        if (albumsNextUrl && !isLoadingMoreAlbums) {
            fetchMoreAlbums();
        }
    };

    const renderFooter = () => {
        if (!isLoadingMoreAlbums) return null;
        return;
    };

    if (!sortedAlbums || sortedAlbums.length === 0) {
        return (
            <ContentContainer
                headerTitle="Albums"
                hideBackButton={true}
                style={{ paddingHorizontal: 20 }}
                headerIcon="multitrack-audio"
                headerIconPress={handlePlayingPress}
                headerIconShowLength={preferences.showPlayingInNavbar ? 0 : 1}
            >
                <CustomScrollView
                    data={[]}
                    renderItem={null}
                    overScrollMode={"never"}
                    ListHeaderComponent={
                        <StyledText style={styles.emptyText}>
                            No saved albums found.
                        </StyledText>
                    }
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshingAlbums}
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
            headerTitle="Albums"
            hideBackButton={true}
            style={{ paddingHorizontal: 20 }}
            headerIcon="multitrack-audio"
            headerIconPress={handlePlayingPress}
            headerIconShowLength={preferences.showPlayingInNavbar ? 0 : 1}
        >
            <CustomScrollView
                data={sortedAlbums}
                renderItem={renderAlbumItem}
                keyExtractor={(item) => item.album.id} // Use album id as key
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                overScrollMode={"never"}
                onEndReached={handleLoadMore} // Added onEndReached
                onEndReachedThreshold={2}
                ListFooterComponent={renderFooter} // Added ListFooterComponent
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshingAlbums}
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
        marginTop: 20,
        textAlign: "center",
    },
    emptySubText: {
        fontSize: 14,
        textAlign: "center",
    },
});
