import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    StyleSheet,
    Image,
    ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    useAuth,
    SpotifyPlaylist,
    SpotifyTrackSimple, // Assuming this can be reused or adapted
} from "@/contexts/AuthContext";
import { StyledText } from "@/components/StyledText";
import { MaterialIcons } from "@expo/vector-icons";
import { HapticPressable } from "@/components/HapticPressable";
import ContentContainer from "@/components/ContentContainer";
import CustomScrollView from "@/components/CustomScrollView";
import { log, logError } from "@/utils/logger";
import { getCachedPlaylistDetail } from "@/utils/cache";
import { buildPlayingScreenParams } from "@/utils/playingScreen";

// Interface for the structure of a track item within a playlist from Spotify API
interface PlaylistTrack {
    added_at: string;
    added_by: {
        external_urls: { spotify: string };
        href: string;
        id: string;
        type: string;
        uri: string;
    } | null;
    is_local: boolean;
    track: SpotifyTrackSimple | null; // Track can be null if unavailable
}

// Interface for the full playlist object with tracks
interface SpotifyPlaylistFull extends SpotifyPlaylist {
    tracks: {
        href: string;
        items: PlaylistTrack[];
        limit: number;
        next: string | null;
        offset: number;
        previous: string | null;
        total: number;
    };
}

