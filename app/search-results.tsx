import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@/features/auth";
import { usePlayback } from "@/features/playback";
import { searchItems } from "@/features/search";
import { useSettings } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { FallbackImage } from "@/shared/components/FallbackImage";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { StyledText } from "@/shared/components/StyledText";
import { useNetworkState } from "@/shared/hooks/useNetworkState";
import { usePreventDoubleTap } from "@/shared/hooks/usePreventDoubleTap";
import type {
  SpotifyAlbumSimple,
  SpotifyImage,
  SpotifyPlaylistSimple,
  SpotifySearchResults,
  SpotifyShow,
  SpotifyTrack,
} from "@/shared/types/spotify";
import { getArtistNames, logError, n } from "@/shared/utils";

const ItemSeparator = () => <View style={{ height: n(8) }} />;

type SearchItem =
  | { type: "track"; data: SpotifyTrack }
  | { type: "playlist"; data: SpotifyPlaylistSimple }
  | { type: "album"; data: SpotifyAlbumSimple }
  | { type: "podcast"; data: SpotifyShow };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: search result collection with validation
function collectSearchResults(apiResponse: SpotifySearchResults): SearchItem[] {
  const newResults: SearchItem[] = [];
  if (apiResponse.tracks?.items) {
    for (const track of apiResponse.tracks.items) {
      if (track?.id) {
        newResults.push({ type: "track", data: track });
      } else if (track) {
        console.warn(
          "Search result track is missing an id or is invalid:",
          track
        );
      }
    }
  }
  if (apiResponse.albums?.items) {
    for (const album of apiResponse.albums.items) {
      if (album?.id) {
        newResults.push({ type: "album", data: album });
      } else if (album) {
        console.warn(
          "Search result album is missing an id or is invalid:",
          album
        );
      }
    }
  }
  if (apiResponse.playlists?.items) {
    for (const playlist of apiResponse.playlists.items) {
      if (playlist?.id) {
        newResults.push({ type: "playlist", data: playlist });
      } else if (playlist) {
        console.warn(
          "Search result playlist is missing an id or is invalid:",
          playlist
        );
      }
    }
  }
  if (apiResponse.shows?.items) {
    for (const show of apiResponse.shows.items) {
      if (show?.id) {
        newResults.push({ type: "podcast", data: show });
      } else if (show) {
        console.warn(
          "Search result show is missing an id or is invalid:",
          show
        );
      }
    }
  }

  const firstAlbumIndex = newResults.findIndex((item) => item.type === "album");
  if (firstAlbumIndex > -1) {
    const [firstAlbum] = newResults.splice(firstAlbumIndex, 1);
    newResults.unshift(firstAlbum);
  }

  const firstPodcastIndex = newResults.findIndex(
    (item) => item.type === "podcast"
  );
  if (firstPodcastIndex > -1) {
    const [firstPodcast] = newResults.splice(firstPodcastIndex, 1);
    const albumAtTop = newResults.length > 0 && newResults[0].type === "album";
    const insertIndex = albumAtTop ? 1 : 0;
    newResults.splice(insertIndex, 0, firstPodcast);
  }

  return newResults;
}

