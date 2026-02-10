import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@/features/auth";
import { useArtistsStore } from "@/features/library/stores";
import { usePlayback } from "@/features/playback";
import { useSettings } from "@/features/settings";
import {
  DetailScreen,
  FallbackImage,
  HapticPressable,
  StyledText,
  TrackListItem,
} from "@/shared/components";
import {
  useNetworkState,
  usePreventDoubleTap,
  useSaveStatus,
} from "@/shared/hooks";
import type {
  SpotifyAlbumSimple,
  SpotifyArtist,
  SpotifyTrack,
} from "@/shared/types/spotify";
import { log, logError, n } from "@/shared/utils";
import { apiGet } from "@/shared/utils/api-client";

const AlbumItemSeparator = ({
  leadingItem,
}: {
  leadingItem: { type: string };
}) => {
  if (leadingItem.type === "album") {
    return <View style={{ height: n(8) }} />;
  }
  return null;
};

type ArtistDetailItem =
  | { type: "header"; title: string }
  | { type: "track"; data: SpotifyTrack; index: number }
  | { type: "album"; data: SpotifyAlbumSimple; index: number };

export default function ArtistDetailScreen() {
  const { id, artistString, artistName } = useLocalSearchParams<{
    id: string;
    artistString?: string;
    artistName?: string;
  }>();

  const { accessToken } = useAuth();
  const { playTracksWithWebApi } = usePlayback();
  const followArtist = useArtistsStore((s) => s.followArtist);
  const unfollowArtist = useArtistsStore((s) => s.unfollowArtist);
  const checkIfFollowing = useArtistsStore((s) => s.checkIfFollowing);
  const fetchArtistTopTracks = useArtistsStore((s) => s.fetchArtistTopTracks);
  const fetchArtistAlbums = useArtistsStore((s) => s.fetchArtistAlbums);
  const fetchMoreArtistAlbums = useArtistsStore((s) => s.fetchMoreArtistAlbums);

  const router = useRouter();
  const { hideAlbumCovers } = useSettings();
  const { isOnline } = useNetworkState();

  const initialArtist = useMemo(() => {
    if (!artistString) {
      return null;
    }
    try {
      return JSON.parse(artistString) as SpotifyArtist;
    } catch {
      return null;
    }
  }, [artistString]);

  const [fetchedArtist, setArtist] = useState<SpotifyArtist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([]);
  const [albums, setAlbums] = useState<SpotifyAlbumSimple[] | null>(null);
  const [albumsNextUrl, setAlbumsNextUrl] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [hasConfirmedContent, setHasConfirmedContent] = useState(false);

  const artist = fetchedArtist ?? initialArtist;
  const displayName = artist?.name ?? artistName ?? "Artist";
  const displayImageUrl = artist?.images?.[0]?.url;

  const {
    isSaved: isFollowingArtist,
    isChecking: isCheckingFollowingArtist,
    toggle: handleToggleFollowArtist,
  } = useSaveStatus({
    id,
    checkFn: checkIfFollowing,
    saveFn: followArtist,
    removeFn: unfollowArtist,
    accessToken,
  });

  const handleLoadMore = async () => {
    if (!albumsNextUrl || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const { albums: newAlbums, nextUrl } =
        await fetchMoreArtistAlbums(albumsNextUrl);
      if (newAlbums) {
        setAlbums((prevAlbums) => [...(prevAlbums || []), ...newAlbums]);
        setAlbumsNextUrl(nextUrl);
      }
    } catch (fetchError) {
      logError("Error fetching more artist albums:", fetchError);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    setHasConfirmedContent(false);

    if (!id) {
      setError("Artist ID is missing.");
      setIsInitialLoading(false);
      return;
    }

    if (!isOnline) {
      if (!initialArtist) {
        setError(
          "No cached data available. Connect to the internet to load this artist."
        );
      }
      setIsInitialLoading(false);
      return;
    }

    setIsInitialLoading(true);

    const fetchArtistDetails = async () => {
      if (initialArtist) {
        log("Artist details: Using pre-loaded artist data");
      }

      try {
        const data = await apiGet<SpotifyArtist>(
          `https://api.spotify.com/v1/artists/${id}`
        );
        if (data) {
          log("Artist details: Fetched fresh data from API");
          setArtist(data);
        } else if (!initialArtist) {
          throw new Error("Failed to fetch artist details");
        }
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "An unexpected error occurred.";
        logError("Error fetching artist details:", e);
        if (!initialArtist) {
          setError(msg);
        }
      }
    };

    const fetchTopTracks = async () => {
      try {
        const data = await fetchArtistTopTracks(id);
        setTopTracks(data);
      } catch (e: unknown) {
        logError("Error fetching artist top tracks:", e);
      }
    };

    const fetchAlbumsData = async () => {
      try {
        const data = await fetchArtistAlbums(id);
        setAlbums(data.albums);
        setAlbumsNextUrl(data.nextUrl);
      } catch (e: unknown) {
        logError("Error fetching artist albums:", e);
      }
    };

    const fetchArtistData = async () => {
      await Promise.allSettled([
        fetchArtistDetails(),
        fetchTopTracks(),
        fetchAlbumsData(),
      ]);
      setHasConfirmedContent(true);
      setIsInitialLoading(false);
    };

    fetchArtistData();
  }, [id, fetchArtistAlbums, fetchArtistTopTracks, initialArtist, isOnline]);

  const artistAlbums = (albums || []).filter(
    (album) => album.album_type === "album"
  );
  const artistSingles = (albums || []).filter(
    (album) => album.album_type === "single"
  );

  const artistDetailList: ArtistDetailItem[] = [
    { type: "header", title: "Top Songs" },
    ...topTracks.slice(0, 10).map((track, idx) => ({
      type: "track" as const,
      data: track,
      index: idx,
    })),
    ...(artistAlbums.length > 0
      ? [
          { type: "header" as const, title: "Albums" },
          ...artistAlbums.map((album, idx) => ({
            type: "album" as const,
            data: album,
            index: idx,
          })),
        ]
      : []),
    ...(artistSingles.length > 0
      ? [
          { type: "header" as const, title: "Singles" },
          ...artistSingles.map((album, idx) => ({
            type: "album" as const,
            data: album,
            index: idx,
          })),
        ]
      : []),
  ];

  const renderSectionHeader = (title: string) => (
    <StyledText style={styles.sectionTitle}>{title}</StyledText>
  );

  const handleTrackPress = usePreventDoubleTap(async (trackIndex: number) => {
    const track = topTracks[trackIndex];
    const trackArtistName =
      track?.artists
        ?.map((a: SpotifyTrack["artists"][0]) => a.name)
        .join(", ") ?? "";
    const albumArtUrl = track?.album?.images?.[0]?.url ?? "";

    try {
      const trackUris = topTracks.map((t) => t.uri);
      const urisToPlay = trackUris.slice(trackIndex);
      await playTracksWithWebApi(urisToPlay);
      router.push({
        pathname: "/playing",
        params: {
          trackName: track?.name ?? "",
          artistName: trackArtistName,
          albumArtUrl,
          durationMs: track?.duration_ms?.toString() ?? "0",
        },
      });
    } catch (playError) {
      logError("Error playing track:", playError);
      router.push({
        pathname: "/playing",
        params: {
          trackName: track?.name ?? "",
          artistName: trackArtistName,
          albumArtUrl,
          durationMs: track?.duration_ms?.toString() ?? "0",
        },
      });
    }
  });

  const renderTrackItem = ({
    item,
  }: {
    item: { data: SpotifyTrack; index: number };
  }) => {
    const track = item.data;
    const index = item.index;
    return (
      <TrackListItem
        artists={track.artists}
        durationMs={track.duration_ms}
        name={track.name}
        onPress={() => handleTrackPress(index)}
        trackNumber={index + 1}
      />
    );
  };

  const handleAlbumPress = usePreventDoubleTap((albumId: string) => {
    router.push(`/album/${albumId}`);
  });

  const renderAlbumItem = ({
    item,
  }: {
    item: { data: SpotifyAlbumSimple };
  }) => {
    const album = item.data;
    const hasImage = album.images && album.images.length > 0;
    return (
      <HapticPressable
        onPress={() => handleAlbumPress(album.id)}
        style={styles.itemContainer}
      >
        {!hideAlbumCovers && (
          <FallbackImage
            containerStyle={styles.albumImageContainer}
            placeholderIcon="album"
            placeholderIconSize={24}
            style={styles.albumImage}
            uri={hasImage ? album.images[0].url : undefined}
          />
        )}
        <View style={styles.textContainer}>
          <StyledText numberOfLines={1} style={styles.albumName}>
            {album.name}
          </StyledText>
          <StyledText numberOfLines={1} style={styles.albumArtist}>
            {album.artists
              .map((a: SpotifyAlbumSimple["artists"][0]) => a.name)
              .join(", ")}
          </StyledText>
        </View>
      </HapticPressable>
    );
  };

  const renderItem = ({ item }: { item: ArtistDetailItem }) => {
    if (item.type === "header") {
      return renderSectionHeader(item.title);
    }
    if (item.type === "track") {
      return renderTrackItem({ item });
    }
    if (item.type === "album") {
      return renderAlbumItem({ item });
    }
    return null;
  };

  const keyExtractor = (item: ArtistDetailItem, index: number) => {
    if (item.type === "header") {
      return `header-${item.title}-${index}`;
    }
    if (item.type === "track") {
      return `track-${item.data.id}-${index}`;
    }
    if (item.type === "album") {
      return `album-${item.data.id}-${index}`;
    }
    return `item-${index}`;
  };

  return (
    <DetailScreen
      data={artistDetailList}
      emptyMessage={
        hasConfirmedContent && artist
          ? "No tracks or albums found for this artist."
          : undefined
      }
      error={error}
      headerIcon={isFollowingArtist ? "remove" : "add"}
      headerIconPress={handleToggleFollowArtist}
      headerIconShowLength={isCheckingFollowingArtist ? 0 : 1}
      imageUrl={displayImageUrl}
      isInitialLoading={isInitialLoading}
      isLoadingMore={isLoadingMore}
      itemSeparatorComponent={
        AlbumItemSeparator as React.ComponentType<{
          leadingItem: ArtistDetailItem;
        }>
      }
      keyExtractor={keyExtractor}
      onLoadMore={handleLoadMore}
      placeholderIcon="person"
      renderItem={renderItem}
      title={displayName}
    />
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    minHeight: n(50),
    flexDirection: "row",
    alignItems: "center",
  },
  albumImageContainer: {
    width: n(50),
    height: n(50),
    marginRight: n(15),
    position: "relative",
  },
  albumImage: {
    width: n(50),
    height: n(50),
  },
  textContainer: {
    flex: 1,
  },
  albumName: {
    fontSize: n(22),
    lineHeight: n(24),
  },
  albumArtist: {
    fontSize: n(16),
    lineHeight: n(18),
  },
  sectionTitle: {
    fontSize: n(20),
    marginTop: n(10),
    marginBottom: n(10),
    alignSelf: "flex-start",
  },
});
