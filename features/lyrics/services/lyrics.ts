import type { PlaybackSnapshot } from "@/features/playback";

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface LyricsTrackInfo {
  name: string;
  artistName: string;
  albumName?: string;
  durationMs: number;
}

export interface LrcLibResponse {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface LyricsData {
  response: LrcLibResponse;
  syncedLines: LyricLine[];
  plainLines: string[];
}

const LRC_REGEX = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;
const LRC_HEADERS = { "User-Agent": "Echo (https://github.com)" };

export const getLyricsTrackKey = (track: LyricsTrackInfo | null) => {
  if (!track) {
    return null;
  }

  return [
    track.name,
    track.artistName,
    track.albumName ?? "",
    track.durationMs.toString(),
  ].join("::");
};

export const parseSyncedLyrics = (lyrics: string): LyricLine[] => {
  const parsed: LyricLine[] = [];

  for (const line of lyrics.split("\n")) {
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
    const millisecondString = match[3].length === 2 ? `${match[3]}0` : match[3];

    parsed.push({
      timeMs:
        minutes * 60_000 +
        seconds * 1000 +
        Number.parseInt(millisecondString, 10),
      text,
    });
  }

  return parsed;
};

export const findActiveLyricIndex = (
  syncedLines: LyricLine[],
  progressMs: number
) =>
  syncedLines.findIndex((line, index) => {
    const nextLine = syncedLines[index + 1];

    return (
      line.timeMs <= progressMs && (!nextLine || nextLine.timeMs > progressMs)
    );
  });

export const findNextLyricIndex = (
  syncedLines: LyricLine[],
  progressMs: number
) => syncedLines.findIndex((line) => line.timeMs > progressMs);

export const getEffectiveProgressMs = (
  snapshot: PlaybackSnapshot | null,
  now = Date.now()
) => {
  if (!snapshot) {
    return null;
  }

  if (!snapshot.isPlaying) {
    return snapshot.progressMs;
  }

  return snapshot.progressMs + Math.max(now - snapshot.receivedAt, 0);
};

const buildFetchParams = (track: LyricsTrackInfo): URLSearchParams => {
  const params = new URLSearchParams();
  params.append("track_name", track.name);
  params.append("artist_name", track.artistName);

  if (track.albumName) {
    params.append("album_name", track.albumName);
  }

  params.append("duration", Math.round(track.durationMs / 1000).toString());

  return params;
};

const fetchLyricsResponse = async (
  track: LyricsTrackInfo,
  signal?: AbortSignal
) => {
  const params = buildFetchParams(track);
  const cachedResponse = await fetch(
    `https://lrclib.net/api/get-cached?${params.toString()}`,
    {
      headers: LRC_HEADERS,
      signal,
    }
  );

  if (cachedResponse.ok) {
    return (await cachedResponse.json()) as LrcLibResponse;
  }

  const response = await fetch(
    `https://lrclib.net/api/get?${params.toString()}`,
    {
      headers: LRC_HEADERS,
      signal,
    }
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as LrcLibResponse;
};

export const fetchLyricsData = async (
  track: LyricsTrackInfo,
  signal?: AbortSignal
): Promise<LyricsData | null> => {
  const response = await fetchLyricsResponse(track, signal);
  if (!response) {
    return null;
  }

  return {
    response,
    syncedLines: response.syncedLyrics
      ? parseSyncedLyrics(response.syncedLyrics)
      : [],
    plainLines: response.plainLyrics
      ? response.plainLyrics.split("\n").filter((line) => line.trim())
      : [],
  };
};
