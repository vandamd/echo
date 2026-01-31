import React, { useState, useCallback } from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSpotifyLibrary } from "@/features/library/contexts/LibraryContext";
import ContentContainer from "@/shared/components/ContentContainer";
import { useSettings } from "@/features/settings";
import * as Haptics from "expo-haptics";
import { MaterialIcons } from "@expo/vector-icons";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { logError } from "@/shared/utils/logger";
import { n } from "@/shared/utils";

export default function RenamePlaylistScreen() {
	const { playlistId, currentName } = useLocalSearchParams<{
		playlistId: string;
		currentName: string;
	}>();
	const [playlistName, setPlaylistName] = useState(currentName ?? "");
	const router = useRouter();
	const { ensureValidToken } = useAuth();
	const { fetchPlaylists } = useSpotifyLibrary();

	useFocusEffect(
		useCallback(() => {
			setPlaylistName(currentName ?? "");
		}, [currentName])
	);

	const handleRenamePlaylist = async () => {
		if (!playlistName.trim()) {
			return;
		}

		if (!playlistId) {
			logError("Rename Playlist Error: Missing playlist ID");
			return;
		}

		try {
			const validToken = await ensureValidToken();
			if (!validToken) {
				logError("Rename Playlist Error: No valid token available");
				return;
			}

			const response = await fetch(
				`https://api.spotify.com/v1/playlists/${playlistId}`,
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${validToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: playlistName,
					}),
				}
			);

			if (response.ok) {
				if (fetchPlaylists) {
					await fetchPlaylists();
				}
				if (router.canGoBack()) {
					router.back();
				} else {
					router.replace("/(tabs)/playlists");
				}
			} else {
				const errorData = await response.json();
				logError("Error renaming playlist:", errorData);
			}
		} catch (error) {
			logError("Error renaming playlist:", error);
		}
	};

	const { invertColors } = useSettings();
	const hasChanged = playlistName.trim() !== (currentName ?? "").trim();

	return (
		<ContentContainer
			headerTitle="Rename Playlist"
			headerIcon="check"
			headerIconShowLength={hasChanged && playlistName.length > 0 ? 1 : 0}
			headerIconPress={handleRenamePlaylist}
		>
			<View
				style={[
					styles.inputContainer,
					{ borderBottomColor: invertColors ? "black" : "white" },
				]}
			>
				<TextInput
					style={[
						styles.input,
						{ color: invertColors ? "black" : "white" },
					]}
					placeholderTextColor="#888"
					value={playlistName}
					placeholder="Name your playlist"
					onChangeText={setPlaylistName}
					cursorColor={invertColors ? "black" : "white"}
					selectionColor={invertColors ? "black" : "white"}
					onSubmitEditing={handleRenamePlaylist}
					autoFocus
				/>
				{playlistName.length > 0 && (
					<HapticPressable
						style={styles.clearButton}
						onPress={() => {
							setPlaylistName("");
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
						}}
					>
						<MaterialIcons
							name="clear"
							size={n(24)}
							color={invertColors ? "black" : "white"}
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
