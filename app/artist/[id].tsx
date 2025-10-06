import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    StyleSheet,
    Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    useAuth,
    SpotifyArtist,
    SpotifyTrack,
    SpotifyAlbumSimple,
} from "@/contexts/AuthContext";
import { StyledText } from "@/components/StyledText";
import { HapticPressable } from "@/components/HapticPressable";
import ContentContainer from "@/components/ContentContainer";
import CustomScrollView from "@/components/CustomScrollView";
import { log, logError } from "@/utils/logger";
import { buildPlayingScreenParams } from "@/utils/playingScreen";

export default function ArtistDetailScreen() {
    const { id, artistString, artistName } = useLocalSearchParams<{
        id: string;
        artistString?: string;
        artistName?: string;
    }>();

    const {
        accessToken,
        playTracksWithWebApi,
        followArtist,
        unfollowArtist,
        fetchArtistTopTracks,
        fetchArtistAlbums,
        fetchMoreArtistAlbums,
        checkIfFollowingArtist,
        makeApiRequest,
    } = useAuth();

    const router = useRouter();
    let initialArtist = null

    if (artistString) {
        const artistData = JSON.parse(artistString);
        if (artistData.images && artistData.images.length > 0) {
            initialArtist = artistData as SpotifyArtist;
        } else {
            initialArtist = null;
        }
    }

    const [artist, setArtist] = useState<SpotifyArtist | null>(initialArtist);
    const [isLoading, setIsLoading] = useState(!initialArtist);
    const [error, setError] = useState<string | null>(null);
    const [isFollowingArtist, setIsFollowingArtist] = useState(false);
    const [isCheckingFollowingArtist, setIsCheckingFollowingArtist] = useState(false);
    const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([]);
    const [albums, setAlbums] = useState<SpotifyAlbumSimple[] | null>(null);
    const [albumsNextUrl, setAlbumsNextUrl] = useState<string | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const handleLoadMore = async () => {
        if (!albumsNextUrl || isLoadingMore) return;

        setIsLoadingMore(true);
        try {
            const { albums: newAlbums, nextUrl } = await fetchMoreArtistAlbums(
                albumsNextUrl,
                isLoadingMore
            );
            if (newAlbums) {
                setAlbums((prevAlbums) => [...(prevAlbums || []), ...newAlbums]);
                setAlbumsNextUrl(nextUrl);
            }
        } catch (error) {
            logError("Error fetching more artist albums:", error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const formatDuration = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    };

    const checkArtistFollowingStatus = useCallback(async () => {
        if (!id) return;

        setIsCheckingFollowingArtist(true);
        try {
            const isFollowing = await checkIfFollowingArtist(id);
            setIsFollowingArtist(isFollowing);
        } catch (error) {
            logError("Error checking if artist is saved:", error);
            setIsFollowingArtist(false);
        } finally {
            setIsCheckingFollowingArtist(false);
        }
    }, [id, checkIfFollowingArtist]);

    const handleToggleFollowArtist = useCallback(async () => {
        if (!id) return;

        try {
            if (isFollowingArtist) {
                const success = await unfollowArtist(id);
                if (success) {
                    setIsFollowingArtist(false);
                }
            } else {
                const success = await followArtist(id);
                if (success) {
                    setIsFollowingArtist(true);
                }
            }
        } catch (error) {
            logError("Error toggling artist save status:", error);
        }
    }, [id, isFollowingArtist, followArtist, unfollowArtist]);

    useEffect(() => {
        if (!id) {
            setIsLoading(false);
            setError("Artist ID is missing.");
            return;
        }

        const fetchArtistDetails = async () => {
            if (
                initialArtist
            ) {
                log(
                    "Artist details: Using pre-loaded complete artist data"
                );
                setIsLoading(false);
                return;
            }

            if (!initialArtist) {
                setIsLoading(true);
            }
            setError(null);
            try {
                const data = await makeApiRequest(
                    `https://api.spotify.com/v1/artists/${id}`,
                    "Artist details"
                );
                if (data) {
                    setArtist(data);
                } else {
                    throw new Error("Failed to fetch artist details");
                }
            } catch (e: any) {
                logError("Error fetching artist details:", e);
                setError(e.message || "An unexpected error occurred.");
            } finally {
                setIsLoading(false);
            }
        };

        const fetchTopTracks = async () => {
            if (!id) return;
            setIsLoading(true);
            try {
                const data = await fetchArtistTopTracks(id);
                setTopTracks(data);
            } catch (e: any) {
                logError("Error fetching artist top tracks:", e);
            } finally {
                setIsLoading(false);
            }
        };

        const fetchAlbums = async () => {
            if (!id) return;
            setIsLoading(true);
            try {
                const data = await fetchArtistAlbums(id);
                setAlbums(data.albums);
                setAlbumsNextUrl(data.nextUrl);
            } catch (e: any) {
                logError("Error fetching artist albums:", e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchArtistDetails();
        fetchTopTracks();
        fetchAlbums();
    }, [id, makeApiRequest]);

    useEffect(() => {
        if (id && accessToken) {
            checkArtistFollowingStatus();
        }
    }, [id, accessToken, checkArtistFollowingStatus]);

    if (isLoading && !artist) {
        return (
            <ContentContainer
                headerTitle={`${artistName}`}
                style={{ paddingHorizontal: 20 }}
                headerIcon={isFollowingArtist ? "remove" : "add"}
                headerIconPress={handleToggleFollowArtist}
                headerIconShowLength={isCheckingFollowingArtist ? 0 : 1}
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

    if (!artist) {
        return (
            <View style={styles.centeredMessageContainer}>
                <StyledText style={styles.emptyText}>
                    Artist data is unavailable.
                </StyledText>
            </View>
        );
    }

    const artistImageUrl = artist.images?.[0]?.url;

    const artistAlbums = (albums || []).filter(
        (album) => album.album_type === "album"
    );
    const artistSingles = (albums || []).filter(
        (album) => album.album_type === "single"
    );

    const artistDetailList = [
        { type: "header", title: "Top Songs" },
        ...topTracks
            .slice(0, 10)
            .map((track, idx) => ({
                type: "track",
                data: track,
                index: idx,
            })),
        ...(artistAlbums.length > 0
            ? [
                { type: "header", title: "Albums" },
                ...artistAlbums.map((album, idx) => ({
                    type: "album",
                    data: album,
                    index: idx,
                })),
            ]
            : []),
        ...(artistSingles.length > 0
            ? [
                { type: "header", title: "Singles" },
                ...artistSingles.map((album, idx) => ({
                    type: "album",
                    data: album,
                    index: idx,
                })),
            ]
            : []),
    ];

    const renderSectionHeader = (title: string) => (
        <StyledText style={styles.sectionTitle}>{title}</StyledText>
    );

    const renderTrackItem = ({
        item,
    }: {
        item: { data: SpotifyTrack; index: number };
    }) => {
        const track = item.data;
        const index = item.index;
        return (
            <HapticPressable
                style={styles.trackItemContainer}
                onPress={async () => {
                    const playingParams = buildPlayingScreenParams(track);
                    try {
                        const trackUris = topTracks.map((t) => t.uri);
                        const urisToPlay = trackUris.slice(item.index);
                        await playTracksWithWebApi(urisToPlay);
                        router.push({ pathname: "/playing", params: playingParams });
                    } catch (error) {
                        logError("Error playing track:", error);
                        router.push({ pathname: "/playing", params: playingParams });
                    }
                }}
            >
                <StyledText style={styles.trackNumber}>
                    {index + 1}.
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
    };

    const renderAlbumItem = ({
        item,
    }: {
        item: any;
    }) => {
        const album = item.data;
        const hasImage = album.images && album.images.length > 0;
        return (
            <HapticPressable

                style={styles.itemContainer}
                onPress={() => router.push(`/album/${album.id}`)}
            >
                {hasImage ? (
                    <View style={styles.albumImageContainer}>
                        <Image
                            source={{ uri: album.images[0].url }}
                            style={styles.albumImage}
                        />
                    </View>
                ) : (
                    <View style={styles.placeholderImageContainer}>
                        {/* You can optionally add an icon here */}
                    </View>
                )}
                <View style={styles.textContainer}>
                    <StyledText style={styles.albumName} numberOfLines={1}>
                        {album.name}
                    </StyledText>
                    <StyledText style={styles.albumArtist} numberOfLines={1}>
                        {album.artists.map((artist: any) => artist.name).join(", ")}
                    </StyledText>
                </View>
            </HapticPressable>
        );
    };

    const renderItem = ({ item }: { item: any }) => {
        if (item.type === 'header') {
            return renderSectionHeader(item.title);
        } else if (item.type === 'track') {
            return renderTrackItem({ item });
        } else if (item.type === 'album') {
            return renderAlbumItem({ item });
        }
        return null;
    };

    const keyExtractor = (item: any, index: number) => {
        if (item.type === 'header') return `header-${item.title}-${index}`;
        if (item.type === 'track') return `track-${item.data.id}-${index}`;
        if (item.type === 'album') return `album-${item.data.id}-${index}`;
        return `item-${index}`;
    };

    return (
        <ContentContainer
            headerTitle={artist.name}
            style={{ paddingHorizontal: 20 }}
            headerIcon={isFollowingArtist ? "remove" : "add"}
            headerIconPress={handleToggleFollowArtist}
            headerIconShowLength={isCheckingFollowingArtist ? 0 : 1}
        >
            <View style={{ paddingBottom: 20 }}>
                <CustomScrollView
                    ListHeaderComponent={
                        <>
                            <View style={styles.albumArtContainer}>
                                <Image
                                    source={{ uri: artistImageUrl }}
                                    style={styles.artistImage}
                                />
                            </View>
                        </>
                    }
                    data={artistDetailList}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    ItemSeparatorComponent={({ leadingItem }) => {
                        if (
                            leadingItem.type === 'album'
                        ) {
                            return <View style={{ height: 8 }} />;
                        }
                        return null;
                    }}
                    contentContainerStyle={styles.listContentContainer}
                    overScrollMode="never"
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={6}
                    ListFooterComponent={
                        isLoadingMore ? (
                            <View style={{ padding: 20 }}>
                                <StyledText>Loading...</StyledText>
                            </View>
                        ) : null
                    }
                    ListEmptyComponent={
                        isLoading ? null : (
                            <StyledText style={styles.emptyText}>
                                No tracks or albums found for this artist.
                            </StyledText>
                        )
                    }
                />
            </View>
        </ContentContainer>
    );

}

const styles = StyleSheet.create({
    itemContainer: {
        flexDirection: "row",
        alignItems: "center",
    },
    albumImageContainer: {
        width: 50,
        height: 50,
        marginRight: 15,
        position: "relative",
    },
    albumImage: {
        width: 50,
        height: 50,
    },
    placeholderImageContainer: {
        width: 50,
        height: 50,
        marginRight: 15,
        backgroundColor: "#282828",
        justifyContent: "center",
        alignItems: "center",
    },
    textContainer: {
        flex: 1,
    },
    albumName: {
        fontSize: 22,
        lineHeight: 24,
    },
    albumArtist: {
        fontSize: 16,
        lineHeight: 18,
    },
    container: {
        flex: 1,
        backgroundColor: "black",
    },
    albumArtContainer: {
        alignItems: "center",
        paddingBottom: 20,
    },
    artistImage: {
        width: 200,
        height: 200,
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
        marginTop: 10,
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
