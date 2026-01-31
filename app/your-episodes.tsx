import React, { useEffect, useCallback } from "react";
import { View, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSpotifyLibrary } from "@/features/library/contexts/LibraryContext";
import { usePlayback } from "@/features/playback/contexts/PlaybackContext";
import type { SpotifySavedEpisode } from "@/shared/types/spotify";
import { StyledText, ContentContainer, CustomScrollView, ListFooter, MediaListItem } from "@/shared/components";
import { formatDuration, getLargestImage, n } from "@/shared/utils";
import { usePreventDoubleTap, useNetworkState } from "@/shared/hooks";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";

export default function YourEpisodesScreen() {
    const { accessToken, user, isLoading: isAuthLoading } = useAuth();
    const { playTrackWithContext } = usePlayback();
    const {
        savedEpisodes,
        savedEpisodesNextUrl,
        isRefreshingSavedEpisodes,
        isLoadingMoreSavedEpisodes,
        fetchSavedEpisodes,
        fetchMoreSavedEpisodes,
        refreshSavedEpisodesFromCache,
    } = useSpotifyLibrary();
    const router = useRouter();
    const { isOnline } = useNetworkState();

    useEffect(() => {
        if (accessToken && user && !savedEpisodes && !isAuthLoading && !isRefreshingSavedEpisodes) {
            fetchSavedEpisodes();
        }
    }, [accessToken, user, savedEpisodes, isAuthLoading, isRefreshingSavedEpisodes, fetchSavedEpisodes]);

    const handleRefresh = useCallback(async () => {
        if (isRefreshingSavedEpisodes) return;

        if (!isOnline) {
            await refreshSavedEpisodesFromCache();
        } else {
            fetchSavedEpisodes();
        }
    }, [fetchSavedEpisodes, isRefreshingSavedEpisodes, isOnline, refreshSavedEpisodesFromCache]);

    const handleEpisodePress = usePreventDoubleTap(
        async (savedEpisode: SpotifySavedEpisode) => {
            const episode = savedEpisode.episode;
            const albumArtUrl = getLargestImage(episode.images) ?? getLargestImage(episode.show?.images) ?? "";

            await playTrackWithContext(episode.uri);
            router.push({
                pathname: "/playing",
                params: {
                    trackName: episode.name ?? "",
                    artistName: episode.show?.name ?? "",
                    albumArtUrl,
                    durationMs: episode.duration_ms?.toString() ?? "0",
                },
            });
        }
    );

    const formatReleaseDate = (dateString: string): string => {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "";
        return date.toLocaleDateString();
    };

    const renderEpisodeItem = ({ item }: { item: SpotifySavedEpisode }) => {
        const episode = item.episode;
        const resumePoint = episode.resume_point;
        const remainingMs =
            resumePoint && !resumePoint.fully_played
                ? Math.max(episode.duration_ms - (resumePoint.resume_position_ms ?? 0), 0)
                : 0;
        
        const releaseDate = formatReleaseDate(episode.release_date);
        const metaParts = [
            ...(releaseDate ? [releaseDate] : []),
            formatDuration(episode.duration_ms, true),
        ];
        
        if (resumePoint?.fully_played) {
            metaParts.push("Played");
        } else if (resumePoint && resumePoint.resume_position_ms > 0) {
            metaParts.push(`${formatDuration(remainingMs, true)} left`);
        }

        const imageUri = getLargestImage(episode.images) ?? getLargestImage(episode.show?.images);
        const isDisabled = !isOnline;

        return (
            <MediaListItem
                primaryText={episode.name}
                secondaryText={metaParts.join(" · ")}
                imageUri={imageUri}
                placeholderIcon="mic"
                disabled={isDisabled}
                onPress={() => handleEpisodePress(item)}
            />
        );
    };

    const renderFooter = () => {
        return <ListFooter isLoading={isLoadingMoreSavedEpisodes} />;
    };

    return (
        <ContentContainer
            headerTitle="Your Episodes"
            style={{ paddingHorizontal: n(20), paddingBottom: n(20) }}
        >
            <CustomScrollView
                style={styles.list}
                contentContainerStyle={{ ...styles.listContentContainer }}
                data={savedEpisodes ?? []}
                renderItem={renderEpisodeItem}
                keyExtractor={(item) => item.episode.id}
                overScrollMode="never"
                ItemSeparatorComponent={() => <View style={{ height: n(8) }} />}
                onEndReached={() => {
                    if (savedEpisodesNextUrl && !isLoadingMoreSavedEpisodes && isOnline) {
                        fetchMoreSavedEpisodes();
                    }
                }}
                onEndReachedThreshold={2}
                ListFooterComponent={renderFooter}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshingSavedEpisodes}
                        onRefresh={handleRefresh}
                        colors={["white"]}
                        progressBackgroundColor={"black"}
                        size={"large" as any}
                    />
                }
                ListEmptyComponent={
                    !isRefreshingSavedEpisodes && (!savedEpisodes || savedEpisodes.length === 0) ? (
                        <StyledText style={styles.emptyText}>
                            No saved episodes yet.
                        </StyledText>
                    ) : null
                }
            />
        </ContentContainer>
    );
}
