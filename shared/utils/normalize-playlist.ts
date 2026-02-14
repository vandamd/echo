import type {
  SpotifyPlaylist,
  SpotifyPlaylistFull,
  SpotifyPlaylistTrack,
} from "@/shared/types/spotify";

export type ParsedPlaylist = SpotifyPlaylist | SpotifyPlaylistFull;

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

interface RawPlaylistSummary {
  items?: {
    href?: string;
    total?: number;
  };
  tracks?: {
    href?: string;
    total?: number;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const hasTrackEntries = (value: unknown): value is RawPlaylistItems => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { items?: unknown };
  return Array.isArray(candidate.items);
};

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

const normalizePlaylist = (raw: Record<string, unknown>): ParsedPlaylist => {
  const data = raw as Record<string, unknown> & {
    items?: unknown;
    tracks?: unknown;
  };

  if (!data.items && hasTrackEntries(data.tracks)) {
    data.items = {
      ...data.tracks,
      items: normalizeTrackEntries(data.tracks.items ?? []),
    };
  }

  if (hasTrackEntries(data.items)) {
    data.items = {
      ...data.items,
      items: normalizeTrackEntries(data.items.items ?? []),
    };
  }

  if (!isRecord(data.items) && isRecord(data.tracks)) {
    data.items = {
      href: typeof data.tracks.href === "string" ? data.tracks.href : "",
      total: typeof data.tracks.total === "number" ? data.tracks.total : 0,
    };
  }

  if (!isRecord(data.items)) {
    data.items = { href: "", total: 0 };
  }

  return data as unknown as ParsedPlaylist;
};

export const parsePlaylist = (raw: unknown): ParsedPlaylist | null => {
  if (!isRecord(raw)) {
    return null;
  }
  return normalizePlaylist(raw);
};

const normalizePlaylistItems = (
  raw: Record<string, unknown>
): SpotifyPlaylistFull["items"] | null => {
  if (!hasTrackEntries(raw)) {
    return null;
  }

  const data = raw as unknown as RawPlaylistItems;
  return {
    href: typeof data.href === "string" ? data.href : "",
    items: normalizeTrackEntries(data.items ?? []),
    limit: typeof data.limit === "number" ? data.limit : 0,
    next: typeof data.next === "string" ? data.next : null,
    offset: typeof data.offset === "number" ? data.offset : 0,
    previous: typeof data.previous === "string" ? data.previous : null,
    total: typeof data.total === "number" ? data.total : 0,
  };
};

export const parsePlaylistItems = (
  raw: unknown
): SpotifyPlaylistFull["items"] | null => {
  if (!isRecord(raw)) {
    return null;
  }

  return normalizePlaylistItems(raw);
};

export const parsePlaylistItemsPage = (
  raw: unknown
): { items: SpotifyPlaylistTrack[]; next: string | null } | null => {
  const parsedItems = parsePlaylistItems(raw);
  if (!parsedItems) {
    return null;
  }

  return {
    items: parsedItems.items,
    next: parsedItems.next,
  };
};

const normalizePlaylistSummary = (
  raw: Record<string, unknown>
): SpotifyPlaylist => {
  const data = raw as Record<string, unknown> & RawPlaylistSummary;

  if (!isRecord(data.items) && isRecord(data.tracks)) {
    data.items = {
      href: typeof data.tracks.href === "string" ? data.tracks.href : "",
      total: typeof data.tracks.total === "number" ? data.tracks.total : 0,
    };
  }

  if (!isRecord(data.items)) {
    data.items = { href: "", total: 0 };
  }

  return data as unknown as SpotifyPlaylist;
};

export const parsePlaylistSummary = (raw: unknown): SpotifyPlaylist | null => {
  if (!isRecord(raw)) {
    return null;
  }
  return normalizePlaylistSummary(raw);
};

export const parsePlaylists = (raw: unknown): SpotifyPlaylist[] | null => {
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw
    .map((entry) => parsePlaylistSummary(entry))
    .filter((entry): entry is SpotifyPlaylist => entry !== null);
};

export const parsePlaylistsPage = (
  raw: unknown
): { items: SpotifyPlaylist[]; next: string | null } | null => {
  if (!isRecord(raw)) {
    return null;
  }

  const items = parsePlaylists(raw.items);
  if (!items) {
    return null;
  }

  return {
    items,
    next: typeof raw.next === "string" ? raw.next : null,
  };
};
