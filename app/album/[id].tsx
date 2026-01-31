import React, { useEffect, useState, useCallback } from "react";
import {
    View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSpotifyLibrary } from "@/features/library/contexts/LibraryContext";
import { usePlayback } from "@/features/playback/contexts/PlaybackContext";
import type { SpotifyAlbum, SpotifyTrackSimple } from "@/shared/types/spotify";
import { StyledText, ContentContainer, CustomScrollView, TrackListItem, ListFooter, FallbackImage } from "@/shared/components";
import { log, logError, n } from "@/shared/utils";
import { getCachedAlbumDetail, saveCachedAlbumDetail } from "@/features/library/utils/cache";
import { usePreventDoubleTap, useSaveStatus, useNetworkState } from "@/shared/hooks";
import { detailScreenStyles } from "@/shared/styles/detailScreen";
import { useSettings } from "@/features/settings";

export default function AlbumDetailScreen() {
    const { id, albumString, albumName } = useLocalSearchParams<{
        id: string;
        albumString?: string;
        albumName?: string;
    }>();

    const { accessToken } = useAuth();
    const { skipToIndex } = usePlayback();
    const {
        saveAlbum,
        removeAlbum,
        checkIfAlbumIsSaved,
        makeApiRequest,
    } = useSpotifyLibrary();
    const router = useRouter();
    const { hideDetailCovers } = useSettings();
    const { isOnline } = useNetworkState();

    const initialAlbum = albumString
        ? (JSON.parse(albumString) as SpotifyAlbum)
        : null;

    const [album, setAlbum] = useState<SpotifyAlbum | null>(initialAlbum);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingMoreTracks, setIsLoadingMoreTracks] = useState(false);

    const { isSaved: isAlbumSaved, isChecking: isCheckingAlbumSaved, toggle: handleToggleAlbumSave } = useSaveStatus({
        id,
        checkFn: checkIfAlbumIsSaved,
        saveFn: saveAlbum,
        removeFn: removeAlbum,
        accessToken,
    });

    useEffect(() => {
        if (!id) {
            setError("Album ID is missing.");
            return;
        }

        const fetchAlbumDetails = async () => {
            let hasDisplayedData = !!initialAlbum?.tracks?.items;

            if (!hasDisplayedData) {
                try {
                    const cachedAlbum = await getCachedAlbumDetail(id);
                    if (cachedAlbum?.tracks?.items) {
                        log("Album details: Displaying cached data");
                        setAlbum(cachedAlbum);
                        hasDisplayedData = true;
                    }
                } catch (error) {
                    logError("Error retrieving cached album:", error);
                }
            }

            if (isOnline) {
                try {
                    const data = await makeApiRequest(
                        `https://api.spotify.com/v1/albums/${id}`,
                        "Album details"
                    );
                    if (data) {
                        log("Album details: Fetched fresh data from API");
                        setAlbum(data);
                        await saveCachedAlbumDetail(data);
                    } else if (!hasDisplayedData) {
                        throw new Error("Failed to fetch album details");
                    }
                } catch (e: any) {
                    logError("Error fetching album details:", e);
                    if (!hasDisplayedData) {
                        setError(e.message || "An unexpected error occurred.");
                    }
                }
            } else if (!hasDisplayedData) {
                setError("No cached data available. Connect to the internet to load this album.");
            }
        };

        fetchAlbumDetails();
    }, [id, makeApiRequest]);

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
                setAlbum((prevAlbum: SpotifyAlbum | null) => {
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

    const handleTrackPress = usePreventDoubleTap(
        async (trackIndex: number) => {
            const track = album?.tracks?.items[trackIndex];
            const artistName = track?.artists?.map((a: SpotifyTrackSimple['artists'][0]) => a.name).join(", ") ?? "";
            const albumArtUrl = album?.images?.[0]?.url ?? "";

            try {
                await skipToIndex({
                    type: "album",
                    uri: `spotify:album:${id}`,
                    currentIndex: trackIndex,
                });
                router.push({
                    pathname: "/playing",
                    params: {
                        trackName: track?.name ?? "",
                        artistName,
                        albumArtUrl,
                        durationMs: track?.duration_ms?.toString() ?? "0",
                    },
                });
            } catch (error) {
                logError("Error playing track:", error);
                router.push({
                    pathname: "/playing",
                    params: {
                        trackName: track?.name ?? "",
                        artistName,
                        albumArtUrl,
                        durationMs: track?.duration_ms?.toString() ?? "0",
                    },
                });
            }
        }
    );

    if (!album) {
        return (
            <ContentContainer
                headerTitle={albumName || "Album"}
                style={{ paddingHorizontal: n(20) }}
                headerIcon={isAlbumSaved ? "remove" : "add"}
                headerIconPress={handleToggleAlbumSave}
                headerIconShowLength={isCheckingAlbumSaved ? 0 : 1}
            >
                {error && (
                    <StyledText style={detailScreenStyles.errorText}>
                        {error}
                    </StyledText>
                )}
            </ContentContainer>
        );
    }

    const albumImageUrl = album.images?.[0]?.url;

    const renderTrackItem = ({
        item: track,
        index,
    }: {
        item: SpotifyTrackSimple;
        index: number;
    }) => {
        const tracks = album?.tracks?.items || [];
        const previousTrack = index > 0 ? tracks[index - 1] : null;
        const showDiscGap = previousTrack && track.disc_number !== previousTrack.disc_number;

        return (
            <>
                {showDiscGap && (
                    <View style={{ height: n(40) }} />
                )}
                <TrackListItem
                    key={track.id || index.toString()}
                    trackNumber={track.track_number}
                    name={track.name}
                    artists={track.artists}
                    durationMs={track.duration_ms}
                    onPress={() => handleTrackPress(index)}
                />
            </>
        );
    };

    return (
        <ContentContainer
            headerTitle={album.name}
            style={{ paddingHorizontal: n(20) }}
            headerIcon={isAlbumSaved ? "remove" : "add"}
            headerIconPress={handleToggleAlbumSave}
            headerIconShowLength={isCheckingAlbumSaved ? 0 : 1}
        >
            <View style={{ paddingBottom: n(20) }}>
                <CustomScrollView
                    ListHeaderComponent={
                        !hideDetailCovers ? (
                            <View style={detailScreenStyles.imageContainer}>
                                <FallbackImage
                                    uri={albumImageUrl}
                                    style={detailScreenStyles.image}
                                    placeholderIcon="album"
                                />
                            </View>
                        ) : null
                    }
                    data={album.tracks?.items || []}
                    renderItem={renderTrackItem}
                    keyExtractor={(item, index) => item.id || index.toString()}
                    contentContainerStyle={detailScreenStyles.listContentContainer}
                    overScrollMode="never"
                    onEndReached={loadMoreTracks}
                    onEndReachedThreshold={2}
                    ListFooterComponent={<ListFooter isLoading={isLoadingMoreTracks} />}
                    ListEmptyComponent={
                        error ? (
                            <StyledText style={detailScreenStyles.errorText}>
                                {error}
                            </StyledText>
                        ) : album.tracks?.items?.length === 0 ? (
                            <StyledText style={detailScreenStyles.emptyText}>
                                No tracks found in this album.
                            </StyledText>
                        ) : null
                    }
                />
            </View>
        </ContentContainer>
    );
}
