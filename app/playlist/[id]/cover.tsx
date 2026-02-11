import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import {
  type Asset,
  getAssetsAsync,
  MediaType,
  requestPermissionsAsync,
  SortBy,
} from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from "react-native";
import { useAuth } from "@/features/auth";
import { useSettings } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { StyledText } from "@/shared/components/StyledText";
import { n } from "@/shared/utils";
import { logError } from "@/shared/utils/logger";

const COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get("window").width;
const ITEM_SIZE = Math.floor(SCREEN_WIDTH / COLUMNS);
const PAGE_SIZE = 50;
const SCROLL_TRACK_PADDING = n(16);
const MAX_COVER_SIZE_BYTES = 256 * 1024;
const SIZE_STEPS = [1000, 900, 800, 700, 600, 500, 400, 300];
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];

interface PhotoItemProps {
  item: Asset;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

const PhotoItem = memo(function PhotoItem({
  item,
  isSelected,
  onToggle,
}: PhotoItemProps) {
  return (
    <HapticPressable
      onPress={() => onToggle(item.id)}
      style={styles.photoWrapper}
    >
      <Image
        cachePolicy="memory-disk"
        contentFit="cover"
        recyclingKey={item.id}
        source={{ uri: item.uri }}
        style={styles.photo}
      />
      {isSelected && (
        <View style={styles.selectedOverlay}>
          <MaterialIcons color="white" name="check-circle" size={n(32)} />
        </View>
      )}
    </HapticPressable>
  );
});

const uploadPlaylistCover = async (
  playlistId: string,
  base64Image: string,
  ensureValidToken: () => Promise<string | null>
) => {
  const makeRequest = (token: string) =>
    fetch(`https://api.spotify.com/v1/playlists/${playlistId}/images`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/jpeg",
      },
      body: base64Image,
    });

  const validToken = await ensureValidToken();
  if (!validToken) {
    return null;
  }

  let response = await makeRequest(validToken);
  if (response.status === 401) {
    const retryToken = await ensureValidToken();
    if (retryToken) {
      response = await makeRequest(retryToken);
    }
  }

  return response;
};

const prepareImageForSpotify = async (asset: Asset) => {
  const sourceUri = asset.uri;
  const cropSize = Math.min(asset.width, asset.height);
  const originX = Math.max(0, Math.floor((asset.width - cropSize) / 2));
  const originY = Math.max(0, Math.floor((asset.height - cropSize) / 2));

  for (const size of SIZE_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const result = await manipulateAsync(
        sourceUri,
        [
          {
            crop: {
              originX,
              originY,
              width: cropSize,
              height: cropSize,
            },
          },
          {
            resize: {
              width: size,
              height: size,
            },
          },
        ],
        {
          base64: true,
          compress: quality,
          format: SaveFormat.JPEG,
        }
      );

      const base64 = result.base64;
      if (!base64) {
        continue;
      }

      if (base64.length <= MAX_COVER_SIZE_BYTES) {
        return base64;
      }
    }
  }

  return null;
};

