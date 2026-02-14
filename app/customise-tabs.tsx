import {
  type TabId,
  type TabPreferences,
  useSettings,
} from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import { ToggleSwitch } from "@/shared/components/ToggleSwitch";
import { n } from "@/shared/utils";

interface TabConfig {
  id: TabId;
  label: string;
  preferenceKey: keyof Omit<TabPreferences, "tabOrder">;
}

const TAB_CONFIGS: Record<TabId, TabConfig> = {
  index: { id: "index", label: "Liked Songs", preferenceKey: "showLikedSongs" },
  albums: { id: "albums", label: "Albums", preferenceKey: "showAlbums" },
  podcasts: {
    id: "podcasts",
    label: "Podcasts",
    preferenceKey: "showPodcasts",
  },
  playlists: {
    id: "playlists",
    label: "Playlists",
    preferenceKey: "showPlaylists",
  },
  search: { id: "search", label: "Search", preferenceKey: "showSearch" },
};

export default function CustomiseTabsScreen() {
  const { tabPreferences, updateTabPreference, reorderTab, isLoading } =
    useSettings();

  if (isLoading) {
    return <ContentContainer headerTitle="Customise Tabs" />;
  }

  const orderedTabs = tabPreferences.tabOrder.map((id) => TAB_CONFIGS[id]);

  return (
    <ContentContainer headerTitle="Customise Tabs" style={{ gap: n(20) }}>
      {orderedTabs.map((tab, index) => (
        <ToggleSwitch
          isFirst={index === 0}
          isLast={index === orderedTabs.length - 1}
          key={tab.id}
          label={tab.label}
          onMoveDown={() => reorderTab(tab.id, "down")}
          onMoveUp={() => reorderTab(tab.id, "up")}
          onValueChange={(value) =>
            updateTabPreference(tab.preferenceKey, value)
          }
          value={tabPreferences[tab.preferenceKey]}
        />
      ))}
    </ContentContainer>
  );
}
