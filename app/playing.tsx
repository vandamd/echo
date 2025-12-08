import React, { useState, useRef, useEffect, useCallback } from "react";
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
    SpotifyEpisode,
} from "@/contexts/AuthContext";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import { HapticPressable } from "@/components/HapticPressable";
import ContentContainer from "@/components/ContentContainer";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { log, logError } from "@/utils/logger";
import { usePreventDoubleTap } from "@/hooks/usePreventDoubleTap";

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
    const [pendingSaveOperation, setPendingSaveOperation] = useState(false);
    const [optimisticSaveState, setOptimisticSaveState] = useState<boolean | null>(null);

    const progress = useRef(new Animated.Value(0)).current;
    const progressBarWidthRef = useRef<number | null>(null);
    const appStateRef = useRef(appState);
    const isFocusedRef = useRef(true);
    const lastCheckedTrackUriRef = useRef<string | null>(null);
    const pausePollingUntilRef = useRef<number | null>(null);

    // Check if device is online
    const isOnline = networkState.isConnected && networkState.isInternetReachable;

    useEffect(() => {
        appStateRef.current = appState;
    }, [appState]);

    const checkIfTrackIsSaved = useCallback(async (
        state: SpotifyCurrentlyPlaying | null
    ): Promise<void> => {
        if (pausePollingUntilRef.current && Date.now() < pausePollingUntilRef.current) {
            return;
        }

        const item = state?.item;
        const trackId = item && "id" in item ? (item as { id?: string }).id : null;
        const trackUri = item && "uri" in item ? (item as { uri?: string }).uri : null;
        const normalizedTrackUri = trackUri || (trackId ? `spotify:track:${trackId}` : null);
        const isEpisode = state?.currently_playing_type === "episode" ||
            (item && "isEpisode" in item ? (item as any).isEpisode : false);

        if (!normalizedTrackUri || state?.currently_playing_type !== "track" || isEpisode) {
            lastCheckedTrackUriRef.current = null;
            setIsCurrentTrackSaved(false);
            return;
        }

        if (lastCheckedTrackUriRef.current === normalizedTrackUri) {
            return;
        }

        const result = await getLibraryState(normalizedTrackUri);
        if (result) {
            lastCheckedTrackUriRef.current = normalizedTrackUri;
            setIsCurrentTrackSaved(result.isAdded);
        } else {
            lastCheckedTrackUriRef.current = null;
        }
    }, [getLibraryState]);

    const fetchAndUpdatePlaybackState = useCallback(async () => {
        const state = (await getPlaybackState()) as SpotifyCurrentlyPlaying | null;
        setPlaybackState(state);

        if (state && state.item && "duration_ms" in state.item) {
            if (state.progress_ms !== null && state.item.duration_ms) {
                const progressRatio = state.progress_ms / state.item.duration_ms;
                progress.setValue(progressRatio > 0 ? progressRatio : 0);
            } else {
                progress.setValue(0);
            }
        } else {
            progress.setValue(0);
        }

        await checkIfTrackIsSaved(state);

        return state;
    }, [checkIfTrackIsSaved, getPlaybackState, progress]);

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

    const handleSeekBackward = async () => {
        if (!playbackState || !playbackState.item) return;

        const currentPosition = playbackState.progress_ms ?? 0;
        const newPosition = Math.max(currentPosition - 15000, 0);

        try {
            await seekToPosition(newPosition);
            const totalDuration = playbackState.item.duration_ms;
            if (totalDuration) {
                const progressRatio = newPosition / totalDuration;
                progress.setValue(progressRatio > 0 ? progressRatio : 0);
            }
            await fetchAndUpdatePlaybackState();
        } catch (error) {
            logError("Error seeking backward:", error);
        }
    };

    const handleSeekForward = async () => {
        if (!playbackState || !playbackState.item) return;

        const currentPosition = playbackState.progress_ms ?? 0;
        const totalDuration = playbackState.item.duration_ms;
        if (!totalDuration) return;

        const newPosition = Math.min(currentPosition + 15000, totalDuration);

        try {
            await seekToPosition(newPosition);
            const progressRatio = newPosition / totalDuration;
            progress.setValue(progressRatio > 0 ? progressRatio : 0);
            await fetchAndUpdatePlaybackState();
        } catch (error) {
            logError("Error seeking forward:", error);
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
        const isEpisodeItem =
            playbackState?.item &&
            ("isEpisode" in playbackState.item
                ? (playbackState.item as any).isEpisode
                : false);

        if (
            !playbackState ||
            !playbackState.item ||
            !playbackState.item.id ||
            playbackState.currently_playing_type !== "track" ||
            isEpisodeItem
        )
            return;

        const trackId = playbackState.item.id;
        const currentlySaved = isCurrentTrackSaved;
        const trackUri = `spotify:track:${trackId}`;

        setPendingSaveOperation(true);
        setOptimisticSaveState(!currentlySaved);
        setIsCurrentTrackSaved(!currentlySaved);
        pausePollingUntilRef.current = Date.now() + 3000;

        const success = currentlySaved
            ? await removeFromLibrary(trackUri)
            : await addToLibrary(trackUri);

        if (success) {
            setTimeout(() => {
                setOptimisticSaveState(null);
                pausePollingUntilRef.current = null;
                lastCheckedTrackUriRef.current = null;
            }, 3000);
        } else {
            setIsCurrentTrackSaved(currentlySaved);
            setOptimisticSaveState(null);
            pausePollingUntilRef.current = null;
        }
        setPendingSaveOperation(false);
    };

    const handleNavigateToAddToPlaylist = usePreventDoubleTap(() => {
        const isEpisodeItem =
            playbackState &&
            playbackState.item &&
            "isEpisode" in playbackState.item
                ? (playbackState.item as any).isEpisode
                : false;

        if (
            playbackState &&
            playbackState.item &&
            playbackState.item.uri &&
            playbackState.currently_playing_type === "track" &&
            !isEpisodeItem
        ) {
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
    });

    useFocusEffect(
        React.useCallback(() => {
            isFocusedRef.current = true;

            const fetchAll = async () => {
                if (!isFocusedRef.current || appStateRef.current !== "active") {
                    return;
                }

                await fetchAndUpdatePlaybackState();
            };

            fetchAll();

            const intervalId = setInterval(fetchAll, 1000);

            return () => {
                isFocusedRef.current = false;
                clearInterval(intervalId);
                log("PlayingScreen unfocused, cleared interval.");
            };
        }, [fetchAndUpdatePlaybackState])
    );

    const getArtistNames = (artists: SpotifyArtistSimple[]) => {
        return artists.map((artist) => artist.name).join(", ");
    };


    const item = playbackState?.item ?? null;

    const isEpisode =
        playbackState?.currently_playing_type === "episode" ||
        item?.type === "episode" ||
        (item && "isEpisode" in item && (item as any).isEpisode);
    const currentEpisode = isEpisode
        ? (item as unknown as SpotifyEpisode)
        : null;
    const artworkUrl = isEpisode
        ? currentEpisode?.images?.[0]?.url || currentEpisode?.show?.images?.[0]?.url
        : item?.album?.images?.[0]?.url;
    const displayTitle = isEpisode ? currentEpisode?.name ?? "" : item?.name ?? "";
    const subtitleParts = isEpisode
        ? [currentEpisode?.show?.name, currentEpisode?.show?.publisher].filter(
              (value): value is string => !!value
          )
        : [];
    const displaySubtitle = isEpisode
        ? subtitleParts.length > 0
            ? subtitleParts.join(" • ")
            : "Podcast"
        : item
            ? getArtistNames(item.artists)
            : "";
    const canNavigateToShow =
        isEpisode && isOnline && !!currentEpisode?.show?.id;
    const canNavigateToAlbum =
        !isEpisode && isOnline && !!item?.album?.id;
    const canNavigateToArtist =
        !isEpisode && isOnline && !!item && item.artists.length > 0;

    const animatedWidth = progress.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", "100%"],
    });

    const handleTitlePress = usePreventDoubleTap(async () => {
        if (!isOnline || !item) return;
        if (isEpisode && currentEpisode?.show?.id) {
            router.push({
                pathname: "/podcast/[id]",
                params: {
                    id: currentEpisode.show.id,
                    showName: currentEpisode.show.name as string,
                },
            } as any);
        } else if (item.album?.id) {
            router.push({
                pathname: "/album/[id]",
                params: {
                    id: item.album.id as any,
                    albumName: item.album.name as string,
                },
            });
        }
    });

    const handleSubtitlePress = usePreventDoubleTap(async () => {
        if (!isOnline || !item) return;
        if (isEpisode && currentEpisode?.show?.id) {
            router.push({
                pathname: "/podcast/[id]",
                params: {
                    id: currentEpisode.show.id,
                    showName: currentEpisode.show.name as string,
                },
            } as any);
        } else if (item.artists.length > 0) {
            const artist = item.artists[0];
            router.push({
                pathname: "/artist/[id]",
                params: {
                    id: artist.id,
                    artistName: artist.name as string,
                },
            });
        }
    });

    const handleSelectDevicePress = usePreventDoubleTap(() => {
        if (isOnline) {
            router.push({ pathname: "/select-device" as any });
        }
    });

    if (!playbackState || !item) {
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

    return (
        <ContentContainer headerTitle=" " style={{ paddingHorizontal: 20 }}>
            <View style={styles.content}>
                {artworkUrl ? (
                    <Image source={{ uri: artworkUrl }} style={styles.albumArt} />
                ) : (
                    <View style={styles.placeholderImageContainer}>
                        <MaterialIcons
                            name={isEpisode ? "mic" : "music-note"}
                            size={100}
                            color={invertColors ? "black" : "white"}
                        />
                    </View>
                )}
                <View style={styles.trackInfoContainer}>
                    <HapticPressable
                        onPress={handleTitlePress}
                        disabled={!(isEpisode ? canNavigateToShow : canNavigateToAlbum)}
                    >
                        <StyledText style={styles.trackName} numberOfLines={1}>
                            {displayTitle}
                        </StyledText>
                    </HapticPressable>
                    <HapticPressable
                        onPress={handleSubtitlePress}
                        disabled={!(isEpisode ? canNavigateToShow : canNavigateToArtist)}
                    >
                        <StyledText style={styles.artistName} numberOfLines={1}>
                            {displaySubtitle}
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
                    {isEpisode ? (
                        <>
                            <HapticPressable onPress={handleSeekBackward}>
                                <MaterialCommunityIcons
                                    name="rewind-15"
                                    size={44}
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
                            <HapticPressable onPress={handleSeekForward}>
                                <MaterialCommunityIcons
                                    name="fast-forward-15"
                                    size={44}
                                    color={invertColors ? "black" : "white"}
                                />
                            </HapticPressable>
                        </>
                    ) : (
                        <>
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
                        </>
                    )}
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
                    <HapticPressable
                        onPress={handleToggleSaveTrack}
                        disabled={pendingSaveOperation || isEpisode || !isOnline}
                        style={(isEpisode || pendingSaveOperation || !isOnline) && styles.disabledButton}
                    >
                        <MaterialIcons
                            name={
                                (optimisticSaveState ?? isCurrentTrackSaved)
                                    ? "favorite"
                                    : "favorite-outline"
                            }
                            size={30}
                            color={invertColors ? "black" : "white"}
                        />
                    </HapticPressable>
                    <HapticPressable
                        onPress={handleSelectDevicePress}
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
                            if (isOnline && !isEpisode) {
                                handleNavigateToAddToPlaylist();
                            }
                        }}
                        disabled={!isOnline || isEpisode}
                        style={(!isOnline || isEpisode) && styles.disabledButton}
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