export default function PlaylistDetailScreen() {
    const { id, playlistString, playlistName } = useLocalSearchParams<{
        id: string;
        playlistString?: string;
        playlistName?: string;
    }>();
    const { skipToIndex, makeApiRequest } = useAuth();
    const router = useRouter();

    const initialPlaylist = playlistString
        ? (JSON.parse(playlistString) as SpotifyPlaylist)
        : null;

    const [playlist, setPlaylist] = useState<SpotifyPlaylistFull | null>(
        initialPlaylist as SpotifyPlaylistFull | null
    );
    const [isLoading, setIsLoading] = useState(!initialPlaylist);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingMoreTracks, setIsLoadingMoreTracks] = useState(false);

    // Helper function to format milliseconds to MM:SS
    const formatDuration = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    };

    useEffect(() => {
        if (!id) {
            setIsLoading(false);
            setError("Playlist ID is missing.");
            return;
        }

        const fetchPlaylistDetails = async () => {
            if (
                initialPlaylist &&
                (initialPlaylist as SpotifyPlaylistFull).tracks &&
                (initialPlaylist as SpotifyPlaylistFull).tracks.items
            ) {
                log(
                    "Playlist details: Using pre-loaded complete playlist data"
                );
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                const cachedPlaylist = await getCachedPlaylistDetail(id);
                if (cachedPlaylist && cachedPlaylist.tracks && cachedPlaylist.tracks.items) {
                    log("Playlist details: Using cached playlist data");
                    setPlaylist(cachedPlaylist);
                    setIsLoading(false);
                    return;
                }
            } catch (error) {
                logError("Error retrieving cached playlist:", error);
            }

            setError(null);
            try {
                const data = await makeApiRequest(
                    `https://api.spotify.com/v1/playlists/${id}`,
                    "Playlist details"
                );
                if (data) {
                    setPlaylist(data);
                } else {
                    throw new Error("Failed to fetch playlist details");
                }
            } catch (e: any) {
                logError("Error fetching playlist details:", e);
                setError(e.message || "An unexpected error occurred.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchPlaylistDetails();
    }, [id, makeApiRequest]);

    const loadMoreTracks = useCallback(async () => {
        if (!playlist?.tracks?.next || isLoadingMoreTracks) {
            return;
        }
        setIsLoadingMoreTracks(true);
        try {
            const data = await makeApiRequest(
                playlist.tracks.next,
                "More playlist tracks"
            );
            if (data) {
                setPlaylist((prevPlaylist) => {
                    if (!prevPlaylist || !prevPlaylist.tracks)
                        return prevPlaylist;
                    return {
                        ...prevPlaylist,
                        tracks: {
                            ...prevPlaylist.tracks,
                            items: [
                                ...prevPlaylist.tracks.items,
                                ...data.items,
                            ],
                            next: data.next,
                        },
                    };
                });
            }
        } catch (e: any) {
            logError("Error fetching more playlist tracks:", e);
        } finally {
            setIsLoadingMoreTracks(false);
        }
    }, [playlist, isLoadingMoreTracks, makeApiRequest]);

    if (isLoading && !playlist) {
        return (
            <ContentContainer
                headerTitle={playlistName}
                style={{ paddingHorizontal: 20 }}
            >
            </ContentContainer>
        );
    }

    if (error) {
        return (
            <View style={styles.centeredMessageContainer}>
                <StyledText style={styles.errorText}>Error: {error}</StyledText>
            </View>
        );
    }

    if (!playlist) {
        return (
            <View style={styles.centeredMessageContainer}>
                <StyledText style={styles.emptyText}>
                    Playlist data is unavailable.
                </StyledText>
            </View>
        );
    }

    const playlistImageUrl = playlist.images?.[0]?.url;

    const renderTrackItem = ({
        item,
        index,
    }: {
        item: PlaylistTrack;
        index: number;
    }) => {
        const track = item.track;
        if (!track) return null;

        return (
            <HapticPressable
                key={`${track.id || "unknown"}-${index}`}
                style={styles.trackItemContainer}
                onPress={async () => {
                    const playingParams = buildPlayingScreenParams(track);
                    try {
                        await skipToIndex(
                            {
                                type: "playlist",
                                uri: `spotify:playlist:${id}`,
                                currentIndex: index,
                            });
                        router.push({ pathname: "/playing", params: playingParams });
                    } catch (error) {
                        logError("Error playing track:", error);
                        router.push({ pathname: "/playing", params: playingParams });
                    }
                }}
            >
                <StyledText style={styles.trackNumber}>
                    {(playlist.tracks?.offset || 0) + index + 1}.
                </StyledText>
                <View style={styles.trackNameContainer}>
                    <StyledText style={styles.trackName} numberOfLines={1}>
                        {track.name}
                    </StyledText>
                    <StyledText style={styles.trackArtistDuration}>
                        {track.artists.map((artist) => artist.name).join(", ") +
                            (track.duration_ms
                                ? ` · ${formatDuration(track.duration_ms)}`
                                : "")}
                    </StyledText>
                </View>
            </HapticPressable>
        );
    };

    const renderFooter = () => {
        if (!isLoadingMoreTracks) return null;
        return (
            <ActivityIndicator
                style={{ marginVertical: 20 }}
                size="large"
                color="white"
            />
        );
    };

    return (
        <ContentContainer
            headerTitle={playlist.name}
            style={{ paddingHorizontal: 20 }}
        >
            <View style={{ paddingBottom: 20 }}>
                <CustomScrollView
                    ListHeaderComponent={
                        <>
                            <View style={styles.playlistArtContainer}>
                                {playlistImageUrl ? (
                                    <Image
                                        source={{ uri: playlistImageUrl }}
                                        style={styles.playlistImage}
                                    />
                                ) : (
                                    <View style={styles.placeholderImageContainer}>
                                        <MaterialIcons
                                            name="music-note"
                                            size={80}
                                            color="white"
                                        />
                                    </View>
                                )}
                            </View>
                        </>
                    }
                    data={playlist.tracks?.items || []}
                    renderItem={renderTrackItem}
                    keyExtractor={(item, index) =>
                        `${item.track?.id || "unknown-track"}-${index}`
                    }
                    contentContainerStyle={styles.listContentContainer} // Changed from scrollContentContainer
                    overScrollMode="never"
                    onEndReached={loadMoreTracks}
                    onEndReachedThreshold={6}
                    ListFooterComponent={renderFooter}
                    ListEmptyComponent={
                        isLoading ? null : playlist.tracks?.items?.length === 0 ? (
                            <StyledText style={styles.emptyText}>
                                No tracks found in this playlist.
                            </StyledText>
                        ) : null
                    }
                />
            </View>
        </ContentContainer>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "black",
    },
    playlistArtContainer: {
        alignItems: "center",
        paddingBottom: 20,
    },
    playlistImage: {
        width: 200,
        height: 200,
        marginBottom: 10,
    },
    placeholderImageContainer: {
        width: 200,
        height: 200,
        marginBottom: 10,
        backgroundColor: "#282828",
        justifyContent: "center",
        alignItems: "center",
    },
    scrollContentContainer: {
        alignItems: "center",
        paddingBottom: 20,
    },
    centeredMessageContainer: {
        flex: 1,
        backgroundColor: "black",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    errorText: {
        fontSize: 16,
        textAlign: "center",
    },
    emptyText: {
        fontSize: 16,
        textAlign: "center",
    },
    trackItemContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        width: "100%",
    },
    trackNumber: {
        fontSize: 26,
        paddingRight: 8,
        width: 56,
        textAlign: "center",
    },
    trackNameContainer: {
        flex: 1,
        alignItems: "flex-start",
    },
    trackName: {
        flex: 1,
        fontSize: 26,
    },
    trackArtistDuration: {
        fontSize: 16,
        lineHeight: 18,
        paddingBottom: 6,
    },
    listContentContainer: {
        paddingBottom: 0,
    },
});
