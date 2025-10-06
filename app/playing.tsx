import React, { useState, useRef, useEffect } from "react";
import {
    View,
    StyleSheet,
    Image,
    Animated,
} from "react-native";
import * as Network from "expo-network";
import { StyledText } from "@/components/StyledText";
import {
    useAuth,
    SpotifyCurrentlyPlaying,
    SpotifyArtistSimple,
} from "@/contexts/AuthContext";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import { HapticPressable } from "@/components/HapticPressable";
import ContentContainer from "@/components/ContentContainer";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { log, logError } from "@/utils/logger";

const formatTime = (ms: number | null | undefined): string => {
    if (ms === null || ms === undefined) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

export default function PlayingScreen() {
    const {
        startPlayback,
        pausePlayback,
        skipToNext,
        skipToPrevious,
        toggleShuffle,
        toggleRepeat,
        seekToPosition,
        addToLibrary,
        removeFromLibrary,
        getLibraryState,
        getPlaybackState,
        appState,
    } = useAuth();
    const { invertColors } = useInvertColors();
    const networkState = Network.useNetworkState();
    const [playbackState, setPlaybackState] =
        useState<SpotifyCurrentlyPlaying | null>(null);
    const [isCurrentTrackSaved, setIsCurrentTrackSaved] = useState(false);

    const progress = useRef(new Animated.Value(0)).current;
    const progressBarWidthRef = useRef<number | null>(null);
    const appStateRef = useRef(appState);
    const isFocusedRef = useRef(true);

    // Check if device is online
    const isOnline = networkState.isConnected && networkState.isInternetReachable;

    useEffect(() => {
        appStateRef.current = appState;
    }, [appState]);

    const checkIfTrackIsSaved = React.useCallback(
        async (trackId: string) => {
            if (!trackId) return;

            const result = await getLibraryState(`spotify:track:${trackId}`);

            if (result) {
                setIsCurrentTrackSaved(result.isAdded);
            } else {
                setIsCurrentTrackSaved(false);
            }
        },
        [getLibraryState]
    );

    const fetchAndUpdatePlaybackState = React.useCallback(async () => {
        const state = await getPlaybackState();

        if (!isFocusedRef.current) {
            return null;
        }

        setPlaybackState(state as SpotifyCurrentlyPlaying);

        if (state && state.item && state.item.id) {
            if (state.progress_ms !== null) {
                const progressRatio =
                    state.progress_ms / state.item.duration_ms;
                progress.setValue(progressRatio > 0 ? progressRatio : 0);
            } else {
                progress.setValue(0);
            }
        } else {
            progress.setValue(0);
        }

        return state as SpotifyCurrentlyPlaying | null;
    }, [getPlaybackState, progress]);

    const handlePlayPause = async () => {
        if (!playbackState) return;

        try {
            if (playbackState.is_playing) {
                await pausePlayback();
            } else {
                await startPlayback();
            }
            await fetchAndUpdatePlaybackState();
        } catch (error) {
            logError("Error toggling playback:", error);
        }
    };

    const handleSkipToNext = async () => {
        try {
            await skipToNext();
            await fetchAndUpdatePlaybackState();
        } catch (error) {
            logError("Error skipping to next track:", error);
        }
    };

    const handleSkipToPrevious = async () => {
        try {
            await skipToPrevious();
            await fetchAndUpdatePlaybackState();
        } catch (error) {
            logError("Error skipping to previous track:", error);
        }
    };

    const handleShuffleToggle = async () => {
        if (!playbackState) return;

        try {
            await toggleShuffle(!playbackState.shuffle_state);
            await fetchAndUpdatePlaybackState();
        } catch (error) {
            logError("Error toggling shuffle:", error);
        }
    };

    const handleRepeatToggle = async () => {
        if (!playbackState) return;

        try {
            let newState: "off" | "context" | "track";
            if (playbackState.repeat_state === "off") {
                newState = "context";
            } else if (playbackState.repeat_state === "context") {
                newState = "track";
            } else {
                newState = "off";
            }
            await toggleRepeat(newState);
            await fetchAndUpdatePlaybackState();
        } catch (error) {
            logError("Error toggling repeat:", error);
        }
    };

    const handleProgressBarSeek = async (event: any) => {
        if (
            !playbackState ||
            !playbackState.item ||
            !progressBarWidthRef.current
        )
            return;

        const tapPositionX = event.nativeEvent.locationX;
        const totalDurationMs = playbackState.item.duration_ms;
        const seekPositionMs =
            (tapPositionX / progressBarWidthRef.current) * totalDurationMs;

        try {
            await seekToPosition(seekPositionMs);
            const progressRatio = seekPositionMs / totalDurationMs;
            progress.setValue(progressRatio > 0 ? progressRatio : 0);
            await fetchAndUpdatePlaybackState();
        } catch (error) {
            logError("Error seeking track:", error);
        }
    };

    const handleToggleSaveTrack = async () => {
        if (!playbackState || !playbackState.item || !playbackState.item.id)
            return;

        const trackId = playbackState.item.id;
        const currentlySaved = isCurrentTrackSaved;

        try {
            if (currentlySaved) {
                await removeFromLibrary(`spotify:track:${trackId}`);
                setIsCurrentTrackSaved(false);
            } else {
                await addToLibrary(`spotify:track:${trackId}`);
                setIsCurrentTrackSaved(true);
            }
        }
        catch (error) {
            logError("Error toggling track save status:", error);
            return;
        }
    };

    const handleNavigateToAddToPlaylist = () => {
        if (playbackState && playbackState.item && playbackState.item.uri) {
            log(
                "Navigating to add-to-playlist with trackUri:",
                playbackState.item.uri
            );
            router.push({
                pathname: "/add-to-playlist",
                params: { trackUri: playbackState.item.uri },
            });
        } else {
            console.warn(
                "Cannot navigate to add to playlist: No track playing or track URI is missing."
            );
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            isFocusedRef.current = true;

            setPlaybackState(null);
            setIsCurrentTrackSaved(false);
            progress.setValue(0);

            let isCancelled = false;

            const fetchAll = async () => {
                if (
                    isCancelled ||
                    !isFocusedRef.current ||
                    appStateRef.current !== "active"
                ) {
                    return;
                }

                const state = await fetchAndUpdatePlaybackState();
                if (isCancelled || !isFocusedRef.current) {
                    return;
                }
                if (state && state.item && state.item.id) {
                    await checkIfTrackIsSaved(state.item.id);
                } else {
                    setIsCurrentTrackSaved(false);
                }
            };

            fetchAll();

            const intervalId = setInterval(fetchAll, 1000);

            return () => {
                isFocusedRef.current = false;
                isCancelled = true;
                clearInterval(intervalId);
                log("PlayingScreen unfocused, cleared interval.");
            };
        }, [fetchAndUpdatePlaybackState, checkIfTrackIsSaved, progress])
    );

    const getArtistNames = (artists: SpotifyArtistSimple[]) => {
        return artists.map((artist) => artist.name).join(", ");
    };


    if (!playbackState || !playbackState.item) {
        return (
            <ContentContainer headerTitle=" ">
                <View style={styles.content}>
                    <View style={styles.placeholderImageContainer}></View>
                    <View style={styles.trackInfoContainer}>
                        <StyledText style={styles.trackName} numberOfLines={1}>
                            No song playing
                        </StyledText>
                        <StyledText style={styles.artistName} numberOfLines={1}>
                            Go back and play something!
                        </StyledText>
                    </View>
                </View>
            </ContentContainer>
        );
    }

    const { item } = playbackState;

    const animatedWidth = progress.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", "100%"],
    });

    return (
        <ContentContainer headerTitle=" " style={{ paddingHorizontal: 20 }}>
            <View style={styles.content}>
                {item.album?.images && item.album.images.length > 0 ? (
                    <Image
                        source={{ uri: item.album.images[0].url }}
                        style={styles.albumArt}
                    />
                ) : (
                    <View style={styles.placeholderImageContainer}>
                        <MaterialIcons
                            name="music-note"
                            size={100}
                            color={invertColors ? "black" : "white"}
                        />
                    </View>
                )}
                <View style={styles.trackInfoContainer}>
                    <HapticPressable
                        onPress={async () => {
                            if (isOnline) {
                                router.push({
                                    pathname: "/album/[id]",
                                    params: { id: item.album?.id as any, albumName: item.album?.name as string }
                                });
                            }
                        }}
                        disabled={!isOnline}
                    >
                        <StyledText style={styles.trackName} numberOfLines={1}>
                            {item.name}
                        </StyledText>
                    </HapticPressable>
                    <HapticPressable
                        onPress={async () => {
                            if (isOnline && item.artists.length > 0) {
                                const artist = item.artists[0];
                                router.push({
                                    pathname: "/artist/[id]",
                                    params: { id: artist.id, artistName: artist.name as string }
                                });
                            }
                        }}
                        disabled={!isOnline}
                    >
                        <StyledText style={styles.artistName} numberOfLines={1}>
                            {getArtistNames(item.artists)}
                        </StyledText>
                    </HapticPressable>
                </View>

                <View style={styles.timeIndicatorContainer}>
                    <HapticPressable
                        onPress={handleProgressBarSeek}
                        style={styles.progressBarPressable}
                    >
                        <View
                            style={[styles.progressBarBackground, { backgroundColor: invertColors ? "black" : "white" }]}
                            onLayout={(event) => {
                                progressBarWidthRef.current =
                                    event.nativeEvent.layout.width;
                            }}
                        >
                            <Animated.View
                                style={[
                                    styles.progressBarForeground,
                                    { backgroundColor: invertColors ? "black" : "white" },
                                    { width: animatedWidth },
                                ]}
                            />
                        </View>
                    </HapticPressable>
                    <View style={styles.progressBarInfo}>
                        <StyledText style={styles.timeText}>
                            {formatTime(playbackState.progress_ms)}
                        </StyledText>
                        <StyledText style={styles.timeText}>
                            {formatTime(item.duration_ms)}
                        </StyledText>
                    </View>
                </View>
                <View style={styles.musicControls}>
                    <HapticPressable onPress={handleShuffleToggle}>
                        <MaterialIcons
                            name={"shuffle"}
                            size={30}
                            color={invertColors ? "black" : "white"}
                        />
                        <View
                            style={[
                                styles.shuffleIndicator,
                                playbackState?.shuffle_state &&
                                [styles.activeShuffleIndicator, { backgroundColor: invertColors ? "black" : "white" }],
                            ]}
                        ></View>
                    </HapticPressable>
                    <HapticPressable onPress={handleSkipToPrevious}>
                        <MaterialIcons
                            name={"skip-previous"}
                            size={52}
                            color={invertColors ? "black" : "white"}
                        />
                    </HapticPressable>
                    <HapticPressable onPress={handlePlayPause}>
                        <MaterialIcons
                            name={
                                playbackState.is_playing
                                    ? "pause"
                                    : "play-arrow"
                            }
                            size={52}
                            color={invertColors ? "black" : "white"}
                        />
                    </HapticPressable>
                    <HapticPressable onPress={handleSkipToNext}>
                        <MaterialIcons
                            name={"skip-next"}
                            size={52}
                            color={invertColors ? "black" : "white"}
                        />
                    </HapticPressable>
                    <HapticPressable onPress={handleRepeatToggle}>
                        <MaterialIcons
                            name={
                                playbackState?.repeat_state === "track"
                                    ? "repeat-one"
                                    : "repeat"
                            }
                            size={30}
                            color={invertColors ? "black" : "white"}
                        />
                        <View
                            style={[
                                styles.shuffleIndicator,
                                (playbackState?.repeat_state === "context" ||
                                    playbackState?.repeat_state === "track") &&
                                [styles.activeShuffleIndicator, { backgroundColor: invertColors ? "black" : "white" }],
                            ]}
                        ></View>
                    </HapticPressable>
                </View>
                <View style={styles.musicControlsExtra}>
                    <HapticPressable onPress={handleToggleSaveTrack}>
                        <MaterialIcons
                            name={
                                isCurrentTrackSaved
                                    ? "favorite"
                                    : "favorite-outline"
                            }
                            size={30}
                            color={invertColors ? "black" : "white"}
                        />
                    </HapticPressable>
                    <HapticPressable
                        onPress={() => {
                            if (isOnline) {
                                router.push({ pathname: "/select-device" as any });
                            }
                        }}
                        disabled={!isOnline}
                        style={!isOnline && styles.disabledButton}
                    >
                        <MaterialIcons
                            name={"devices"}
                            size={30}
                            color={invertColors ? "black" : "white"}
                        />
                    </HapticPressable>
                    <HapticPressable
                        onPress={() => {
                            if (isOnline) {
                                handleNavigateToAddToPlaylist();
                            }
                        }}
                        disabled={!isOnline}
                        style={!isOnline && styles.disabledButton}
                    >
                        <MaterialIcons name="add" size={30} color={invertColors ? "black" : "white"} />
                    </HapticPressable>
                </View>
            </View>
        </ContentContainer >
    );
}

