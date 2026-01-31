import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { usePlayback } from "@/features/playback/contexts/PlaybackContext";
import type {
    SpotifyTrack,
    SpotifyPlaylistSimple,
    SpotifyAlbumSimple,
    SpotifyImage,
    SpotifyArtist,
    SpotifyShow,
} from "@/shared/types/spotify";
import { searchItems } from "@/features/search/services/spotifySearch";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { StyledText } from "@/shared/components/StyledText";
import { FallbackImage } from "@/shared/components/FallbackImage";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { logError, getArtistNames, n } from "@/shared/utils";
import { useNetworkState } from "@/shared/hooks/useNetworkState";
import { usePreventDoubleTap } from "@/shared/hooks/usePreventDoubleTap";
import { useSettings } from "@/features/settings";

type SearchItem =
    | { type: "track"; data: SpotifyTrack }
    | { type: "playlist"; data: SpotifyPlaylistSimple }
    | { type: "album"; data: SpotifyAlbumSimple }
    | { type: "artist"; data: SpotifyArtist }
    | { type: "podcast"; data: SpotifyShow };

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
            
            searchItems(routeQuery, ["track", "album", "playlist", "artist", "show"], accessToken, ensureValidToken)
                .then((apiResponse: any) => {
                    const newResults: SearchItem[] = [];
                    if (apiResponse?.tracks?.items) {
                        apiResponse.tracks.items.forEach((track: SpotifyTrack) => {
                            if (track && track.id) {
                                newResults.push({ type: "track", data: track });
                            } else if (track) {
                                console.warn(
                                    "Search result track is missing an id or is invalid:",
                                    track
                                );
                            }
                        });
                    }
                    if (apiResponse?.albums?.items) {
                        apiResponse.albums.items.forEach((album: SpotifyAlbumSimple) => {
                            if (album && album.id) {
                                newResults.push({ type: "album", data: album });
                            } else if (album) {
                                console.warn(
                                    "Search result album is missing an id or is invalid:",
                                    album
                                );
                            }
                        });
                    }
                    if (apiResponse?.artists?.items) {
                        apiResponse.artists.items.forEach((artist: SpotifyArtist) => {
                            if (artist && artist.id) {
                                newResults.push({ type: "artist", data: artist });
                            } else if (artist) {
                                console.warn(
                                    "Search result artist is missing an id or is invalid:",
                                    artist
                                );
                            }
                        });
                    }
                    if (apiResponse?.playlists?.items) {
                        apiResponse.playlists.items.forEach((playlist: SpotifyPlaylistSimple) => {
                            if (playlist && playlist.id) {
                                newResults.push({
                                    type: "playlist",
                                    data: playlist,
                                });
                            } else if (playlist) {
                                console.warn(
                                    "Search result playlist is missing an id or is invalid:",
                                    playlist
                                );
                            }
                        });
                    }
                    if (apiResponse?.shows?.items) {
                        apiResponse.shows.items.forEach((show: SpotifyShow) => {
                            if (show && show.id) {
                                newResults.push({
                                    type: "podcast",
                                    data: show,
                                });
                            } else if (show) {
                                console.warn(
                                    "Search result show is missing an id or is invalid:",
                                    show
                                );
                            }
                        });
                    }

                    const firstAlbumIndex = newResults.findIndex(
                        (item) => item.type === "album"
                    );
                    if (firstAlbumIndex > -1) {
                        const [firstAlbum] = newResults.splice(
                            firstAlbumIndex,
                            1
                        );
                        newResults.unshift(firstAlbum);
                    }

                    const firstPodcastIndex = newResults.findIndex(
                        (item) => item.type === "podcast"
                    );
                    if (firstPodcastIndex > -1) {
                        const [firstPodcast] = newResults.splice(
                            firstPodcastIndex,
                            1
                        );
                        const albumAtTop =
                            newResults.length > 0 &&
                            newResults[0].type === "album";
                        const insertIndex = albumAtTop ? 1 : 0;
                        newResults.splice(insertIndex, 0, firstPodcast);
                    }


                    setResults(newResults);
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
                } as any);
            } else if (item.type === "artist") {
                router.push({
                    pathname: `/artist/${item.data.id}`,
                    params: {
                        artistName: item.data.name as string,
                        artistString: JSON.stringify(item.data),
                    },
                } as any);
            } else if (item.type === "playlist") {
                router.push({
                    pathname: `/playlist/${item.data.id}`,
                    params: {
                        playlistName: item.data.name as string,
                        playlistString: JSON.stringify(item.data),
                    },
                } as any);
            } else if (item.type === "podcast") {
                router.push({
                    pathname: `/podcast/${item.data.id}`,
                    params: {
                        showName: item.data.name as string,
                        showString: JSON.stringify(item.data),
                    },
                } as any);
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
                subtitle = `Song • ${getArtistNames(item.data.artists)}`;
                images = item.data.album?.images;
                itemUri = item.data.uri;
                break;
            case "album":
                title = item.data.name;
                subtitle = `Album • ${getArtistNames(item.data.artists)}`;
                images = item.data.images;
                itemUri = item.data.uri;
                break;
            case "artist":
                title = item.data.name;
                subtitle = `Artist`;
                images = item.data.images;
                itemUri = item.data.uri;
                break;
            case "playlist":
                title = item.data.name;
                subtitle = `Playlist • ${item.data.owner?.display_name || "Playlist"
                    }`;
                images = item.data.images;
                itemUri = item.data.uri;
                break;
            case "podcast":
                title = item.data.name;
                subtitle = `Podcast • ${item.data.publisher}`;
                images = item.data.images;
                itemUri = item.data.uri;
                break;
        }

        return (
            <HapticPressable
                style={styles.itemContainer}
                onPress={() => handleResultPress(item, itemUri)}
            >
                {!hideAlbumCovers && (
                    <FallbackImage
                        uri={images && images.length > 0 ? images[0].url : undefined}
                        style={[
                            styles.itemImage,
                            { borderRadius: item.type === "artist" ? n(50) : 0 }
                        ]}
                        placeholderText="?"
                        placeholderIconSize={n(24)}
                    />
                )}
                <View style={styles.textContainer}>
                    <StyledText style={styles.itemName} numberOfLines={1}>
                        {title}
                    </StyledText>
                    <StyledText style={styles.itemSubtitle} numberOfLines={1}>
                        {subtitle}
                    </StyledText>
                </View>
            </HapticPressable>
        );
    };

    if (routeQuery === undefined) {
        return (
            <ContentContainer headerTitle={" "} style={{ paddingHorizontal: n(20) }}></ContentContainer>
        );
    }

    return (
        <ContentContainer headerTitle={`Results for ${routeQuery ?? ""}`} style={{ paddingHorizontal: n(20) }}>
            {loading ? (
                <View style={styles.centeredMessageContainer}></View>
            ) : !isOnline ? (
                <View style={styles.centeredMessageContainer}>
                    <StyledText style={styles.emptyText}>
                        Search is not available offline.
                    </StyledText>
                </View>
            ) : results.length > 0 ? (
                <View style={{ paddingBottom: n(20) }}>
                    <CustomScrollView
                        data={results}
                        renderItem={renderItem}
                        keyExtractor={(item, index) =>
                            `${item.type}-${item.data.id}-${index}`
                        }
                        style={styles.list}
                        contentContainerStyle={styles.listContentContainer}
                        ItemSeparatorComponent={() => (
                            <View style={{ height: n(8) }} />
                        )}
                        overScrollMode={"never"}
                    />
                </View>
            ) : routeQuery ? (
                <View style={styles.centeredMessageContainer}>
                    <StyledText style={styles.emptyText}>
                        No results found for "{routeQuery}".
                    </StyledText>
                </View>
            ) : (
                <View style={styles.centeredMessageContainer}></View>
            )}
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
