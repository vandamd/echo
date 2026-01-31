import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    RefreshControl,
} from "react-native";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSpotifyLibrary } from "@/features/library/contexts/LibraryContext";
import type { SpotifySavedAlbum } from "@/shared/types/spotify";
import { StyledText, ContentContainer, CustomScrollView, MediaListItem } from "@/shared/components";
import { useRouter, useFocusEffect } from "expo-router";
import { log, logError, getArtistNames, n } from "@/shared/utils";
import { refreshSavedAlbumsFromCache, isAlbumCached } from "@/features/library/utils/cache";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";

export default function AlbumsScreen() {
    const { isLoading, accessToken, user } = useAuth();
    const {
        albums,
        fetchAlbums,
        isRefreshingAlbums,
        fetchMoreAlbums,
        isLoadingMoreAlbums,
        albumsNextUrl,
    } = useSpotifyLibrary();
    const router = useRouter();

    const { isOnline, isLoading: networkLoading } = useNetworkState();
    const [sortedAlbums, setSortedAlbums] = useState<
        SpotifySavedAlbum[] | null
    >(null);
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
        }
    }, [albums]);

    const checkCachedAlbums = useCallback(async () => {
        if (!sortedAlbums) return;
        const cachedIds = new Set<string>();
        for (const album of sortedAlbums) {
            const isCached = await isAlbumCached(album.album.id);
            if (isCached) {
                cachedIds.add(album.album.id);
            }
        }
        setCachedAlbumIds(cachedIds);
    }, [sortedAlbums]);

    useFocusEffect(
        useCallback(() => {
            checkCachedAlbums();
        }, [checkCachedAlbums])
    );

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

    const handleAlbumPress = usePreventDoubleTap(
        (item: SpotifySavedAlbum, isUncached: boolean) => {
            if (isUncached) return;

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
            } as any);
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
                style={{ paddingHorizontal: n(20) }}
                headerIcon="multitrack-audio"
                headerIconPress={handlePlayingPress}
                headerIconShowLength={1}
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
            style={{ paddingHorizontal: n(20) }}
            headerIcon="multitrack-audio"
            headerIconPress={handlePlayingPress}
            headerIconShowLength={1}
        >
            <CustomScrollView
                data={sortedAlbums}
                renderItem={renderAlbumItem}
                keyExtractor={(item) => item.album.id} // Use album id as key
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                ItemSeparatorComponent={() => <View style={{ height: n(8) }} />}
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
