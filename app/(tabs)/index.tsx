import React, { useEffect, useCallback } from "react";
import {
    View,
    StyleSheet,
    Image,
    RefreshControl,
} from "react-native";
import {
    useAuth,
    SavedTrackObject,
    SpotifyArtistSimple,
} from "@/contexts/AuthContext";
import { HapticPressable } from "@/components/HapticPressable";
import { StyledText } from "@/components/StyledText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { log, logWarn, logError } from "@/utils/logger";
import ContentContainer from "@/components/ContentContainer";
import { useTabPreferences } from "@/contexts/TabPreferencesContext";
import CustomScrollView from "@/components/CustomScrollView";
import { useNetworkState } from "@/hooks/useNetworkState";
import { buildPlayingScreenParams } from "@/utils/playingScreen";

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
            <HapticPressable
                style={[styles.itemContainer, isDisabled && styles.disabledContainer]}
                onPress={async () => {
                    if (isDisabled) return;
                    
                    if (!user?.id) {
                        logError("Cannot play track: User not loaded");
                        return;
                    }

                    const collectionUri = "spotify:collection:tracks";
                    const playingParams = buildPlayingScreenParams(item.track);

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
                        router.push({ pathname: "/playing", params: playingParams });
                    } catch (error) {
                        logError("Error playing track:", error);
                        router.push({ pathname: "/playing", params: playingParams });
                    }
                }}
                disabled={isDisabled}
            >
                {item.track.album?.images &&
                    item.track.album.images.length > 0 ? (
                    <Image
                        source={{ uri: item.track.album.images[0].url }}
                        style={styles.trackImage}
                    />
                ) : (
                    <View style={styles.placeholderImageContainer}>
                        <MaterialIcons
                            name="music-note"
                            size={24}
                            color={isDisabled ? "#666" : "white"}
                        />
                    </View>
                )}
                <View style={styles.textContainer}>
                    <StyledText style={styles.trackName} numberOfLines={1}>
                        {item.track.name}
                    </StyledText>
                    <StyledText style={styles.trackArtist} numberOfLines={1}>
                        {getArtistNames(item.track.artists)}
                    </StyledText>
                </View>
            </HapticPressable>
        );
    };

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

    const handlePlayingPress = () => {
        router.push("/playing");
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
                onEndReachedThreshold={6}
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
    itemContainer: {
        paddingVertical: 0,
        flexDirection: "row",
        alignItems: "center",
    },
    trackImage: {
        width: 50,
        height: 50,
        marginRight: 15,
    },
    placeholderImageContainer: {
        width: 50,
        height: 50,
        marginRight: 15,
        backgroundColor: "#282828",
        justifyContent: "center",
        alignItems: "center",
    },
    textContainer: {
        flex: 1,
        gap: 0,
    },
    trackName: {
        fontSize: 22,
        lineHeight: 24,
    },
    trackArtist: {
        fontSize: 16,
        lineHeight: 18,
    },
    disabledContainer: {
        opacity: 0.3,
    },
});
