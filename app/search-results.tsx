import React, { useEffect, useState } from "react";
import { View, StyleSheet, Image } from "react-native";
import { useGlobalSearchParams, useRouter } from "expo-router";
import {
    useAuth,
    SpotifyTrack,
    SpotifyPlaylistSimple,
    SpotifyAlbumSimple,
    SpotifyArtistSimple,
    SpotifyImage,
    SpotifyArtist,
} from "@/contexts/AuthContext";
import { HapticPressable } from "@/components/HapticPressable";
import { StyledText } from "@/components/StyledText";
import ContentContainer from "@/components/ContentContainer";
import CustomScrollView from "@/components/CustomScrollView";
import { logError } from "@/utils/logger";
import { useNetworkState } from "@/hooks/useNetworkState";
import { buildPlayingScreenParams } from "@/utils/playingScreen";

type SearchItem =
    | { type: "track"; data: SpotifyTrack }
    | { type: "playlist"; data: SpotifyPlaylistSimple }
    | { type: "album"; data: SpotifyAlbumSimple }
    | { type: "artist"; data: SpotifyArtist };

export default function SearchResultsScreen() {
    const params = useGlobalSearchParams();
    const routeQuery = params.query as string | undefined;
    const { searchItems, playTrackWithContext } = useAuth();
    const { isOnline } = useNetworkState();
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
            
            searchItems(routeQuery, ["track", "album", "playlist", "artist"])
                .then((apiResponse) => {
                    const newResults: SearchItem[] = [];
                    if (apiResponse?.tracks?.items) {
                        apiResponse.tracks.items.forEach((track) => {
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
                        apiResponse.albums.items.forEach((album) => {
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
                        apiResponse.artists.items.forEach((artist) => {
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
                        apiResponse.playlists.items.forEach((playlist) => {
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

                    const firstArtistIndex = newResults.findIndex(
                        (item) => item.type === "artist"
                    );
                    if (firstArtistIndex > -2) {
                        const [firstArtist] = newResults.splice(
                            firstArtistIndex,
                            1
                        );
                        newResults.unshift(firstArtist);
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


                    setResults(newResults);
                })
                .catch((error) => logError("Search error:", error))
                .finally(() => setLoading(false));
        } else {
            setResults([]);
            setLoading(false);
        }
    }, [routeQuery, searchItems, isOnline]);

    const getArtistNames = (artists: SpotifyArtistSimple[]) => {
        return (
            artists?.map((artist) => artist.name).join(", ") || "Unknown Artist"
        );
    };

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
        }

        return (
            <HapticPressable
                style={styles.itemContainer}
                onPress={async () => {
                    if (item.type === "track") {
                        const playingParams = buildPlayingScreenParams(item.data);
                        try {
                            await playTrackWithContext(itemUri);
                            router.push({ pathname: "/playing", params: playingParams });
                        } catch (error) {
                            logError("Error playing track:", error);
                            router.push({ pathname: "/playing", params: playingParams });
                        }
                    } else if (item.type === "album") {
                        router.push({
                            pathname: `album/${item.data.id}`,
                            params: {
                                albumName: item.data.name as string,
                            },
                        } as any)
                    } else if (item.type === "artist") {
                        router.push(`/artist/${item.data.id}`);
                    } else if (item.type === "playlist") {
                        router.push(`/playlist/${item.data.id}`);
                    }
                }}
            >
                {images && images.length > 0 ? (
                    <Image
                        source={{ uri: images[0].url }}
                        style={[
                            styles.itemImage,
                            { borderRadius: item.type === "artist" ? 50 : 0 }
                        ]}
                    />
                ) : (
                    <View style={styles.placeholderImageContainer}>
                        <StyledText style={{ fontSize: 24 }}>
                            ?
                        </StyledText>
                    </View>
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
            <ContentContainer headerTitle={" "} style={{ paddingHorizontal: 20 }}></ContentContainer>
        );
    }

    return (
        <ContentContainer headerTitle={`Results for ${routeQuery ?? ""}`} style={{ paddingHorizontal: 20 }}>
            {loading ? (
                <View style={styles.centeredMessageContainer}></View>
            ) : !isOnline ? (
                <View style={styles.centeredMessageContainer}>
                    <StyledText style={styles.emptyText}>
                        Search is not available offline.
                    </StyledText>
                </View>
            ) : results.length > 0 ? (
                <View style={{ paddingBottom: 20 }}>
                    <CustomScrollView
                        data={results}
                        renderItem={renderItem}
                        keyExtractor={(item, index) =>
                            `${item.type}-${item.data.id}-${index}`
                        }
                        style={styles.list}
                        contentContainerStyle={styles.listContentContainer}
                        ItemSeparatorComponent={() => (
                            <View style={{ height: 8 }} />
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
        padding: 20,
        width: "100%",
    },
    emptyText: {
        fontSize: 18,
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
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 0,
    },
    itemImage: {
        width: 50,
        height: 50,
        marginRight: 15,
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
        gap: 0,
    },
    itemName: {
        fontSize: 22,
        lineHeight: 24,
        fontFamily: "PublicSans-Regular",
    },
    itemSubtitle: {
        fontSize: 16,
        lineHeight: 18,
        fontFamily: "PublicSans-Regular",
    },
});