export default function PlaylistCoverScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [photos, setPhotos] = useState<Asset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "denied">(
    "loading"
  );

  const [hasMore, setHasMore] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const { invertColors } = useSettings();
  const { ensureValidToken } = useAuth();
  const router = useRouter();

  const mountedRef = useRef(true);
  const uploadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const photosRef = useRef<Asset[]>([]);
  const endCursorRef = useRef<string | undefined>(undefined);

  const trackHeight = scrollViewHeight - SCROLL_TRACK_PADDING * 2;
  const scrollIndicatorHeight =
    trackHeight > 0 && contentHeight > 0 && contentHeight > scrollViewHeight
      ? Math.max((trackHeight * trackHeight) / contentHeight, n(20))
      : 0;

  const maxScroll = Math.max(contentHeight - scrollViewHeight, 0);
  const maxIndicatorTravel = Math.max(trackHeight - scrollIndicatorHeight, 0);
  const scrollIndicatorPosition =
    maxScroll > 0 ? (scrollY / maxScroll) * maxIndicatorTravel : 0;

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    setLoadState("loading");

    (async () => {
      try {
        const { status } = await requestPermissionsAsync(false, ["photo"]);
        if (cancelled) {
          return;
        }

        if (status !== "granted") {
          setLoadState("denied");
          return;
        }

        const media = await getAssetsAsync({
          mediaType: MediaType.photo,
          first: PAGE_SIZE,
          sortBy: [[SortBy.modificationTime, false]],
        });
        if (cancelled) {
          return;
        }

        photosRef.current = media.assets;
        endCursorRef.current = media.endCursor;
        setPhotos(media.assets);
        setHasMore(media.hasNextPage);
        setLoadState("loaded");
      } catch (loadError) {
        logError("Error loading photos for cover selection:", loadError);
        if (!cancelled) {
          setLoadState("denied");
        }
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadState !== "loaded" || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;

    try {
      const media = await getAssetsAsync({
        mediaType: MediaType.photo,
        first: PAGE_SIZE,
        after: endCursorRef.current,
        sortBy: [[SortBy.modificationTime, false]],
      });

      if (!mountedRef.current) {
        return;
      }

      const newPhotos = [...photosRef.current, ...media.assets];
      photosRef.current = newPhotos;
      endCursorRef.current = media.endCursor;
      setPhotos(newPhotos);
      setHasMore(media.hasNextPage);
    } catch (loadMoreError) {
      logError("Error loading more photos for cover selection:", loadMoreError);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [hasMore, loadState]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setScrollY(event.nativeEvent.contentOffset.y);
    },
    []
  );

  const toggleSelection = useCallback(
    (photoId: string) => {
      if (loadState !== "loaded" || isUploading) {
        return;
      }

      setSelectedId((currentSelectedId) =>
        currentSelectedId === photoId ? null : photoId
      );
      setError(null);
    },
    [isUploading, loadState]
  );

  const handleUpload = useCallback(async () => {
    if (uploadingRef.current || loadState !== "loaded" || !selectedId || !id) {
      return;
    }

    const selectedPhoto = photosRef.current.find(
      (photo) => photo.id === selectedId
    );
    if (!selectedPhoto) {
      return;
    }

    uploadingRef.current = true;
    setIsUploading(true);
    setError(null);

    try {
      const base64Image = await prepareImageForSpotify(selectedPhoto);
      if (!base64Image) {
        setError("Couldn't prepare this image for Spotify. Try another photo.");
        return;
      }

      const response = await uploadPlaylistCover(
        id,
        base64Image,
        ensureValidToken
      );

      if (!response) {
        setError("Couldn't authenticate with Spotify.");
        return;
      }

      if (response.ok) {
        router.dismissTo({
          pathname: "/playlist/[id]",
          params: { id },
        });
        return;
      }

      if (response.status === 403) {
        setError("Spotify rejected this upload. Sign in again, then retry.");
        return;
      }

      if (response.status === 429) {
        setError("Spotify rate limited this request. Try again shortly.");
        return;
      }

      setError("Failed to upload cover image.");
    } catch (uploadError) {
      logError("Error uploading custom playlist cover:", uploadError);
      setError("Failed to upload cover image.");
    } finally {
      uploadingRef.current = false;
      setIsUploading(false);
    }
  }, [ensureValidToken, id, loadState, router, selectedId]);

  const renderItem = useCallback(
    ({ item }: { item: Asset }) => (
      <PhotoItem
        isSelected={selectedId === item.id}
        item={item}
        onToggle={toggleSelection}
      />
    ),
    [selectedId, toggleSelection]
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<Asset> | null | undefined, index: number) => ({
      length: ITEM_SIZE,
      offset: ITEM_SIZE * Math.floor(index / COLUMNS),
      index,
    }),
    []
  );

  if (loadState === "loading") {
    return (
      <ContentContainer headerTitle="Change Cover">
        <View style={styles.centerContainer}>
          <ActivityIndicator
            color={invertColors ? "black" : "white"}
            size="large"
          />
        </View>
      </ContentContainer>
    );
  }

  if (loadState === "denied") {
    return (
      <ContentContainer headerTitle="Change Cover">
        <View style={styles.centerContainer}>
          <StyledText style={styles.deniedText}>Photo access denied</StyledText>
        </View>
      </ContentContainer>
    );
  }

  if (photos.length === 0) {
    return (
      <ContentContainer headerTitle="Change Cover">
        <View style={styles.centerContainer}>
          <StyledText style={styles.emptyText}>No photos found</StyledText>
        </View>
      </ContentContainer>
    );
  }

  return (
    <ContentContainer
      headerIcon={selectedId ? "check" : undefined}
      headerIconLoading={isUploading}
      headerIconPress={handleUpload}
      headerTitle="Change Cover"
      style={styles.contentStyle}
    >
      {error && <StyledText style={styles.errorText}>{error}</StyledText>}
      <View style={styles.listContainer}>
        <FlatList
          data={photos}
          getItemLayout={getItemLayout}
          initialNumToRender={15}
          keyExtractor={(item) => item.id}
          maxToRenderPerBatch={21}
          numColumns={COLUMNS}
          onContentSizeChange={(_, height) => setContentHeight(height)}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          onLayout={(event) =>
            setScrollViewHeight(event.nativeEvent.layout.height)
          }
          onScroll={handleScroll}
          overScrollMode="never"
          removeClippedSubviews={true}
          renderItem={renderItem}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          windowSize={7}
        />
        {scrollIndicatorHeight > 0 && (
          <View
            style={[
              styles.scrollIndicatorTrack,
              { backgroundColor: invertColors ? "black" : "white" },
            ]}
          >
            <View
              style={[
                styles.scrollIndicatorThumb,
                { backgroundColor: invertColors ? "black" : "white" },
                {
                  height: scrollIndicatorHeight,
                  top: scrollIndicatorPosition,
                },
              ]}
            />
          </View>
        )}
      </View>
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  contentStyle: {
    paddingHorizontal: 0,
    gap: 0,
  },
  centerContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: n(12),
  },
  deniedText: {
    fontSize: n(16),
  },
  emptyText: {
    fontSize: n(16),
  },
  errorText: {
    paddingHorizontal: n(20),
    fontSize: n(14),
  },
  photoWrapper: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
  },
  photo: {
    flex: 1,
    backgroundColor: "#333",
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  listContainer: {
    flex: 1,
    width: "100%",
  },
  scrollIndicatorTrack: {
    width: n(1),
    position: "absolute",
    top: SCROLL_TRACK_PADDING,
    bottom: SCROLL_TRACK_PADDING,
    right: n(18),
  },
  scrollIndicatorThumb: {
    width: n(5),
    position: "absolute",
    right: n(-1.9),
  },
});
