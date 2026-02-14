import { MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@/features/auth";
import { usePlaylistsStore } from "@/features/library/stores";
import { useSettings } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { FallbackImage } from "@/shared/components/FallbackImage";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { RateLimitListMessage } from "@/shared/components/RateLimitListMessage";
import { StyledText } from "@/shared/components/StyledText";
import { usePreventDoubleTap } from "@/shared/hooks/usePreventDoubleTap";
import type { SpotifyPlaylist } from "@/shared/types/spotify";
import { getRateLimitMessage, n } from "@/shared/utils";
import { log, logError } from "@/shared/utils/logger";

export default function AddToPlaylistScreen() {
  const { isLoading, accessToken, user } = useAuth();
  const playlists = usePlaylistsStore((s) => s.playlists);
  const fetchPlaylists = usePlaylistsStore((s) => s.fetch);
  const addTrackToPlaylist = usePlaylistsStore((s) => s.addTrackToPlaylist);
  const isRateLimited = usePlaylistsStore((s) => s.isRateLimited);
  const rateLimitRetryAt = usePlaylistsStore((s) => s.rateLimitRetryAt);
  const params = useLocalSearchParams<{
    trackUri?: string;
  }>();
  const { trackUri } = params;
  log("AddToPlaylistScreen received params:", params);
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);

  useEffect(() => {
    if (accessToken && user && !playlists && !isLoading) {
      fetchPlaylists();
    }
  }, [accessToken, user, playlists, fetchPlaylists, isLoading]);

  const ownedPlaylists = useMemo(() => {
    if (!(playlists && user?.id)) {
      return null;
    }
    return playlists.filter((playlist) => playlist.owner.id === user.id);
  }, [playlists, user?.id]);

  const sortedPlaylists = useMemo(
    () =>
      ownedPlaylists
        ? [...ownedPlaylists].sort((a, b) => {
            const ownerCmp = (
              a.owner.display_name ??
              a.owner.id ??
              ""
            ).localeCompare(b.owner.display_name ?? b.owner.id ?? "");
            if (ownerCmp !== 0) {
              return ownerCmp;
            }
            return a.name.localeCompare(b.name);
          })
        : null,
    [ownedPlaylists]
  );
  const playlistRateLimitMessage = useMemo(
    () => getRateLimitMessage("playlists", rateLimitRetryAt),
    [rateLimitRetryAt]
  );

  const togglePlaylistSelection = (playlistId: string) => {
    setSelectedPlaylists((prevSelected) =>
      prevSelected.includes(playlistId)
        ? prevSelected.filter((id) => id !== playlistId)
        : [...prevSelected, playlistId]
    );
  };

  const { invertColors, hideAlbumCovers, hideCreatePlaylist } = useSettings();

  const handleDone = async () => {
    const trackUri = params.trackUri;
    if (!trackUri) {
      logError("Add to playlist: No trackUri provided in params.");
      return;
    }
    if (selectedPlaylists.length === 0) {
      return;
    }

    log(
      `Attempting to add track ${trackUri} to playlists: ${selectedPlaylists.join(
        ", "
      )}`
    );

    for (const playlistId of selectedPlaylists) {
      try {
        const success = await addTrackToPlaylist(playlistId, trackUri);
        if (success) {
          log(`Successfully added track to playlist ${playlistId}`);
        } else {
          console.warn(`Failed to add track to playlist ${playlistId}`);
        }
      } catch (error) {
        logError(`Error adding track to playlist ${playlistId}:`, error);
      }
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/playing");
    }
  };

  const handleDonePress = usePreventDoubleTap(handleDone);

  const handleCreatePlaylistPress = usePreventDoubleTap(() => {
    router.push({
      pathname: "/create-playlist",
      params: {
        returnTo: "add-to-playlist",
        trackUri,
      },
    } as never);
  });

  const renderPlaylistItem = ({ item }: { item: SpotifyPlaylist }) => {
    const isSelected = selectedPlaylists.includes(item.id);
    return (
      <HapticPressable
        onPress={() => togglePlaylistSelection(item.id)}
        style={styles.itemContainer}
      >
        {!hideAlbumCovers && (
          <FallbackImage
            placeholderIcon="music-note"
            placeholderIconSize={24}
            style={styles.playlistImage}
            uri={
              item.images && item.images.length > 0
                ? item.images[0].url
                : undefined
            }
          />
        )}
        <View style={styles.textContainer}>
          <StyledText numberOfLines={1} style={styles.playlistName}>
            {item.name}
          </StyledText>
          <StyledText numberOfLines={1} style={styles.playlistOwner}>
            {item.owner.display_name || item.owner.id}
          </StyledText>
        </View>
        <View style={{ marginRight: n(15) }}>
          <MaterialIcons
            color={invertColors ? "black" : "white"}
            name={
              isSelected ? "radio-button-checked" : "radio-button-unchecked"
            }
            size={n(24)}
          />
        </View>
      </HapticPressable>
    );
  };

  const isUserPending = Boolean(accessToken) && !user?.id;

  if ((isLoading || isUserPending) && !sortedPlaylists) {
    return (
      <ContentContainer
        headerTitle="Add to playlist"
        style={{ paddingHorizontal: n(20), gap: 0 }}
      >
        <View style={styles.centeredMessageContainer} />
      </ContentContainer>
    );
  }

  if (!sortedPlaylists || sortedPlaylists.length === 0) {
    return (
      <ContentContainer
        headerTitle="Add to playlist"
        style={{ paddingHorizontal: n(20), gap: 0 }}
      >
        <View style={styles.centeredMessageContainer}>
          {isRateLimited ? (
            <RateLimitListMessage message={playlistRateLimitMessage} />
          ) : (
            <StyledText style={styles.emptyText}>
              No playlists found.
            </StyledText>
          )}
        </View>
      </ContentContainer>
    );
  }

  return (
    <ContentContainer
      headerTitle="Add to playlist"
      style={{ paddingHorizontal: n(20), gap: 0 }}
    >
      <CustomScrollView
        contentContainerStyle={styles.listContentContainer}
        data={sortedPlaylists}
        ItemSeparatorComponent={() => <View style={{ height: n(8) }} />}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          isRateLimited || !hideCreatePlaylist ? (
            <View>
              {isRateLimited && (
                <RateLimitListMessage message={playlistRateLimitMessage} />
              )}
              {!hideCreatePlaylist && (
                <HapticPressable
                  onPress={handleCreatePlaylistPress}
                  style={styles.newPlaylistItemContainer}
                >
                  {!hideAlbumCovers && (
                    <View style={styles.placeholderImageContainer}>
                      <MaterialIcons color="white" name="add" size={n(24)} />
                    </View>
                  )}
                  <View style={styles.textContainer}>
                    <StyledText style={styles.playlistName}>
                      Create new playlist
                    </StyledText>
                  </View>
                </HapticPressable>
              )}
            </View>
          ) : null
        }
        overScrollMode="never"
        renderItem={renderPlaylistItem}
        style={styles.list}
      />

      <View
        style={{
          width: "100%",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <HapticPressable onPress={handleDonePress} style={styles.doneButton}>
          <StyledText style={styles.doneButtonText}>Done</StyledText>
        </HapticPressable>
      </View>
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  doneButton: {
    paddingVertical: n(15),
    alignItems: "center",
    justifyContent: "center",
    minWidth: n(200),
  },
  doneButtonText: {
    fontSize: n(40),
    textTransform: "uppercase",
  },
  list: {
    flex: 1,
    width: "100%",
  },
  listContentContainer: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  centeredMessageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  emptyText: {
    fontSize: n(18),
    textAlign: "center",
  },
  itemContainer: {
    minHeight: n(50),
    paddingVertical: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  newPlaylistItemContainer: {
    minHeight: n(50),
    paddingBottom: n(8),
    flexDirection: "row",
    alignItems: "center",
  },
  playlistImage: {
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
    marginRight: n(15),
  },
  playlistName: {
    fontSize: n(22),
    lineHeight: n(24),
  },
  playlistOwner: {
    fontSize: n(16),
    lineHeight: n(18),
  },
});
