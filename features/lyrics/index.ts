export { useLyrics } from "./hooks/useLyrics";
export type {
  LrcLibResponse,
  LyricLine,
  LyricsData,
  LyricsTrackInfo,
} from "./services/lyrics";
export {
  findActiveLyricIndex,
  findNextLyricIndex,
  getEffectiveProgressMs,
  getLyricsTrackKey,
} from "./services/lyrics";
