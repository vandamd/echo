import { useEffect, useRef, useState } from "react";
import {
  fetchLyricsData,
  getLyricsTrackKey,
  type LyricsData,
  type LyricsTrackInfo,
} from "../services/lyrics";

interface UseLyricsResult {
  data: LyricsData | null;
  isLoading: boolean;
  isResolved: boolean;
  trackKey: string | null;
}

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

export function useLyrics(track: LyricsTrackInfo | null): UseLyricsResult {
  const trackKey = getLyricsTrackKey(track);
  const trackRef = useRef<LyricsTrackInfo | null>(track);
  const requestIdRef = useRef(0);
  const [data, setData] = useState<LyricsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const isCurrentRequest = (controller: AbortController) =>
      requestIdRef.current === requestId && !controller.signal.aborted;
    const currentTrack = trackRef.current;

    if (!(currentTrack && trackKey)) {
      setData(null);
      setIsLoading(false);
      setIsResolved(false);
      return;
    }

    const controller = new AbortController();
    setData(null);
    setIsLoading(true);
    setIsResolved(false);

    fetchLyricsData(currentTrack, controller.signal)
      .then((nextData) => {
        if (isCurrentRequest(controller)) {
          setData(nextData);
        }
      })
      .catch((error) => {
        if (isCurrentRequest(controller) && !isAbortError(error)) {
          setData(null);
        }
      })
      .finally(() => {
        if (isCurrentRequest(controller)) {
          setIsLoading(false);
          setIsResolved(true);
        }
      });

    return () => {
      controller.abort();
    };
  }, [trackKey]);

  return {
    data,
    isLoading,
    isResolved,
    trackKey,
  };
}