export default function SearchResultsScreen() {
  const params = useLocalSearchParams();
  const routeQuery = params.query as string | undefined;
  const { accessToken, ensureValidToken } = useAuth();
  const { playTrackWithContext } = usePlayback();
  const { isOnline } = useNetworkState();
  const { hideAlbumCovers } = useSettings();
  const router = useRouter();
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (routeQuery) {
      setLoading(true);

      if (!isOnline) {
        setLoading(false);
        return;
      }

      searchItems(
        routeQuery,
        ["track", "album", "playlist", "show"],
        accessToken,
        ensureValidToken
      )
        .then((apiResponse) => {
          if (apiResponse) {
            setResults(collectSearchResults(apiResponse));
          }
        })
        .catch((error: unknown) => logError("Search error:", error))
        .finally(() => setLoading(false));
    } else {
      setResults([]);
      setLoading(false);
    }
  }, [routeQuery, accessToken, ensureValidToken, isOnline]);

  const handleResultPress = usePreventDoubleTap(
    async (item: SearchItem, itemUri: string) => {
      if (item.type === "track") {
        const track = item.data;
        const artistName = getArtistNames(track.artists ?? []);
        const albumArtUrl = track.album?.images?.[0]?.url ?? "";

        try {
          await playTrackWithContext(itemUri);
          router.push({
            pathname: "/playing",
            params: {
              trackName: track.name ?? "",
              artistName,
              albumArtUrl,
              durationMs: track.duration_ms?.toString() ?? "0",
            },
          });
        } catch (error) {
          logError("Error playing track:", error);
          router.push({
            pathname: "/playing",
            params: {
              trackName: track.name ?? "",
              artistName,
              albumArtUrl,
              durationMs: track.duration_ms?.toString() ?? "0",
            },
          });
        }
      } else if (item.type === "album") {
        router.navigate({
          pathname: `/album/${item.data.id}`,
          params: {
            albumName: item.data.name,
            albumString: JSON.stringify({
              id: item.data.id,
              name: item.data.name,
              images: item.data.images,
              artists: item.data.artists,
              album_type: item.data.album_type,
              release_date: item.data.release_date,
              uri: item.data.uri,
            }),
          },
        } as never);
      } else if (item.type === "playlist") {
        router.push({
          pathname: `/playlist/${item.data.id}`,
          params: {
            playlistName: item.data.name as string,
            playlistString: JSON.stringify(item.data),
          },
        } as never);
      } else if (item.type === "podcast") {
        router.push({
          pathname: `/podcast/${item.data.id}`,
          params: {
            showName: item.data.name as string,
            showString: JSON.stringify(item.data),
          },
        } as never);
      }
    }
  );

  const renderItem = ({ item }: { item: SearchItem }) => {
    let title = "";
    let subtitle = "";
    let images: SpotifyImage[] | undefined = [];
    let itemUri = "";

    switch (item.type) {
      case "track":
        title = item.data.name;
        subtitle = `Song \u2022 ${getArtistNames(item.data.artists)}`;
        images = item.data.album?.images;
        itemUri = item.data.uri;
        break;
      case "album":
        title = item.data.name;
        subtitle = `Album \u2022 ${getArtistNames(item.data.artists)}`;
        images = item.data.images;
        itemUri = item.data.uri;
        break;
      case "playlist":
        title = item.data.name;
        subtitle = `Playlist \u2022 ${item.data.owner?.display_name || "Playlist"}`;
        images = item.data.images;
        itemUri = item.data.uri;
        break;
      case "podcast":
        title = item.data.name;
        subtitle = `Podcast${item.data.publisher ? ` \u2022 ${item.data.publisher}` : ""}`;
        images = item.data.images;
        itemUri = item.data.uri;
        break;
      default:
        break;
    }

    return (
      <HapticPressable
        onPress={() => handleResultPress(item, itemUri)}
        style={styles.itemContainer}
      >
        {!hideAlbumCovers && (
          <FallbackImage
            placeholderIconSize={n(24)}
            placeholderText="?"
            style={styles.itemImage}
            uri={images && images.length > 0 ? images[0].url : undefined}
          />
        )}
        <View style={styles.textContainer}>
          <StyledText numberOfLines={1} style={styles.itemName}>
            {title}
          </StyledText>
          <StyledText numberOfLines={1} style={styles.itemSubtitle}>
            {subtitle}
          </StyledText>
        </View>
      </HapticPressable>
    );
  };

  if (routeQuery === undefined) {
    return (
      <ContentContainer
        headerTitle={" "}
        style={{ paddingHorizontal: n(20) }}
      />
    );
  }

  const resultsContent = (
    <View style={{ paddingBottom: n(20) }}>
      <CustomScrollView
        contentContainerStyle={styles.listContentContainer}
        data={results}
        ItemSeparatorComponent={ItemSeparator}
        keyExtractor={(item, index) => `${item.type}-${item.data.id}-${index}`}
        overScrollMode={"never"}
        renderItem={renderItem}
        style={styles.list}
      />
    </View>
  );

  const noResultsContent = routeQuery ? (
    <View style={styles.centeredMessageContainer}>
      <StyledText style={styles.emptyText}>
        No results found for &quot;{routeQuery}&quot;.
      </StyledText>
    </View>
  ) : (
    <View style={styles.centeredMessageContainer} />
  );

  const onlineContent = results.length > 0 ? resultsContent : noResultsContent;

  const offlineContent = (
    <View style={styles.centeredMessageContainer}>
      <StyledText style={styles.emptyText}>
        Search is not available offline.
      </StyledText>
    </View>
  );

  const loadedContent = isOnline ? onlineContent : offlineContent;
  const bodyContent = loading ? (
    <View style={styles.centeredMessageContainer} />
  ) : (
    loadedContent
  );

  return (
    <ContentContainer
      headerTitle={`Results for ${routeQuery ?? ""}`}
      style={{ paddingHorizontal: n(20) }}
    >
      {bodyContent}
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  centeredMessageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: n(20),
    width: "100%",
  },
  emptyText: {
    fontSize: n(18),
    textAlign: "center",
  },
  list: {
    flex: 1,
    width: "100%",
  },
  listContentContainer: {
    paddingTop: 0,
  },
  itemContainer: {
    minHeight: n(50),
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 0,
  },
  itemImage: {
    width: n(50),
    height: n(50),
    marginRight: n(15),
  },
  placeholderImageContainer: {
    width: n(50),
    height: n(50),
    marginRight: n(15),
    backgroundColor: "#282828",
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
    gap: 0,
  },
  itemName: {
    fontSize: n(22),
    lineHeight: n(24),
    fontFamily: "PublicSans-Regular",
  },
  itemSubtitle: {
    fontSize: n(16),
    lineHeight: n(18),
    fontFamily: "PublicSans-Regular",
  },
});
