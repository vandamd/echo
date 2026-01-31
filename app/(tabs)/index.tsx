import React, { useEffect, useCallback } from "react";
import { View, RefreshControl } from "react-native";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSpotifyLibrary } from "@/features/library/contexts/LibraryContext";
import { usePlayback } from "@/features/playback/contexts/PlaybackContext";
import type { SavedTrackObject } from "@/shared/types/spotify";
import { StyledText, ContentContainer, CustomScrollView, MediaListItem } from "@/shared/components";
import { useRouter } from "expo-router";
import { log, logWarn, logError, getArtistNames, n } from "@/shared/utils";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";

export default function LikedSongsScreen() {
    const { isLoading, accessToken, user } = useAuth();
    const {
        savedTracks,
        fetchSavedTracks,
        isRefreshingSavedTracks,
        fetchMoreSavedTracks,
        isLoadingMoreSavedTracks,
        savedTracksNextUrl,
    } = useSpotifyLibrary();
    const { playTrackWithContext, getPlaybackState, toggleShuffle } = usePlayback();
    const router = useRouter();
    const { isLoading: isNetworkLoading, isOnline } = useNetworkState();

    useEffect(() => {
        log("LikedSongs: useEffect triggered", {
            hasAccessToken: !!accessToken,
            hasUser: !!user,
            hasSavedTracks: !!savedTracks,
            isLoading,
        });

        if (accessToken && user && !savedTracks && !isLoading) {
            log("LikedSongs: Fetching saved tracks...");
            fetchSavedTracks();
        }
    }, [accessToken, user, savedTracks, fetchSavedTracks, isLoading]);

    const handleRefresh = useCallback(() => {
        log("LikedSongs: Manual refresh triggered", {
            isRefreshingSavedTracks,
        });
        if (!isRefreshingSavedTracks) {
            fetchSavedTracks();
        }
    }, [fetchSavedTracks, isRefreshingSavedTracks]);



    const handleTrackPress = usePreventDoubleTap(
        async (item: SavedTrackObject, index: number, isDisabled: boolean) => {
            if (isDisabled) return;

            if (!user?.id) {
                logError("Cannot play track: User not loaded");
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
                } catch (e) {
                    logWarn("Could not get playback state, proceeding without shuffle workaround");
                }
                if (wasShuffling) {
                    await toggleShuffle(false);
                }
                await playTrackWithContext(item.track.uri, {
                    type: "liked",
                    uri: collectionUri,
                    tracks: savedTracks || [],
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

    const renderTrackItem = ({
        item,
        index,
    }: {
        item: SavedTrackObject;
        index: number;
    }) => {
        if (!item.track) {
            index
            logWarn("Track is null for item:", item);
            return null;
        }

        const isDisabled = !isOnline;

        return (
            <MediaListItem
                primaryText={item.track.name}
                secondaryText={getArtistNames(item.track.artists)}
                imageUri={item.track.album?.images && item.track.album.images.length > 0 ? item.track.album.images[0].url : undefined}
                placeholderIcon="music-note"
                disabled={isDisabled}
                onPress={() => handleTrackPress(item, index, isDisabled)}
            />
        );
    };

    const handlePlayingPress = usePreventDoubleTap(() => {
        router.push("/playing");
    });

    if (isNetworkLoading || (isLoading && !savedTracks)) {
        return <View style={styles.centeredMessageContainer}></View>;
    }

    if (isRefreshingSavedTracks && !savedTracks) {
        return <View style={styles.centeredMessageContainer}></View>;
    }


    const handleLoadMore = () => {
        if (isOnline && savedTracksNextUrl && !isLoadingMoreSavedTracks) {
            fetchMoreSavedTracks();
        }
    };

    const renderFooter = () => {
        if (!isLoadingMoreSavedTracks) return null;
        return;
    };

    if (!savedTracks || savedTracks.length === 0) {
        return (
            <ContentContainer
                headerTitle="Liked Songs"
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
                            No saved tracks found.
                        </StyledText>
                    }
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshingSavedTracks}
                            onRefresh={handleRefresh}
                            colors={["white"]}
                            progressBackgroundColor={"black"}
                            size={"large" as any}
                            enabled={isOnline === true}
                        />
                    }
                />
            </ContentContainer>
        );
    }

    return (
        <ContentContainer
            headerTitle="Liked Songs"
            hideBackButton={true}
            style={{ paddingHorizontal: n(20) }}
            headerIcon="multitrack-audio"
            headerIconPress={handlePlayingPress}
            headerIconShowLength={1}
        >
            <CustomScrollView
                data={savedTracks?.filter((item: SavedTrackObject) => item.track !== null) || []}
                renderItem={renderTrackItem}
                keyExtractor={(item: SavedTrackObject) =>
                    `${item.added_at}-${item.track?.id || "unknown"}`
                }
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                ItemSeparatorComponent={() => <View style={{ height: n(8) }} />}
                overScrollMode={"never"}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={2}
                ListFooterComponent={renderFooter}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshingSavedTracks}
                        onRefresh={handleRefresh}
                        colors={["white"]}
                        progressBackgroundColor={"black"}
                        size={"large" as any}
                        enabled={isOnline === true}
                    />
                }
            />
        </ContentContainer>
    );
}
