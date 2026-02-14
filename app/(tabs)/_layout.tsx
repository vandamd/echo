import { Tabs } from "expo-router";
import { useMemo } from "react";
import { useSettings } from "@/features/settings";
import { Navbar, type TabConfigItem } from "@/shared/components/Navbar";

export const TABS_CONFIG: readonly TabConfigItem[] = [
  {
    name: "Liked Songs",
    screenName: "index",
    iconName: "favorite",
  },
  {
    name: "Albums",
    screenName: "albums",
    iconName: "album",
  },
  {
    name: "Podcasts",
    screenName: "podcasts",
    iconName: "podcasts",
  },
  {
    name: "Playlists",
    screenName: "playlists",
    iconName: "format-list-bulleted",
  },
  {
    name: "Search",
    screenName: "search",
    iconName: "search",
  },
  {
    name: "Settings",
    screenName: "settings",
    iconName: "more-horiz",
  },
] as const;

export default function TabLayout() {
  const { tabPreferences } = useSettings();

  const visibleTabs = useMemo(() => {
    const filtered = TABS_CONFIG.filter((tab) => {
      switch (tab.screenName) {
        case "index":
          return tabPreferences.showLikedSongs;
        case "albums":
          return tabPreferences.showAlbums;
        case "podcasts":
          return tabPreferences.showPodcasts;
        case "playlists":
          return tabPreferences.showPlaylists;
        case "search":
          return tabPreferences.showSearch;
        case "settings":
          return true;
        default:
          return true;
      }
    });

    const sorted = [...filtered].sort((a, b) => {
      if (a.screenName === "settings") {
        return 1;
      }
      if (b.screenName === "settings") {
        return -1;
      }
      const aIndex = tabPreferences.tabOrder.indexOf(
        a.screenName as (typeof tabPreferences.tabOrder)[number]
      );
      const bIndex = tabPreferences.tabOrder.indexOf(
        b.screenName as (typeof tabPreferences.tabOrder)[number]
      );
      return aIndex - bIndex;
    });

    return sorted;
  }, [tabPreferences]);

  return (
    <Tabs
      tabBar={(props) => {
        const activeScreenName = props.state.routes[props.state.index].name;
        return (
          <Navbar
            currentScreenName={activeScreenName}
            navigation={props.navigation}
            tabsConfig={visibleTabs}
          />
        );
      }}
    >
      {visibleTabs.map((tab) => {
        return (
          <Tabs.Screen
            key={tab.screenName}
            name={tab.screenName}
            options={{
              header: () => null,
            }}
          />
        );
      })}
    </Tabs>
  );
}