const styles = StyleSheet.create({
    centered: {
        justifyContent: "center",
        alignItems: "center",
    },
    content: {
        flex: 1,
        width: "100%",
        justifyContent: "flex-start",
        alignItems: "center",
    },
    albumArt: {
        width: 200,
        height: 200,
        marginBottom: 20,
    },
    placeholderImageContainer: {
        width: 200,
        height: 200,
        backgroundColor: "#282828",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 20,
    },
    trackInfoContainer: {
        alignItems: "center",
        width: "100%",
        marginBottom: 20,
    },
    trackName: {
        fontSize: 22,
        lineHeight: 24,
        textAlign: "center",
    },
    artistName: {
        fontSize: 14,
        lineHeight: 16,
        textAlign: "center",
    },
    emptyText: {
        fontSize: 18,
        textAlign: "center",
        marginTop: 20,
    },
    timeIndicatorContainer: {
        width: "100%",
        alignItems: "center",
    },
    progressBarPressable: {
        width: "90%",
    },
    progressBarBackground: {
        height: 2,
        width: "100%",
        overflow: "visible",
        marginBottom: 3,
    },
    progressBarForeground: {
        height: 6,
        position: "absolute",
        top: -2,
    },
    progressBarInfo: {
        flexDirection: "row",
        width: "90%",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 6,
    },
    musicControls: {
        flexDirection: "row",
        width: "92%",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: 20,
    },
    musicControlsExtra: {
        flexDirection: "row",
        width: "92%",
        alignItems: "center",
        justifyContent: "space-between",
    },
    shuffleIndicator: {
        height: 1,
        width: "100%",
        overflow: "visible",
    },
    activeShuffleIndicator: {
        height: 1,
        width: "100%",
        overflow: "visible",
    },
    timeText: {
        fontSize: 12,
    },
    disabledButton: {
        opacity: 0.3,
    },
});
