import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import AutoScroll from "@homielab/react-native-auto-scroll";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  View,
} from "react-native";
import { useAuth } from "@/features/auth";
import { usePlayback } from "@/features/playback";
import { useSettings } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import { FallbackImage } from "@/shared/components/FallbackImage";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { StyledText } from "@/shared/components/StyledText";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import type {
  SpotifyCurrentlyPlaying,
  SpotifyEpisode,
  SpotifyTrackSimple,
} from "@/shared/types/spotify";
import {
  getArtistNames,
  log,
  logError,
  n,
  setAlbumNavigationImage,
} from "@/shared/utils";

function MarqueeText({
  children,
  style,
  msPerChar = 250,
  delay = 1250,
  isActive = true,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  msPerChar?: number;
  delay?: number;
  isActive?: boolean;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  }, []);

  const handleTextLayout = useCallback((event: LayoutChangeEvent) => {
    setTextWidth(event.nativeEvent.layout.width);
  }, []);

  const shouldScroll =
    isActive && textWidth > containerWidth + 5 && containerWidth > 0;
  const duration = children.length * msPerChar;

  return (
    <View onLayout={handleContainerLayout} style={styles.marqueeContainer}>
      <View pointerEvents="none" style={styles.marqueeMeasuringContainer}>
        <StyledText onLayout={handleTextLayout} style={style}>
          {children}
        </StyledText>
      </View>

      {shouldScroll ? (
        <AutoScroll
          delay={delay}
          duration={duration}
          endPaddingWidth={n(25)}
          style={styles.marqueeScrollContainer}
        >
          <StyledText style={style}>{children}</StyledText>
        </AutoScroll>
      ) : (
        <StyledText numberOfLines={1} style={style}>
          {children}
        </StyledText>
      )}
    </View>
  );
}

let cachedPlaybackState: SpotifyCurrentlyPlaying | null = null;
interface PlayingRouteParams {
  trackName?: string;
  artistName?: string;
  albumArtUrl?: string;
  durationMs?: string;
  sourceContext?: string;
}
const ROUTE_PLAYBACK_TIMEOUT_MS = 4000;

