import type {
  SpotifyPlaylistFull,
  SpotifyPlaylistTrack,
} from "@/shared/types/spotify";

interface RawPlaylistTrackEntry {
  added_at: string;
  added_by: SpotifyPlaylistTrack["added_by"];
  is_local: boolean;
  item?: SpotifyPlaylistTrack["item"];
  track?: SpotifyPlaylistTrack["item"];
}

interface RawPlaylistItems {
  href: string;
  items: RawPlaylistTrackEntry[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

export const normalizePlaylist = (
  raw: Record<string, unknown>
): SpotifyPlaylistFull => {
  const data = raw as Record<string, unknown> & {
    items?: RawPlaylistItems;
    tracks?: RawPlaylistItems;
  };

  if (
    !data.items &&
    data.tracks &&
    typeof data.tracks === "object" &&
    "items" in data.tracks
  ) {
    const tracksObj = data.tracks;
    (data as Record<string, unknown>).items = {
      ...tracksObj,
      items: (tracksObj.items ?? []).map((entry): SpotifyPlaylistTrack => {
        if (!entry.item && entry.track) {
          return {
            added_at: entry.added_at,
            added_by: entry.added_by,
            is_local: entry.is_local,
            item: entry.track,
          };
        }
        return {
          added_at: entry.added_at,
          added_by: entry.added_by,
          is_local: entry.is_local,
          item: entry.item ?? null,
        };
      }),
    };
  }

  return data as unknown as SpotifyPlaylistFull;
};
