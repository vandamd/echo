import React from "react";
import { ToggleSwitch } from "@/shared/components/ToggleSwitch";
import { useSettings, TabId } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import { n } from "@/shared/utils";

interface TabConfig {
    id: TabId;
    label: string;
    preferenceKey: "showLikedSongs" | "showArtists" | "showAlbums" | "showPodcasts" | "showPlaylists" | "showSearch";
}

const TAB_CONFIGS: Record<TabId, TabConfig> = {
    index: { id: "index", label: "Liked Songs", preferenceKey: "showLikedSongs" },
    artists: { id: "artists", label: "Artists", preferenceKey: "showArtists" },
    albums: { id: "albums", label: "Albums", preferenceKey: "showAlbums" },
    podcasts: { id: "podcasts", label: "Podcasts", preferenceKey: "showPodcasts" },
    playlists: { id: "playlists", label: "Playlists", preferenceKey: "showPlaylists" },
    search: { id: "search", label: "Search", preferenceKey: "showSearch" },
};

export default function CustomiseTabsScreen() {
    const { tabPreferences, updateTabPreference, reorderTab, isLoading } = useSettings();

    if (isLoading) {
        return (
            <ContentContainer headerTitle="Customise Tabs">
            </ContentContainer>
        );
    }

    const orderedTabs = tabPreferences.tabOrder.map(id => TAB_CONFIGS[id]);

    return (
        <ContentContainer
            headerTitle="Customise Tabs"
            style={{ gap: n(20) }}
        >
            {orderedTabs.map((tab, index) => (
                <ToggleSwitch
                    key={tab.id}
                    label={tab.label}
                    value={tabPreferences[tab.preferenceKey]}
                    onValueChange={(value) => updateTabPreference(tab.preferenceKey, value)}
                    onMoveUp={() => reorderTab(tab.id, "up")}
                    onMoveDown={() => reorderTab(tab.id, "down")}
                    isFirst={index === 0}
                    isLast={index === orderedTabs.length - 1}
                />
            ))}
        </ContentContainer>
    );
}
