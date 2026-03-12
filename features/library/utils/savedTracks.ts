import type { SavedTrackObject } from "@/shared/types/spotify";

const UNKNOWN_SAVED_TRACK_IDENTITY = "unknown";

export const getSavedTrackIdentity = (savedTrack: SavedTrackObject): string =>
  `${savedTrack.added_at}-${savedTrack.track?.id ?? savedTrack.track?.uri ?? UNKNOWN_SAVED_TRACK_IDENTITY}`;

export const getSavedTrackTrackId = (
  savedTrack: SavedTrackObject
): string | null => {
  if (savedTrack.track?.id) {
    return savedTrack.track.id;
  }

  const trackUri = savedTrack.track?.uri;
  if (!trackUri?.startsWith("spotify:track:")) {
    return null;
  }

  return trackUri.replace("spotify:track:", "");
};

export const dedupeSavedTracks = (
  savedTracks: SavedTrackObject[]
): SavedTrackObject[] => {
  const seenSavedTrackIds = new Set<string>();
  const dedupedSavedTracks: SavedTrackObject[] = [];

  for (const savedTrack of savedTracks) {
    const savedTrackId = getSavedTrackIdentity(savedTrack);
    if (seenSavedTrackIds.has(savedTrackId)) {
      continue;
    }

    seenSavedTrackIds.add(savedTrackId);
    dedupedSavedTracks.push(savedTrack);
  }

  return dedupedSavedTracks;
};

export const chunkSavedTracks = (
  savedTracks: SavedTrackObject[],
  pageSize: number
): SavedTrackObject[][] => {
  if (savedTracks.length === 0) {
    return [];
  }

  const pages: SavedTrackObject[][] = [];

  for (
    let pageStartIndex = 0;
    pageStartIndex < savedTracks.length;
    pageStartIndex += pageSize
  ) {
    pages.push(savedTracks.slice(pageStartIndex, pageStartIndex + pageSize));
  }

  return pages;
};
