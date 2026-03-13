const IMAGE_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 20;

interface CachedImageEntry {
  uri: string;
  cachedAt: number;
}

const albumNavigationImageCache = new Map<string, CachedImageEntry>();

const pruneExpiredEntries = () => {
  const now = Date.now();

  for (const [albumId, entry] of albumNavigationImageCache) {
    if (now - entry.cachedAt > IMAGE_CACHE_TTL_MS) {
      albumNavigationImageCache.delete(albumId);
    }
  }
};

const pruneOverflowEntries = () => {
  while (albumNavigationImageCache.size > MAX_CACHE_ENTRIES) {
    const oldestEntry = albumNavigationImageCache.keys().next().value;

    if (!oldestEntry) {
      return;
    }

    albumNavigationImageCache.delete(oldestEntry);
  }
};

export const setAlbumNavigationImage = (albumId: string, uri: string) => {
  if (!(albumId && uri)) {
    return;
  }

  pruneExpiredEntries();
  albumNavigationImageCache.set(albumId, {
    uri,
    cachedAt: Date.now(),
  });
  pruneOverflowEntries();
};

export const getAlbumNavigationImage = (albumId: string) => {
  if (!albumId) {
    return undefined;
  }

  pruneExpiredEntries();

  const cachedEntry = albumNavigationImageCache.get(albumId);
  return cachedEntry?.uri;
};

export const consumeAlbumNavigationImage = (albumId: string) => {
  const uri = getAlbumNavigationImage(albumId);

  if (uri) {
    albumNavigationImageCache.delete(albumId);
  }

  return uri;
};
