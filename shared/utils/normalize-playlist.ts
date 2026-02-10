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

interface RawPlaylistItemsPage {
  items: RawPlaylistTrackEntry[];
  next: string | null;
}

const normalizeTrackEntries = (
  entries: RawPlaylistTrackEntry[]
): SpotifyPlaylistTrack[] =>
  entries.map((entry): SpotifyPlaylistTrack => {
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
  });

export const normalizePlaylist = (
  raw: Record<string, unknown>
): SpotifyPlaylistFull => {
  const data = raw as Record<string, unknown> & {
    items?: RawPlaylistItems;
    tracks?: RawPlaylistItems;
  };

  if (!data.items && data.tracks) {
    data.items = {
      ...data.tracks,
      items: normalizeTrackEntries(data.tracks.items ?? []),
    };
  }

  if (data.items) {
    data.items = {
      ...data.items,
      items: normalizeTrackEntries(data.items.items ?? []),
    };
  }

  return data as unknown as SpotifyPlaylistFull;
};

export const normalizePlaylistItemsPage = (
  raw: Record<string, unknown>
): { items: SpotifyPlaylistTrack[]; next: string | null } => {
  const data = raw as unknown as RawPlaylistItemsPage;
  return {
    items: normalizeTrackEntries(data.items ?? []),
    next: data.next ?? null,
  };
};