const formatTime = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) {
    return "0:00";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

const getRouteTrackKey = (params: PlayingRouteParams): string | null => {
  if (!params.trackName) {
    return null;
  }

  return [
    params.trackName,
    params.artistName ?? "",
    params.durationMs ?? "",
  ].join("::");
};

const getPlaybackTrackKey = (
  state: SpotifyCurrentlyPlaying | null
): string | null => {
  const item = state?.item;
  if (
    !item ||
    state?.currently_playing_type !== "track" ||
    item.type === "episode"
  ) {
    return null;
  }

  const track = item as SpotifyTrackSimple;
  return [
    track.name ?? "",
    getArtistNames(track.artists ?? []),
    track.duration_ms?.toString() ?? "",
  ].join("::");
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: large screen component with playback controls
export default function PlayingScreen() {
  const { appState } = useAuth();
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
  } = usePlayback();
  const {
    invertColors,
    hideLikeButton,
    hideDevicesButton,
    hideAddToPlaylistButton,
    hideLyricsButton,
    hidePlayingCover,
  } = useSettings();
  const { isOnline } = useNetworkState();
  const params = useLocalSearchParams<{
    trackName?: string;
    artistName?: string;
    albumArtUrl?: string;
    durationMs?: string;
    sourceContext?: string;
  }>();

  const paramsState = params.trackName
    ? ({
        is_playing: true,
        progress_ms: 0,
        item: {
          name: params.trackName,
          artists: params.artistName
            ? [
                {
                  name: params.artistName,
                  id: "",
                  uri: "",
                  href: "",
                  type: "artist",
                  external_urls: { spotify: "" },
                },
              ]
            : [],
          album: params.albumArtUrl
            ? { images: [{ url: params.albumArtUrl }] }
            : undefined,
          duration_ms: params.durationMs
            ? Number.parseInt(params.durationMs, 10)
            : 0,
          id: "",
          uri: "",
          type: "track",
        },
      } as SpotifyCurrentlyPlaying)
    : null;

  const initialState = paramsState ?? cachedPlaybackState;

  const [playbackState, setPlaybackState] =
    useState<SpotifyCurrentlyPlaying | null>(initialState);
  const [isRoutePlaybackPending, setIsRoutePlaybackPending] = useState(
    paramsState !== null
  );
  const [isCurrentTrackSaved, setIsCurrentTrackSaved] = useState(false);
  const [pendingSaveOperation, setPendingSaveOperation] = useState(false);
  const [optimisticSaveState, setOptimisticSaveState] = useState<
    boolean | null
  >(null);

  const progress = useRef(new Animated.Value(0)).current;
  const progressBarWidthRef = useRef<number | null>(null);
  const appStateRef = useRef(appState);
  const isFocusedRef = useRef(true);
  const lastCheckedTrackUriRef = useRef<string | null>(null);
  const pausePollingUntilRef = useRef<number | null>(null);
  const routePlaybackExpiresAtRef = useRef<number | null>(
    paramsState !== null ? Date.now() + ROUTE_PLAYBACK_TIMEOUT_MS : null
  );

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  const clearPendingRoutePlayback = useCallback(() => {
    routePlaybackExpiresAtRef.current = null;
    setIsRoutePlaybackPending(false);
  }, []);

  const routeTrackKey = getRouteTrackKey(params);
  const isPendingRoutePlayback = isRoutePlaybackPending && paramsState !== null;
  const isPendingLikedSongPlayback =
    isPendingRoutePlayback && params.sourceContext === "liked";
  const visiblePlaybackState = isPendingRoutePlayback
    ? paramsState
    : playbackState;
  const displayedLikeState =
    isPendingLikedSongPlayback || (optimisticSaveState ?? isCurrentTrackSaved);

  useEffect(() => {
    if (!isPendingRoutePlayback) {
      return;
    }

    progress.setValue(0);
    lastCheckedTrackUriRef.current = null;
    setIsCurrentTrackSaved(isPendingLikedSongPlayback);
    setOptimisticSaveState(null);
  }, [isPendingLikedSongPlayback, isPendingRoutePlayback, progress]);

  const checkIfTrackIsSaved = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: track save check with multiple conditions
    async (state: SpotifyCurrentlyPlaying | null): Promise<void> => {
      if (
        pausePollingUntilRef.current &&
        Date.now() < pausePollingUntilRef.current
      ) {
        return;
      }

      const item = state?.item;
      const trackId =
        item && "id" in item ? (item as { id?: string }).id : null;
      const trackUri =
        item && "uri" in item ? (item as { uri?: string }).uri : null;
      const normalizedTrackUri =
        trackUri || (trackId ? `spotify:track:${trackId}` : null);
      const isEpisode =
        state?.currently_playing_type === "episode" || item?.type === "episode";

      if (
        !normalizedTrackUri ||
        state?.currently_playing_type !== "track" ||
        isEpisode
      ) {
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
    },
    [getLibraryState]
  );

  const fetchAndUpdatePlaybackState = useCallback(async () => {
    const state = (await getPlaybackState()) as SpotifyCurrentlyPlaying | null;
    const playbackTrackKey = getPlaybackTrackKey(state);

    if (
      isRoutePlaybackPending &&
      (playbackTrackKey === routeTrackKey ||
        (routePlaybackExpiresAtRef.current !== null &&
          Date.now() >= routePlaybackExpiresAtRef.current))
    ) {
      clearPendingRoutePlayback();
    }

    if (state) {
      cachedPlaybackState = state;
    }
    setPlaybackState(state);

    if (state?.item && "duration_ms" in state.item) {
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
  }, [
    checkIfTrackIsSaved,
    clearPendingRoutePlayback,
    getPlaybackState,
    isRoutePlaybackPending,
    progress,
    routeTrackKey,
  ]);

  const handlePlayPause = async () => {
    if (!playbackState) {
      return;
    }

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
      clearPendingRoutePlayback();
      await fetchAndUpdatePlaybackState();
    } catch (error) {
      logError("Error skipping to next track:", error);
    }
  };

  const handleSkipToPrevious = async () => {
    try {
      await skipToPrevious();
      clearPendingRoutePlayback();
      await fetchAndUpdatePlaybackState();
    } catch (error) {
      logError("Error skipping to previous track:", error);
    }
  };

  const handleSeekBackward = async () => {
    if (!playbackState?.item) {
      return;
    }

    const currentPosition = playbackState.progress_ms ?? 0;
    const newPosition = Math.max(currentPosition - 15_000, 0);

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
    if (!playbackState?.item) {
      return;
    }

    const currentPosition = playbackState.progress_ms ?? 0;
    const totalDuration = playbackState.item.duration_ms;
    if (!totalDuration) {
      return;
    }

    const newPosition = Math.min(currentPosition + 15_000, totalDuration);

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
    if (!playbackState) {
      return;
    }

    try {
      await toggleShuffle(!playbackState.shuffle_state);
      await fetchAndUpdatePlaybackState();
    } catch (error) {
      logError("Error toggling shuffle:", error);
    }
  };

  const handleRepeatToggle = async () => {
    if (!playbackState) {
      return;
    }

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

  const handleProgressBarSeek = async (event: GestureResponderEvent) => {
    if (!(playbackState?.item && progressBarWidthRef.current)) {
      return;
    }

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
    if (
      !playbackState?.item?.id ||
      playbackState.currently_playing_type !== "track" ||
      playbackState.item.type === "episode"
    ) {
      return;
    }

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
    if (
      playbackState?.item?.uri &&
      playbackState.currently_playing_type === "track" &&
      playbackState.item.type !== "episode"
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

  const handleNavigateToLyrics = usePreventDoubleTap(() => {
    if (
      playbackState?.item &&
      playbackState.currently_playing_type === "track" &&
      playbackState.item.type !== "episode"
    ) {
      const track = playbackState.item as SpotifyTrackSimple;
      log("Navigating to lyrics with track:", track.name);
      router.push({
        pathname: "/lyrics",
        params: {
          trackName: track.name,
          artistName: getArtistNames(track.artists),
          albumName: track.album?.name,
          durationMs: track.duration_ms?.toString(),
        },
      });
    } else {
      console.warn("Cannot navigate to lyrics: No track playing.");
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

  const item = visiblePlaybackState?.item ?? null;

  const isEpisode =
    visiblePlaybackState?.currently_playing_type === "episode" ||
    item?.type === "episode";
  const currentEpisode = isEpisode ? (item as SpotifyEpisode) : null;
  const currentTrack = !isEpisode && item ? (item as SpotifyTrackSimple) : null;
  const artworkUrl =
    (isPendingRoutePlayback && params.albumArtUrl) ||
    (isEpisode
      ? currentEpisode?.images?.[0]?.url ||
        currentEpisode?.show?.images?.[0]?.url
      : currentTrack?.album?.images?.[0]?.url);
  const displayTitle = isEpisode
    ? (currentEpisode?.name ?? "")
    : (currentTrack?.name ?? "");
  const subtitleParts = isEpisode
    ? [currentEpisode?.show?.name, currentEpisode?.show?.publisher].filter(
        (value): value is string => !!value
      )
    : [];
  const episodeSubtitle =
    subtitleParts.length > 0 ? subtitleParts.join(" • ") : "Podcast";
  const trackSubtitle = currentTrack
    ? getArtistNames(currentTrack.artists)
    : "";
  const displaySubtitle = isEpisode ? episodeSubtitle : trackSubtitle;
  const canNavigateToShow = isEpisode && isOnline && !!currentEpisode?.show?.id;
  const canNavigateToAlbum =
    !isEpisode && isOnline && !!currentTrack?.album?.id;

  const visibleButtonCount = [
    !hideLikeButton,
    !hideDevicesButton,
    !hideAddToPlaylistButton,
    !hideLyricsButton,
  ].filter(Boolean).length;

  const animatedWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const progressBarWidth = isPendingRoutePlayback ? "0%" : animatedWidth;

  const handleTitlePress = usePreventDoubleTap(() => {
    if (!isOnline) {
      return;
    }
    if (isEpisode && currentEpisode?.show?.id) {
      router.push({
        pathname: "/podcast/[id]",
        params: {
          id: currentEpisode.show.id,
          showName: currentEpisode.show.name as string,
        },
      } as never);
    } else if (currentTrack?.album?.id) {
      if (artworkUrl) {
        setAlbumNavigationImage(currentTrack.album.id, artworkUrl);
      }
      router.push({
        pathname: "/album/[id]",
        params: {
          id: currentTrack.album.id,
          albumName: currentTrack.album.name as string,
        },
      });
    }
  });

  const handleSubtitlePress = usePreventDoubleTap(() => {
    if (!isOnline) {
      return;
    }
    if (isEpisode && currentEpisode?.show?.id) {
      router.push({
        pathname: "/podcast/[id]",
        params: {
          id: currentEpisode.show.id,
          showName: currentEpisode.show.name as string,
        },
      } as never);
    }
  });

  const handleSelectDevicePress = usePreventDoubleTap(() => {
    if (isOnline) {
      router.push({ pathname: "/select-device" as never });
    }
  });

  if (!(visiblePlaybackState && item)) {
    return (
      <ContentContainer headerTitle=" " style={{ paddingHorizontal: n(20) }}>
        <View style={styles.content}>
          <View style={styles.mainContent}>
            {!hidePlayingCover && (
              <View style={styles.placeholderImageContainer} />
            )}
            <View style={styles.trackInfoContainer}>
              <StyledText numberOfLines={1} style={styles.trackName}>
                No song playing
              </StyledText>
              <StyledText numberOfLines={1} style={styles.artistName}>
                Go back and play something!
              </StyledText>
            </View>

            <View style={styles.timeIndicatorContainer}>
              <View style={styles.progressBarPressable}>
                <View style={[styles.progressBarBackground, { opacity: 0 }]} />
              </View>
              <View style={styles.progressBarInfo}>
                <StyledText style={[styles.timeText, { opacity: 0 }]}>
                  0:00
                </StyledText>
                <StyledText style={[styles.timeText, { opacity: 0 }]}>
                  0:00
                </StyledText>
              </View>
            </View>
            <View style={[styles.musicControls, { opacity: 0 }]}>
              <MaterialIcons color="transparent" name="shuffle" size={n(30)} />
              <MaterialIcons
                color="transparent"
                name="skip-previous"
                size={n(52)}
              />
              <MaterialIcons
                color="transparent"
                name="play-arrow"
                size={n(52)}
              />
              <MaterialIcons
                color="transparent"
                name="skip-next"
                size={n(52)}
              />
              <MaterialIcons color="transparent" name="repeat" size={n(30)} />
            </View>
          </View>
          {visibleButtonCount > 0 && (
            <View style={[styles.musicControlsExtra, { opacity: 0 }]}>
              <MaterialIcons
                color="transparent"
                name="favorite-outline"
                size={n(30)}
              />
            </View>
          )}
        </View>
      </ContentContainer>
    );
  }

  return (
    <ContentContainer headerTitle=" " style={{ paddingHorizontal: n(20) }}>
      <View style={styles.content}>
        <View style={styles.mainContent}>
          {!hidePlayingCover && (
            <FallbackImage
              placeholderIcon={isEpisode ? "mic" : "music-note"}
              placeholderIconColor={invertColors ? "black" : "white"}
              style={styles.albumArt}
              uri={artworkUrl}
            />
          )}
          <View style={styles.trackInfoContainer}>
            <HapticPressable
              disabled={!(isEpisode ? canNavigateToShow : canNavigateToAlbum)}
              onPress={handleTitlePress}
            >
              <MarqueeText
                isActive={isFocusedRef.current}
                style={styles.trackName}
              >
                {displayTitle}
              </MarqueeText>
            </HapticPressable>
            <HapticPressable
              disabled={!canNavigateToShow}
              onPress={handleSubtitlePress}
            >
              <StyledText numberOfLines={1} style={styles.artistName}>
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
                onLayout={(event) => {
                  progressBarWidthRef.current = event.nativeEvent.layout.width;
                }}
                style={[
                  styles.progressBarBackground,
                  { backgroundColor: invertColors ? "black" : "white" },
                ]}
              >
                <Animated.View
                  style={[
                    styles.progressBarForeground,
                    { backgroundColor: invertColors ? "black" : "white" },
                    { width: progressBarWidth },
                  ]}
                />
              </View>
            </HapticPressable>
            <View style={styles.progressBarInfo}>
              <StyledText style={styles.timeText}>
                {formatTime(visiblePlaybackState.progress_ms)}
              </StyledText>
              <StyledText style={styles.timeText}>
                {formatTime(item.duration_ms)}
              </StyledText>
            </View>
          </View>
          <View style={styles.musicControls}>
            <HapticPressable onPress={handleShuffleToggle}>
              <MaterialIcons
                color={invertColors ? "black" : "white"}
                name={"shuffle"}
                size={n(30)}
              />
              <View
                style={[
                  styles.shuffleIndicator,
                  playbackState?.shuffle_state && [
                    styles.activeShuffleIndicator,
                    { backgroundColor: invertColors ? "black" : "white" },
                  ],
                ]}
              />
            </HapticPressable>
            {isEpisode ? (
              <>
                <HapticPressable onPress={handleSeekBackward}>
                  <MaterialCommunityIcons
                    color={invertColors ? "black" : "white"}
                    name="rewind-15"
                    size={n(44)}
                  />
                </HapticPressable>
                <HapticPressable onPress={handlePlayPause}>
                  <MaterialIcons
                    color={invertColors ? "black" : "white"}
                    name={
                      visiblePlaybackState.is_playing ? "pause" : "play-arrow"
                    }
                    size={n(52)}
                  />
                </HapticPressable>
                <HapticPressable onPress={handleSeekForward}>
                  <MaterialCommunityIcons
                    color={invertColors ? "black" : "white"}
                    name="fast-forward-15"
                    size={n(44)}
                  />
                </HapticPressable>
              </>
            ) : (
              <>
                <HapticPressable onPress={handleSkipToPrevious}>
                  <MaterialIcons
                    color={invertColors ? "black" : "white"}
                    name={"skip-previous"}
                    size={n(52)}
                  />
                </HapticPressable>
                <HapticPressable onPress={handlePlayPause}>
                  <MaterialIcons
                    color={invertColors ? "black" : "white"}
                    name={
                      visiblePlaybackState.is_playing ? "pause" : "play-arrow"
                    }
                    size={n(52)}
                  />
                </HapticPressable>
                <HapticPressable onPress={handleSkipToNext}>
                  <MaterialIcons
                    color={invertColors ? "black" : "white"}
                    name={"skip-next"}
                    size={n(52)}
                  />
                </HapticPressable>
              </>
            )}
            <HapticPressable onPress={handleRepeatToggle}>
              <MaterialIcons
                color={invertColors ? "black" : "white"}
                name={
                  playbackState?.repeat_state === "track"
                    ? "repeat-one"
                    : "repeat"
                }
                size={n(30)}
              />
              <View
                style={[
                  styles.shuffleIndicator,
                  (playbackState?.repeat_state === "context" ||
                    playbackState?.repeat_state === "track") && [
                    styles.activeShuffleIndicator,
                    { backgroundColor: invertColors ? "black" : "white" },
                  ],
                ]}
              />
            </HapticPressable>
          </View>
        </View>
        <View
          style={[
            styles.musicControlsExtra,
            visibleButtonCount === 1 && styles.musicControlsExtraCentered,
          ]}
        >
          {!hideLikeButton && (
            <HapticPressable
              disabled={
                pendingSaveOperation ||
                isEpisode ||
                !isOnline ||
                isPendingRoutePlayback
              }
              onPress={handleToggleSaveTrack}
              style={
                (isEpisode || pendingSaveOperation || !isOnline) &&
                styles.disabledButton
              }
            >
              <MaterialIcons
                color={invertColors ? "black" : "white"}
                name={displayedLikeState ? "favorite" : "favorite-outline"}
                size={n(30)}
              />
            </HapticPressable>
          )}
          {!hideDevicesButton && (
            <HapticPressable
              disabled={!isOnline}
              onPress={handleSelectDevicePress}
              style={!isOnline && styles.disabledButton}
            >
              <MaterialIcons
                color={invertColors ? "black" : "white"}
                name={"devices"}
                size={n(30)}
              />
            </HapticPressable>
          )}
          {!hideLyricsButton && (
            <HapticPressable
              disabled={!isOnline || isEpisode || isPendingRoutePlayback}
              onPress={() => {
                if (isOnline && !isEpisode && !isPendingRoutePlayback) {
                  handleNavigateToLyrics();
                }
              }}
              style={(!isOnline || isEpisode) && styles.disabledButton}
            >
              <MaterialIcons
                color={invertColors ? "black" : "white"}
                name="mic-external-on"
                size={n(30)}
              />
            </HapticPressable>
          )}
          {!hideAddToPlaylistButton && (
            <HapticPressable
              disabled={!isOnline || isEpisode || isPendingRoutePlayback}
              onPress={() => {
                if (isOnline && !isEpisode && !isPendingRoutePlayback) {
                  handleNavigateToAddToPlaylist();
                }
              }}
              style={(!isOnline || isEpisode) && styles.disabledButton}
            >
              <MaterialIcons
                color={invertColors ? "black" : "white"}
                name="add"
                size={n(30)}
              />
            </HapticPressable>
          )}
        </View>
      </View>
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: "100%",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mainContent: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },
  albumArt: {
    width: n(200),
    height: n(200),
    marginBottom: n(20),
  },
  placeholderImageContainer: {
    width: n(200),
    height: n(200),
    backgroundColor: "#282828",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: n(20),
  },
  placeholderImageContainerNoGap: {
    width: n(200),
    height: n(200),
    backgroundColor: "#282828",
    justifyContent: "center",
    alignItems: "center",
  },
  trackInfoContainer: {
    alignItems: "center",
    width: "90%",
    marginBottom: n(20),
  },
  trackName: {
    fontSize: n(22),
    lineHeight: n(24),
    textAlign: "center",
  },
  artistName: {
    fontSize: n(14),
    lineHeight: n(16),
    textAlign: "center",
  },
  emptyText: {
    fontSize: n(18),
    textAlign: "center",
    marginTop: n(20),
  },
  timeIndicatorContainer: {
    width: "100%",
    alignItems: "center",
  },
  progressBarPressable: {
    width: "90%",
  },
  progressBarBackground: {
    height: n(2),
    width: "100%",
    overflow: "visible",
    marginBottom: n(3),
  },
  progressBarForeground: {
    height: n(6),
    position: "absolute",
    top: n(-2),
  },
  progressBarInfo: {
    flexDirection: "row",
    width: "90%",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: n(6),
  },
  musicControls: {
    flexDirection: "row",
    width: "92%",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: n(20),
  },
  musicControlsExtra: {
    flexDirection: "row",
    width: "92%",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: n(20),
  },
  musicControlsExtraCentered: {
    justifyContent: "center",
  },
  shuffleIndicator: {
    height: n(1),
    width: "100%",
    overflow: "visible",
  },
  activeShuffleIndicator: {
    height: n(1),
    width: "100%",
    overflow: "visible",
  },
  timeText: {
    fontSize: n(12),
  },
  disabledButton: {
    opacity: 0.3,
  },
  marqueeContainer: {
    width: "100%",
    overflow: "hidden",
  },
  marqueeMeasuringContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    opacity: 0,
  },
  marqueeScrollContainer: {
    width: "100%",
  },
});
