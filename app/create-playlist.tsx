import { MaterialIcons } from "@expo/vector-icons";
import { ImpactFeedbackStyle, impactAsync } from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useAuth } from "@/features/auth";
import { usePlaylistsStore } from "@/features/library/stores";
import { useSettings } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { n } from "@/shared/utils";
import { apiPost, apiPut } from "@/shared/utils/api-client";
import { log, logError } from "@/shared/utils/logger";

const navigateBack = (router: ReturnType<typeof useRouter>) => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)/playlists");
  }
};

export default function PlaylistFormScreen() {
  const { mode, playlistId, currentName } = useLocalSearchParams<{
    mode?: string;
    playlistId?: string;
    currentName?: string;
  }>();
  const isRename = mode === "rename";
  const [playlistName, setPlaylistName] = useState(
    isRename ? (currentName ?? "") : ""
  );
  const router = useRouter();
  const { ensureValidToken } = useAuth();
  const fetchPlaylists = usePlaylistsStore((s) => s.fetch);

  useFocusEffect(
    useCallback(() => {
      setPlaylistName(isRename ? (currentName ?? "") : "");
    }, [isRename, currentName])
  );

  const handleSubmit = async () => {
    if (!playlistName.trim()) {
      return;
    }

    try {
      const validToken = await ensureValidToken();
      if (!validToken) {
        logError("Playlist form: No valid token available");
        return;
      }

      let ok = false;
      if (isRename) {
        if (!playlistId) {
          logError("Rename Playlist Error: Missing playlist ID");
          return;
        }
        ok = await apiPut(
          `https://api.spotify.com/v1/playlists/${playlistId}`,
          {
            name: playlistName,
          }
        );
      } else {
        const result = await apiPost(
          "https://api.spotify.com/v1/me/playlists",
          { name: playlistName, public: false }
        );
        ok = result !== null;
        if (ok) {
          log("Playlist created successfully");
        }
      }

      if (ok) {
        await fetchPlaylists();
        navigateBack(router);
      }
    } catch (error) {
      logError(`Error ${isRename ? "renaming" : "creating"} playlist:`, error);
    }
  };

  const { invertColors } = useSettings();
  const hasChanged =
    !isRename || playlistName.trim() !== (currentName ?? "").trim();
  const showCheck = hasChanged && playlistName.length > 0;

  return (
    <ContentContainer
      headerIcon="check"
      headerIconPress={handleSubmit}
      headerIconShowLength={showCheck ? 1 : 0}
      headerTitle={isRename ? "Rename Playlist" : "Create Playlist"}
    >
      <View
        style={[
          styles.inputContainer,
          { borderBottomColor: invertColors ? "black" : "white" },
        ]}
      >
        <TextInput
          autoFocus={isRename}
          cursorColor={invertColors ? "black" : "white"}
          onChangeText={setPlaylistName}
          onSubmitEditing={handleSubmit}
          placeholder="Name your playlist"
          placeholderTextColor="#888"
          selectionColor={invertColors ? "black" : "white"}
          style={[styles.input, { color: invertColors ? "black" : "white" }]}
          value={playlistName}
        />
        {playlistName.length > 0 && (
          <HapticPressable
            onPress={() => {
              setPlaylistName("");
              impactAsync(ImpactFeedbackStyle.Medium);
            }}
            style={styles.clearButton}
          >
            <MaterialIcons
              color={invertColors ? "black" : "white"}
              name="clear"
              size={n(24)}
            />
          </HapticPressable>
        )}
      </View>
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderBottomWidth: n(1),
  },
  input: {
    flex: 1,
    fontSize: n(24),
    fontFamily: "PublicSans-Regular",
    paddingVertical: n(2),
    textAlign: "left",
    paddingBottom: n(6),
  },
  clearButton: {
    padding: n(5),
  },
});
