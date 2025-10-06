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
    SpotifyAlbum,
    SpotifyTrackSimple,
} from "@/contexts/AuthContext";
import { StyledText } from "@/components/StyledText";
import { HapticPressable } from "@/components/HapticPressable";
import ContentContainer from "@/components/ContentContainer";
import CustomScrollView from "@/components/CustomScrollView";
import { log, logError } from "@/utils/logger";
import { getCachedAlbumDetail } from "@/utils/cache";
import { buildPlayingScreenParams } from "@/utils/playingScreen";

export default function AlbumDetailScreen() {
    const { id, albumString, albumName } = useLocalSearchParams<{
        id: string;
        albumString?: string;
        albumName?: string;
    }>();

    const {
        accessToken,
        skipToIndex,
        saveAlbum,
        removeAlbum,
        checkIfAlbumIsSaved,
        makeApiRequest,
    } = useAuth();
    const router = useRouter();

    const initialAlbum = albumString
        ? (JSON.parse(albumString) as SpotifyAlbum)
        : null;

    const [album, setAlbum] = useState<SpotifyAlbum | null>(initialAlbum);
    const [isLoading, setIsLoading] = useState(!initialAlbum);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingMoreTracks, setIsLoadingMoreTracks] = useState(false);
    const [isAlbumSaved, setIsAlbumSaved] = useState(false);
    const [isCheckingAlbumSaved, setIsCheckingAlbumSaved] = useState(false);

    const formatDuration = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    };

    const checkAlbumSavedStatus = useCallback(async () => {
        if (!id) return;

        setIsCheckingAlbumSaved(true);
        try {
            const isSaved = await checkIfAlbumIsSaved(id);
            setIsAlbumSaved(isSaved);
        } catch (error) {
            logError("Error checking if album is saved:", error);
            setIsAlbumSaved(false);
        } finally {
            setIsCheckingAlbumSaved(false);
        }
    }, [id, checkIfAlbumIsSaved]);

    const handleToggleAlbumSave = useCallback(async () => {
        if (!id) return;

        try {
            if (isAlbumSaved) {
                const success = await removeAlbum(id);
                if (success) {
                    setIsAlbumSaved(false);
                }
            } else {
                const success = await saveAlbum(id);
                if (success) {
                    setIsAlbumSaved(true);
                }
            }
        } catch (error) {
            logError("Error toggling album save status:", error);
        }
    }, [id, isAlbumSaved, saveAlbum, removeAlbum]);

    useEffect(() => {
        if (!id) {
            setIsLoading(false);
            setError("Album ID is missing.");
            return;
        }

        const fetchAlbumDetails = async () => {
            if (
                initialAlbum &&
                initialAlbum.tracks &&
                initialAlbum.tracks.items
            ) {
                log(
                    "Album details: Using pre-loaded complete album data"
                );
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                const cachedAlbum = await getCachedAlbumDetail(id);
                if (cachedAlbum && cachedAlbum.tracks && cachedAlbum.tracks.items) {
                    log("Album details: Using cached album data");
                    setAlbum(cachedAlbum);
                    setIsLoading(false);
                    return;
                }
            } catch (error) {
                logError("Error retrieving cached album:", error);
            }

            setError(null);
            try {
                const data = await makeApiRequest(
                    `https://api.spotify.com/v1/albums/${id}`,
                    "Album details"
                );
                if (data) {
                    setAlbum(data);
                } else {
                    throw new Error("Failed to fetch album details");
                }
            } catch (e: any) {
                logError("Error fetching album details:", e);
                setError(e.message || "An unexpected error occurred.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchAlbumDetails();
    }, [id, makeApiRequest]);

    useEffect(() => {
        if (id && accessToken) {
            checkAlbumSavedStatus();
        }
    }, [id, accessToken, checkAlbumSavedStatus]);

    const loadMoreTracks = useCallback(async () => {
        if (!album?.tracks?.next || isLoadingMoreTracks) {
            return;
        }
        setIsLoadingMoreTracks(true);
        try {
            const data = await makeApiRequest(
                album.tracks.next,
                "More album tracks"
            );
            if (data) {
                setAlbum((prevAlbum) => {
                    if (!prevAlbum || !prevAlbum.tracks) return prevAlbum;
                    return {
                        ...prevAlbum,
                        tracks: {
                            ...prevAlbum.tracks,
                            items: [...prevAlbum.tracks.items, ...data.items],
                            next: data.next,
                        },
                    };
                });
            }
        } catch (e: any) {
            logError("Error fetching more album tracks:", e);
        } finally {
            setIsLoadingMoreTracks(false);
        }
    }, [album, isLoadingMoreTracks, makeApiRequest]);

    if (isLoading && !album) {
        return (
            <ContentContainer
                headerTitle={`${albumName}`}
                style={{ paddingHorizontal: 20 }}
                headerIcon={isAlbumSaved ? "remove" : "add"}
                headerIconPress={handleToggleAlbumSave}
                headerIconShowLength={isCheckingAlbumSaved ? 0 : 1}
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

    if (!album) {
        return (
            <View style={styles.centeredMessageContainer}>
                <StyledText style={styles.emptyText}>
                    Album data is unavailable.
                </StyledText>
            </View>
        );
    }

    const albumImageUrl = album.images?.[0]?.url;

    const renderTrackItem = ({
        item: track,
        index,
    }: {
        item: SpotifyTrackSimple;
        index: number;
    }) => (
        <HapticPressable
            key={track.id || index.toString()}
            style={styles.trackItemContainer}
            onPress={async () => {
                const playingParams = buildPlayingScreenParams({
                    ...track,
                    album: track.album ?? album,
                });
                try {
                    await skipToIndex(
                        {
                            type: "album",
                            uri: `spotify:album:${id}`,
                            currentIndex: index,
                        });
                    router.push({ pathname: "/playing", params: playingParams });
                } catch (error) {
                    logError("Error playing track:", error);
                    // Still navigate to playing screen even if playback fails
                    router.push({ pathname: "/playing", params: playingParams });
                }
            }}
        >
            <StyledText style={styles.trackNumber}>
                {track.track_number}.
            </StyledText>

            <View style={styles.trackNameContainer}>
                <StyledText style={styles.trackName} numberOfLines={1}>
                    {track.name}
                </StyledText>
                <StyledText style={styles.trackArtistDuration}>
                    {track.artists.map((artist) => artist.name).join(", ") +
                        " · " +
                        formatDuration(track.duration_ms)}
                </StyledText>
            </View>
        </HapticPressable>
    );

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
            headerTitle={album.name}
            style={{ paddingHorizontal: 20 }}
            headerIcon={isAlbumSaved ? "remove" : "add"}
            headerIconPress={handleToggleAlbumSave}
            headerIconShowLength={isCheckingAlbumSaved ? 0 : 1}
        >
            <View style={{ paddingBottom: 20 }}>
                <CustomScrollView
                    ListHeaderComponent={
                        <>
                            <View style={styles.albumArtContainer}>
                                <Image
                                    source={{ uri: albumImageUrl }}
                                    style={styles.albumImage}
                                />
                            </View>
                        </>
                    }
                    data={album.tracks?.items || []}
                    renderItem={renderTrackItem}
                    keyExtractor={(item, index) => item.id || index.toString()}
                    contentContainerStyle={styles.listContentContainer}
                    overScrollMode="never"
                    onEndReached={loadMoreTracks}
                    onEndReachedThreshold={6}
                    ListFooterComponent={renderFooter}
                    ListEmptyComponent={
                        isLoading ? null : album.tracks?.items?.length === 0 ? (
                            <StyledText style={styles.emptyText}>
                                No tracks found in this album.
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
    albumArtContainer: {
        alignItems: "center",
        paddingBottom: 20,
    },
    albumImage: {
        width: 200,
        height: 200,
        marginBottom: 10,
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
        marginTop: 20,
    },
    placeholderImageContainer: {
        width: 250,
        height: 250,
        marginBottom: 20,
        backgroundColor: "#282828",
        justifyContent: "center",
        alignItems: "center",
    },
    albumName: {
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        marginBottom: 8,
    },
    artistName: {
        fontSize: 18,
        textAlign: "center",
        marginBottom: 12,
    },
    albumInfo: {
        fontSize: 14,
        textAlign: "center",
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginTop: 20,
        marginBottom: 10,
        alignSelf: "flex-start",
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
        textAlign: "center",
        width: 56,
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
