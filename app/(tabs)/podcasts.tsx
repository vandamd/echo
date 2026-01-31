import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
    View,
    RefreshControl,
} from "react-native";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSpotifyLibrary } from "@/features/library/contexts/LibraryContext";
import type { SpotifySavedShow } from "@/shared/types/spotify";
import { StyledText, ContentContainer, CustomScrollView, MediaListItem } from "@/shared/components";
import { useRouter, useFocusEffect } from "expo-router";
import { log, logError } from "@/shared/utils/logger";
import { getLargestImage } from "@/shared/utils/formatters";
import { n } from "@/shared/utils";
import {
    refreshFollowedPodcastsFromCache,
    isShowCached,
} from "@/features/library/utils/cache";
import { useNetworkState, usePreventDoubleTap } from "@/shared/hooks";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";
import { useSettings } from "@/features/settings";

const YOUR_EPISODES_ID = "YOUR_EPISODES_ID";

export default function PodcastsScreen() {
    const { isLoading, accessToken, user } = useAuth();
    const {
        podcasts,
        fetchPodcasts,
        isRefreshingPodcasts,
        fetchMorePodcasts,
        isLoadingMorePodcasts,
        podcastsNextUrl,
    } = useSpotifyLibrary();
    const router = useRouter();

    const { isOnline } = useNetworkState();
    const { hideYourEpisodes } = useSettings();
    const [sortedPodcasts, setSortedPodcasts] = useState<
        SpotifySavedShow[] | null
    >(null);
    const [cachedShowIds, setCachedShowIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (
            accessToken &&
            user &&
            !podcasts &&
            !isLoading &&
            !isRefreshingPodcasts
        ) {
            fetchPodcasts();
        }
    }, [accessToken, user, podcasts, isLoading, isRefreshingPodcasts]);

    useEffect(() => {
        if (podcasts) {
            const newSortedPodcasts = [...podcasts].sort((a, b) => {
                const showA = a.show.name.toLowerCase();
                const showB = b.show.name.toLowerCase();
                if (showA < showB) return -1;
                if (showA > showB) return 1;
                return 0;
            });
            setSortedPodcasts(newSortedPodcasts);
        }
    }, [podcasts]);

    const checkCachedShows = useCallback(async () => {
        if (!sortedPodcasts) return;
        const cachedIds = new Set<string>();
        for (const show of sortedPodcasts) {
            const cached = await isShowCached(show.show.id);
            if (cached) {
                cachedIds.add(show.show.id);
            }
        }
        setCachedShowIds(cachedIds);
    }, [sortedPodcasts]);

    useFocusEffect(
        useCallback(() => {
            checkCachedShows();
        }, [checkCachedShows])
    );

    const handleRefresh = useCallback(async () => {
        if (isRefreshingPodcasts) return;

        if (!isOnline) {
            log("Podcasts: Device is offline, loading cached shows");
            try {
                const cachedShows = await refreshFollowedPodcastsFromCache();
                if (cachedShows && cachedShows.length > 0) {
                    const newSortedPodcasts = [...cachedShows].sort((a, b) => {
                        const showA = a.show.name.toLowerCase();
                        const showB = b.show.name.toLowerCase();
                        if (showA < showB) return -1;
                        if (showA > showB) return 1;
                        return 0;
                    });
                    setSortedPodcasts(newSortedPodcasts);
                    log(
                        `Podcasts: Loaded ${cachedShows.length} cached followed podcasts`
                    );
                } else {
                    log("Podcasts: No cached podcasts found");
                }
            } catch (error) {
                logError("Podcasts: Error loading cached podcasts:", error);
            }
        } else {
            fetchPodcasts();
        }
    }, [fetchPodcasts, isRefreshingPodcasts, isOnline]);

    const handleYourEpisodesPress = usePreventDoubleTap(() => {
        router.push("/your-episodes" as any);
    });

    const handleShowPress = usePreventDoubleTap(
        (item: SpotifySavedShow, isUncached: boolean) => {
            if (isUncached) return;

            router.push({
                pathname: `/podcast/${item.show.id}`,
                params: {
                    showName: item.show.name as string,
                    showString: JSON.stringify(item.show),
                },
            } as any);
        }
    );

    const yourEpisodesItem: SpotifySavedShow = useMemo(() => ({
        added_at: "",
        show: {
            id: YOUR_EPISODES_ID,
            name: "Your Episodes",
            description: "",
            publisher: "",
            images: [],
            total_episodes: 0,
            uri: "",
            href: "",
            media_type: "",
            explicit: false,
            type: "show",
            languages: [],
        },
    }), []);

    const displayPodcasts = sortedPodcasts
        ? (hideYourEpisodes ? sortedPodcasts : [yourEpisodesItem, ...sortedPodcasts])
        : (hideYourEpisodes ? [] : [yourEpisodesItem]);

    const renderShowItem = ({ item }: { item: SpotifySavedShow }) => {
        if (item.show.id === YOUR_EPISODES_ID) {
            if (hideYourEpisodes) return null;
            const isDisabled = !isOnline;

            return (
                <MediaListItem
                    primaryText={item.show.name}
                    placeholderIcon="bookmark"
                    disabled={isDisabled}
                    onPress={handleYourEpisodesPress}
                />
            );
        }

        const isOffline = !isOnline;
        const isUncached = isOffline && !cachedShowIds.has(item.show.id);

        return (
            <MediaListItem
                primaryText={item.show.name}
                secondaryText={item.show.publisher}
                imageUri={getLargestImage(item.show.images)}
                placeholderIcon="mic"
                disabled={isUncached}
                onPress={() => handleShowPress(item, isUncached)}
            />
        );
    };

    const renderFooter = () => {
        if (!isLoadingMorePodcasts) return null;
        return <View style={{ paddingVertical: n(20) }} />;
    };

    const handlePlayingPress = usePreventDoubleTap(() => {
        router.push("/playing");
    });

    if (!sortedPodcasts || sortedPodcasts.length === 0) {
        const emptyData = hideYourEpisodes ? [] : [yourEpisodesItem];
        return (
            <ContentContainer
                headerTitle="Podcasts"
                hideBackButton={true}
                style={{ paddingHorizontal: n(20) }}
                headerIcon="multitrack-audio"
                headerIconPress={handlePlayingPress}
                headerIconShowLength={1}
            >
                <CustomScrollView
                    data={emptyData}
                    renderItem={renderShowItem}
                    keyExtractor={(item) => item.show.id}
                    style={styles.list}
                    contentContainerStyle={styles.listContentContainer}
                    ItemSeparatorComponent={() => <View style={{ height: n(8) }} />}
                    overScrollMode="never"
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshingPodcasts}
                            onRefresh={handleRefresh}
                            colors={["white"]}
                            progressBackgroundColor={"black"}
                            size={"large" as any}
                        />
                    }
                />
            </ContentContainer>
        );
    }

    return (
        <ContentContainer
            headerTitle="Podcasts"
            hideBackButton={true}
            headerIcon="multitrack-audio"
            headerIconPress={handlePlayingPress}
            headerIconShowLength={1}
            style={{ paddingHorizontal: n(20) }}
        >
            <CustomScrollView
                style={styles.list}
                contentContainerStyle={styles.listContentContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshingPodcasts}
                        onRefresh={handleRefresh}
                        colors={["white"]}
                        progressBackgroundColor={"black"}
                        size={"large" as any}
                    />
                }
                data={displayPodcasts}
                renderItem={renderShowItem}
                keyExtractor={(item) => item.show.id}
                overScrollMode="never"
                ItemSeparatorComponent={() => <View style={{ height: n(8) }} />}
                onEndReached={() => {
                    if (podcastsNextUrl && !isLoadingMorePodcasts) {
                        fetchMorePodcasts();
                    }
                }}
                onEndReachedThreshold={2}
                ListFooterComponent={renderFooter}
                ListEmptyComponent={
                    isLoading || isRefreshingPodcasts ? null : (
                        <StyledText style={styles.emptyText}>
                            No followed podcasts yet.
                        </StyledText>
                    )
                }
            />
        </ContentContainer>
    );
}
