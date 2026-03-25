import { useFocusEffect } from "expo-router";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { type FlatList, StyleSheet, View } from "react-native";
import { usePlayback } from "@/features/playback";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { StyledText } from "@/shared/components/StyledText";
import type {
  SpotifyCurrentlyPlaying,
  SpotifyTrackSimple,
} from "@/shared/types/spotify";
import { getArtistNames, n } from "@/shared/utils";

interface LyricLine {
  timeMs: number;
  text: string;
}

const LRC_REGEX = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;

function parseSyncedLyrics(lyrics: string): LyricLine[] {
  const lines = lyrics.split("\n");
  const parsed: LyricLine[] = [];

  for (const line of lines) {
    const match = line.match(LRC_REGEX);
    if (!match) {
      continue;
    }

    const text = match[4].trim();
    if (!text) {
      continue;
    }

    const minutes = Number.parseInt(match[1], 10);
    const seconds = Number.parseInt(match[2], 10);
    let msStr = match[3];
    if (msStr.length === 2) {
      msStr += "0";
    }
    const ms = Number.parseInt(msStr, 10);
    const timeMs = minutes * 60_000 + seconds * 1000 + ms;

    parsed.push({ timeMs, text });
  }
  return parsed;
}

interface LrcLibResponse {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

function buildFetchParams(
  trackName: string,
  artistName: string,
  albumName: string | undefined,
  durationMs: number
): URLSearchParams {
  const params = new URLSearchParams();
  params.append("track_name", trackName);
  params.append("artist_name", artistName);
  if (albumName) {
    params.append("album_name", albumName);
  }
  params.append("duration", Math.round(durationMs / 1000).toString());
  return params;
}

function findActiveLine(syncedLines: LyricLine[], progressMs: number): number {
  return syncedLines.findIndex((line, i) => {
    const nextLine = syncedLines[i + 1];
    return (
      line.timeMs <= progressMs && (!nextLine || nextLine.timeMs > progressMs)
    );
  });
}

export default function LyricsScreen() {
  const { getPlaybackState } = usePlayback();

  const [trackInfo, setTrackInfo] = useState<{
    name: string;
    artistName: string;
    albumName: string | undefined;
    durationMs: number;
  } | null>(null);

  const [lyricsData, setLyricsData] = useState<LrcLibResponse | null>(null);
  const [syncedLines, setSyncedLines] = useState<LyricLine[]>([]);
  const [plainLines, setPlainLines] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [fetchDone, setFetchDone] = useState(false);

  const isFocusedRef = useRef(true);
  const flatListRef = useRef<FlatList>(null);
  const fetchedTrackKeyRef = useRef<string | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [isSynced, setIsSynced] = useState(true);
  const isSyncedRef = useRef(true);

  // Playback interpolation state
  const lastProgressRef = useRef(0);
  const lastPollTimeRef = useRef(Date.now());
  const isPlayingRef = useRef(false);
  const syncedLinesRef = useRef<LyricLine[]>([]);
  const activeIndexRef = useRef(-1);

  syncedLinesRef.current = syncedLines;
  activeIndexRef.current = activeIndex;
  isSyncedRef.current = isSynced;

  const handleResync = useCallback(() => {
    setIsSynced(true);
    isSyncedRef.current = true;

    const lines = syncedLinesRef.current;
    if (lines.length > 0 && isPlayingRef.current) {
      const elapsed = Date.now() - lastPollTimeRef.current;
      const estimatedProgress = lastProgressRef.current + elapsed;
      const newIdx = findActiveLine(lines, estimatedProgress);

      if (newIdx >= 0) {
        activeIndexRef.current = newIdx;
        setActiveIndex(newIdx);
      }
    }
  }, []);

  const handleScrollBeginDrag = useCallback(() => {
    if (isSyncedRef.current) {
      setIsSynced(false);
      isSyncedRef.current = false;
    }
  }, []);

  const fetchLyrics = useCallback(
    async (
      trackName: string,
      artistName: string,
      albumName: string | undefined,
      durationMs: number
    ) => {
      setLyricsData(null);
      setSyncedLines([]);
      syncedLinesRef.current = [];
      setPlainLines([]);
      setActiveIndex(-1);
      activeIndexRef.current = -1;
      setFetchDone(false);

      try {
        const params = buildFetchParams(
          trackName,
          artistName,
          albumName,
          durationMs
        );
        const headers = { "User-Agent": "Echo (https://github.com)" };

        let res = await fetch(
          `https://lrclib.net/api/get-cached?${params.toString()}`,
          { headers }
        );

        if (!res.ok) {
          res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
            headers,
          });
        }

        if (res.ok) {
          const data = (await res.json()) as LrcLibResponse;
          setLyricsData(data);

          if (data.syncedLyrics) {
            const parsed = parseSyncedLyrics(data.syncedLyrics);
            setSyncedLines(parsed);
            syncedLinesRef.current = parsed;
          } else if (data.plainLyrics) {
            setPlainLines(data.plainLyrics.split("\n").filter((l) => l.trim()));
          }
        }
      } catch {
        // fail silently
      } finally {
        setFetchDone(true);
      }
    },
    []
  );

  const onScrollToIndexFailed = useCallback(
    (info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }) => {
      setTimeout(() => {
        if (isFocusedRef.current && flatListRef.current) {
          flatListRef.current.scrollToIndex({
            index: info.index,
            animated: true,
            viewPosition: 0.5,
          });
        }
      }, 100);
    },
    []
  );

  useLayoutEffect(() => {
    if (activeIndex >= 0 && isFocusedRef.current && isSynced) {
      flatListRef.current?.scrollToIndex({
        index: activeIndex,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [activeIndex, isSynced]);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;

      // Animation frame loop — interpolates progress every ~16ms
      const animate = () => {
        if (!isFocusedRef.current) {
          return;
        }

        const lines = syncedLinesRef.current;
        if (lines.length > 0 && isPlayingRef.current) {
          const elapsed = Date.now() - lastPollTimeRef.current;
          const estimatedProgress = lastProgressRef.current + elapsed;
          const newIdx = findActiveLine(lines, estimatedProgress);

          if (newIdx >= 0 && newIdx !== activeIndexRef.current) {
            activeIndexRef.current = newIdx;
            setActiveIndex(newIdx);
          }
        }

        animFrameRef.current = requestAnimationFrame(animate);
      };

      animFrameRef.current = requestAnimationFrame(animate);

      // Poll Spotify every 2s for accurate progress + track info
      const tick = async () => {
        if (!isFocusedRef.current) {
          return;
        }

        const state =
          (await getPlaybackState()) as SpotifyCurrentlyPlaying | null;
        if (!state?.item) {
          isPlayingRef.current = false;
          return;
        }

        const isEpisode =
          state.currently_playing_type === "episode" ||
          state.item.type === "episode";

        if (isEpisode) {
          setTrackInfo(null);
          fetchedTrackKeyRef.current = null;
          isPlayingRef.current = false;
          return;
        }

        isPlayingRef.current = state.is_playing ?? false;

        const track = state.item as SpotifyTrackSimple;
        const artistName = getArtistNames(track.artists);
        const albumName = track.album?.name;
        const durationMs = track.duration_ms ?? 0;
        const trackKey = `${track.name}::${artistName}::${durationMs}`;

        setTrackInfo({
          name: track.name,
          artistName,
          albumName,
          durationMs,
        });

        if (state.progress_ms !== null && state.progress_ms !== undefined) {
          lastProgressRef.current = state.progress_ms;
          lastPollTimeRef.current = Date.now();
        }

        if (fetchedTrackKeyRef.current !== trackKey) {
          fetchedTrackKeyRef.current = trackKey;
          fetchLyrics(track.name, artistName, albumName, durationMs);
        }
      };

      tick();
      const intervalId = setInterval(tick, 2000);

      return () => {
        isFocusedRef.current = false;
        if (animFrameRef.current !== null) {
          cancelAnimationFrame(animFrameRef.current);
        }
        clearInterval(intervalId);
      };
    }, [getPlaybackState, fetchLyrics])
  );

  const renderContent = () => {
    if (!trackInfo) {
      return (
        <View style={styles.centerContainer}>
          <StyledText style={styles.messageText}>No track playing</StyledText>
        </View>
      );
    }

    if (!lyricsData) {
      return (
        <View style={styles.centerContainer}>
          <StyledText style={styles.messageText}>
            {fetchDone ? "No lyrics found." : "Loading lyrics..."}
          </StyledText>
        </View>
      );
    }

    if (lyricsData.instrumental) {
      return (
        <View style={styles.centerContainer}>
          <StyledText style={styles.messageText}>Instrumental</StyledText>
        </View>
      );
    }

    if (syncedLines.length > 0) {
      return (
        <CustomScrollView
          contentContainerStyle={styles.listContentContainer}
          data={syncedLines as unknown[]}
          keyExtractor={(_, index) => index.toString()}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollToIndexFailed={onScrollToIndexFailed}
          ref={flatListRef}
          renderItem={({ item, index }: { item: unknown; index: number }) => {
            const lyric = item as LyricLine;
            const isActive = index === activeIndex;
            return (
              <StyledText
                style={[
                  styles.lyricText,
                  {
                    opacity: isActive ? 1 : 0.4,
                  },
                ]}
              >
                {lyric.text || " "}
              </StyledText>
            );
          }}
        />
      );
    }

    if (plainLines.length > 0) {
      return (
        <CustomScrollView
          contentContainerStyle={styles.listContentContainer}
          data={plainLines as unknown[]}
          keyExtractor={(_, index) => index.toString()}
          renderItem={({ item }: { item: unknown }) => (
            <StyledText style={styles.lyricText}>
              {(item as string) || " "}
            </StyledText>
          )}
        />
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
      headerIcon={isSynced ? undefined : "sync"}
      headerIconPress={handleResync}
      headerIconShowLength={isSynced ? 0 : 1}
      headerTitle={trackInfo?.name || "Lyrics"}
      style={{ paddingHorizontal: n(20), paddingBottom: 0 }}
    >
      <View style={styles.container}>{renderContent()}</View>
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    paddingBottom: n(20),
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  listContentContainer: {
    gap: n(28),
    paddingRight: n(10),
  },
  lyricText: {
    fontSize: n(30),
  },
  messageText: {
    fontSize: n(18),
    textAlign: "center",
  },
});
