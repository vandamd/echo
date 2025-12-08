import React, { useEffect, useCallback } from "react";
import {
    View,
    StyleSheet,
    RefreshControl,
} from "react-native";
import {
    useAuth,
    SavedTrackObject,
    SpotifyArtistSimple,
} from "@/contexts/AuthContext";
import { StyledText } from "@/components/StyledText";
import { useRouter } from "expo-router";
import { log, logWarn, logError } from "@/utils/logger";
import ContentContainer from "@/components/ContentContainer";
import { MediaListItem } from "@/components/MediaListItem";
import { useTabPreferences } from "@/contexts/TabPreferencesContext";
import CustomScrollView from "@/components/CustomScrollView";
import { useNetworkState } from "@/hooks/useNetworkState";
import { usePreventDoubleTap } from "@/hooks/usePreventDoubleTap";

export default function LikedSongsScreen() {
    const {
        savedTracks,
        isLoading,
        accessToken,
        fetchSavedTracks,
        user,
        isRefreshingSavedTracks,
        fetchMoreSavedTracks,
        isLoadingMoreSavedTracks,
        savedTracksNextUrl,
        playTrackWithContext,
        getPlaybackState,
        toggleShuffle,
    } = useAuth();
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

    const getArtistNames = (artists: SpotifyArtistSimple[]) => {
        return artists.map((artist) => artist.name).join(", ");
    };

    const { preferences } = useTabPreferences();

    const handleTrackPress = usePreventDoubleTap(
        async (item: SavedTrackObject, index: number, isDisabled: boolean) => {
            if (isDisabled) return;

            if (!user?.id) {
                logError("Cannot play track: User not loaded");
                return;
            }

            const collectionUri = "spotify:collection:tracks";

            try {
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
                router.push("/playing");
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
            style={{ paddingHorizontal: 20 }}
            headerIcon="multitrack-audio"
            headerIconPress={handlePlayingPress}
            headerIconShowLength={preferences.showPlayingInNavbar ? 0 : 1}
        >
            <CustomScrollView
                data={savedTracks?.filter((item) => item.track !== null) || []}
                renderItem={renderTrackItem}
                keyExtractor={(item) =>
                    `${item.added_at}-${item.track?.id || "unknown"}`
                }
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
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
