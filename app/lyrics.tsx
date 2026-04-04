import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  findActiveLyricIndex,
  getEffectiveProgressMs,
  type LyricsTrackInfo,
  useLyrics,
} from "@/features/lyrics";
import { useLivePlaybackState, usePlayback } from "@/features/playback";
import { useSettings } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import { StyledText } from "@/shared/components/StyledText";
import { getArtistNames, logError, n } from "@/shared/utils";

interface LineLayout {
  height: number;
  y: number;
}

interface PendingSeek {
  isPlaying: boolean;
  progressMs: number;
  startedAt: number;
  trackKey: string;
}

export default function LyricsScreen() {
  const isFocused = useIsFocused();
  const { seekToPosition } = usePlayback();
  const { triggerHaptic } = useSettings();
  const { snapshot, hasResolvedInitialState } = useLivePlaybackState();
  const params = useLocalSearchParams<{
    trackName?: string;
    artistName?: string;
    albumName?: string;
    durationMs?: string;
  }>();

  const routeTrack = useMemo<LyricsTrackInfo | null>(() => {
    if (!(params.trackName && params.durationMs)) {
      return null;
    }

    const durationMs = Number.parseInt(params.durationMs, 10);
    if (Number.isNaN(durationMs)) {
      return null;
    }

    return {
      name: params.trackName,
      artistName: params.artistName ?? "",
      albumName: params.albumName,
      durationMs,
    };
  }, [
    params.albumName,
    params.artistName,
    params.durationMs,
    params.trackName,
  ]);

  const liveTrack = useMemo<LyricsTrackInfo | null>(() => {
    const track = snapshot?.track;
    if (
      !track ||
      snapshot.currentlyPlayingType !== "track" ||
      track.type === "episode"
    ) {
      return null;
    }

    return {
      name: track.name,
      artistName: getArtistNames(track.artists),
      albumName: track.album?.name,
      durationMs: track.duration_ms ?? 0,
    };
  }, [snapshot]);

  const track = liveTrack ?? (hasResolvedInitialState ? null : routeTrack);
  const { data, isLoading, isResolved, trackKey } = useLyrics(track);
  const [isFollowing, setIsFollowing] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const lineLayoutsRef = useRef<Record<number, LineLayout>>({});
  const isFollowingRef = useRef(true);
  const pendingScrollIndexRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<PendingSeek | null>(null);
  const contentHeightRef = useRef(0);
  const containerHeightRef = useRef(0);

  const syncedLines = data?.syncedLines ?? [];
  const plainLines = data?.plainLines ?? [];
  const lyricsResponse = data?.response ?? null;
  const showResyncButton = syncedLines.length > 0 && !isFollowing;
  const plainLineEntries = useMemo(() => {
    const counts = new Map<string, number>();

    return plainLines.map((line) => {
      const occurrence = counts.get(line) ?? 0;
      counts.set(line, occurrence + 1);

      return {
        key: `${line}-${occurrence}`,
        text: line,
      };
    });
  }, [plainLines]);

  useEffect(() => {
    isFollowingRef.current = isFollowing;
  }, [isFollowing]);

  useEffect(() => {
    lineLayoutsRef.current = {};
    pendingScrollIndexRef.current = null;
    pendingSeekRef.current = null;
    isFollowingRef.current = true;
    setIsFollowing(true);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    if (!trackKey) {
      return;
    }
  }, [trackKey]);

  const scrollToLine = useCallback((index: number) => {
    const lineLayout = lineLayoutsRef.current[index];
    if (
      !lineLayout ||
      containerHeightRef.current <= 0 ||
      contentHeightRef.current <= 0
    ) {
      pendingScrollIndexRef.current = index;
      return false;
    }

    const maxOffset = Math.max(
      contentHeightRef.current - containerHeightRef.current,
      0
    );
    const targetOffset = Math.min(
      Math.max(
        lineLayout.y + lineLayout.height / 2 - containerHeightRef.current / 2,
        0
      ),
      maxOffset
    );

    pendingScrollIndexRef.current = null;
    scrollViewRef.current?.scrollTo({ y: targetOffset, animated: false });
    return true;
  }, []);

  const syncToIndex = useCallback(
    (nextIndex: number, shouldFollow: boolean) => {
      if (nextIndex < 0) {
        return;
      }

      if (!shouldFollow) {
        return;
      }

      scrollToLine(nextIndex);
    },
    [scrollToLine]
  );

  const syncToProgress = useCallback(
    (progressMs: number | null, shouldFollow = isFollowingRef.current) => {
      if (progressMs === null || syncedLines.length === 0) {
        syncToIndex(-1, shouldFollow);
        return;
      }

      syncToIndex(findActiveLyricIndex(syncedLines, progressMs), shouldFollow);
    },
    [syncToIndex, syncedLines]
  );

  const getDisplayProgressMs = useCallback(() => {
    const pendingSeek = pendingSeekRef.current;
    if (!pendingSeek || pendingSeek.trackKey !== trackKey) {
      return getEffectiveProgressMs(snapshot);
    }

    const elapsed = Date.now() - pendingSeek.startedAt;
    if (elapsed > 1500) {
      pendingSeekRef.current = null;
      return getEffectiveProgressMs(snapshot);
    }

    return pendingSeek.progressMs + (pendingSeek.isPlaying ? elapsed : 0);
  }, [snapshot, trackKey]);

  useEffect(() => {
    const pendingSeek = pendingSeekRef.current;
    if (
      pendingSeek &&
      snapshot &&
      pendingSeek.trackKey === trackKey &&
      snapshot.receivedAt >= pendingSeek.startedAt
    ) {
      pendingSeekRef.current = null;
    }
  }, [snapshot, trackKey]);

  useEffect(() => {
    if (!isFocused || syncedLines.length === 0 || !snapshot || !trackKey) {
      return;
    }

    const progressMs = getDisplayProgressMs();
    syncToProgress(progressMs);

    if (!snapshot.isPlaying) {
      return;
    }

    let rafId: number;
    const loop = () => {
      const currentProgressMs = getDisplayProgressMs();
      syncToProgress(currentProgressMs);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    getDisplayProgressMs,
    isFocused,
    snapshot,
    syncToProgress,
    syncedLines.length,
    trackKey,
  ]);

  const handleScrollBeginDrag = useCallback(() => {
    if (isFollowingRef.current) {
      isFollowingRef.current = false;
      setIsFollowing(false);
    }
  }, []);

  const handleResync = useCallback(() => {
    pendingSeekRef.current = null;
    isFollowingRef.current = true;
    setIsFollowing(true);
    const progressMs = getEffectiveProgressMs(snapshot);
    syncToProgress(progressMs, true);
  }, [snapshot, syncToProgress]);

  const handleLyricPress = useCallback(
    (index: number, progressMs: number) => {
      if (!trackKey) {
        return;
      }

      triggerHaptic();
      pendingSeekRef.current = {
        isPlaying: snapshot?.isPlaying ?? false,
        progressMs,
        startedAt: Date.now(),
        trackKey,
      };

      isFollowingRef.current = true;
      setIsFollowing(true);
      syncToIndex(index, true);

      seekToPosition(progressMs).catch((error) => {
        pendingSeekRef.current = null;
        syncToProgress(getEffectiveProgressMs(snapshot), true);
        logError("Lyrics: Failed to seek to lyric line:", error);
      });
    },
    [
      seekToPosition,
      snapshot,
      syncToIndex,
      syncToProgress,
      trackKey,
      triggerHaptic,
    ]
  );

  const handleContainerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      containerHeightRef.current = nextHeight;

      if (pendingScrollIndexRef.current !== null && isFollowingRef.current) {
        scrollToLine(pendingScrollIndexRef.current);
      }
    },
    [scrollToLine]
  );

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;

      if (pendingScrollIndexRef.current !== null && isFollowingRef.current) {
        scrollToLine(pendingScrollIndexRef.current);
      }
    },
    [scrollToLine]
  );

  const handleLineLayout = useCallback(
    (index: number, event: LayoutChangeEvent) => {
      lineLayoutsRef.current[index] = event.nativeEvent.layout;

      if (
        pendingScrollIndexRef.current === index &&
        isFollowingRef.current &&
        containerHeightRef.current > 0
      ) {
        scrollToLine(index);
      }
    },
    [scrollToLine]
  );

  const renderContent = () => {
    if (!track) {
      return (
        <View style={styles.centerContainer}>
          <StyledText style={styles.messageText}>No track playing</StyledText>
        </View>
      );
    }

    if (isLoading && !data) {
      return (
        <View style={styles.centerContainer}>
          <StyledText style={styles.messageText}>Loading lyrics...</StyledText>
        </View>
      );
    }

    if (!lyricsResponse) {
      return (
        <View style={styles.centerContainer}>
          <StyledText style={styles.messageText}>
            {isResolved ? "No lyrics found." : "Loading lyrics..."}
          </StyledText>
        </View>
      );
    }

    if (lyricsResponse.instrumental) {
      return (
        <View style={styles.centerContainer}>
          <StyledText style={styles.messageText}>Instrumental</StyledText>
        </View>
      );
    }

    if (syncedLines.length > 0) {
      return (
        <View onLayout={handleContainerLayout} style={styles.scrollContainer}>
          <ScrollView
            contentContainerStyle={styles.listContentContainer}
            onContentSizeChange={handleContentSizeChange}
            onScrollBeginDrag={handleScrollBeginDrag}
            overScrollMode="never"
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
          >
            {syncedLines.map((line, index) => (
              <View
                key={`${line.timeMs}-${index}`}
                onLayout={(event) => handleLineLayout(index, event)}
                style={styles.lineContainer}
              >
                <StyledText
                  onPress={() => handleLyricPress(index, line.timeMs)}
                  style={styles.lyricText}
                >
                  {line.text || " "}
                </StyledText>
              </View>
            ))}
          </ScrollView>
        </View>
      );
    }

    if (plainLines.length > 0) {
      return (
        <View style={styles.scrollContainer}>
          <ScrollView
            contentContainerStyle={styles.listContentContainer}
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
          >
            {plainLineEntries.map((line) => (
              <StyledText key={line.key} style={styles.lyricText}>
                {line.text || " "}
              </StyledText>
            ))}
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={styles.centerContainer}>
        <StyledText style={styles.messageText}>No lyrics available.</StyledText>
      </View>
    );
  };

  return (
    <ContentContainer
      headerIcon={showResyncButton ? "sync-alt" : undefined}
      headerIconPress={showResyncButton ? handleResync : undefined}
      headerIconShowLength={showResyncButton ? 1 : 0}
      headerTitle={track?.name || "Lyrics"}
      style={styles.content}
    >
      <View style={styles.container}>{renderContent()}</View>
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: n(20),
    paddingBottom: 0,
  },
  container: {
    flex: 1,
    width: "100%",
    paddingBottom: n(20),
  },
  scrollContainer: {
    flex: 1,
    width: "100%",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  listContentContainer: {
    gap: n(28),
  },
  lineContainer: {
    width: "100%",
  },
  lyricText: {
    fontSize: n(30),
  },
  messageText: {
    fontSize: n(18),
    textAlign: "center",
  },
});
