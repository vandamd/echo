import AsyncStorage from "@react-native-async-storage/async-storage";
import { ImpactFeedbackStyle, impactAsync } from "expo-haptics";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { logError } from "@/shared/utils/logger";

const TAB_PREFERENCES_KEY = "tab_preferences";

const SETTING_KEYS = {
  invertColors: "invertColors",
  hideAlbumCovers: "hideAlbumCovers",
  hideDetailCovers: "hideDetailCovers",
  showPlaylistTrackCovers: "showPlaylistTrackCovers",
  hideCreatePlaylist: "hideCreatePlaylist",
  hideLikeButton: "hideLikeButton",
  hideDevicesButton: "hideDevicesButton",
  hideAddToPlaylistButton: "hideAddToPlaylistButton",
  hideLyricsButton: "hideLyricsButton",
  hidePlayingCover: "hidePlayingCover",
  hideYourEpisodes: "hideYourEpisodes",
} as const;

type SettingKey = keyof typeof SETTING_KEYS;

type BooleanSettings = Record<SettingKey, boolean>;

export type LibrarySortOption = "alphabetical" | "creator" | "recentlyAdded";

const SORT_SETTING_KEYS = {
  albumSortOrder: "albumSortOrder",
  podcastSortOrder: "podcastSortOrder",
} as const;

type SortSettingKey = keyof typeof SORT_SETTING_KEYS;
type LibrarySortSettings = Record<SortSettingKey, LibrarySortOption>;

export type TabId = "index" | "albums" | "podcasts" | "playlists" | "search";

export const DEFAULT_TAB_ORDER: TabId[] = [
  "index",
  "albums",
  "podcasts",
  "playlists",
  "search",
];
const DEFAULT_TAB_ORDER_SET = new Set<TabId>(DEFAULT_TAB_ORDER);

export interface TabPreferences {
  showLikedSongs: boolean;
  showAlbums: boolean;
  showPodcasts: boolean;
  showPlaylists: boolean;
  showSearch: boolean;
  tabOrder: TabId[];
}

const defaultTabPreferences: TabPreferences = {
  showLikedSongs: true,
  showAlbums: true,
  showPodcasts: true,
  showPlaylists: true,
  showSearch: true,
  tabOrder: DEFAULT_TAB_ORDER,
};

const defaultSettings: BooleanSettings = {
  invertColors: false,
  hideAlbumCovers: false,
  hideDetailCovers: false,
  showPlaylistTrackCovers: false,
  hideCreatePlaylist: false,
  hideLikeButton: false,
  hideDevicesButton: false,
  hideAddToPlaylistButton: false,
  hideLyricsButton: false,
  hidePlayingCover: false,
  hideYourEpisodes: false,
};

const defaultSortSettings: LibrarySortSettings = {
  albumSortOrder: "creator",
  podcastSortOrder: "alphabetical",
};

interface SettingsContextType {
  triggerHaptic: () => void;
  invertColors: boolean;
  setInvertColors: (value: boolean) => void;
  hideAlbumCovers: boolean;
  setHideAlbumCovers: (value: boolean) => void;
  hideDetailCovers: boolean;
  setHideDetailCovers: (value: boolean) => void;
  showPlaylistTrackCovers: boolean;
  setShowPlaylistTrackCovers: (value: boolean) => void;
  hideCreatePlaylist: boolean;
  setHideCreatePlaylist: (value: boolean) => void;
  hideLikeButton: boolean;
  setHideLikeButton: (value: boolean) => void;
  hideDevicesButton: boolean;
  setHideDevicesButton: (value: boolean) => void;
  hideAddToPlaylistButton: boolean;
  setHideAddToPlaylistButton: (value: boolean) => void;
  hideLyricsButton: boolean;
  setHideLyricsButton: (value: boolean) => void;
  hidePlayingCover: boolean;
  setHidePlayingCover: (value: boolean) => void;
  hideYourEpisodes: boolean;
  setHideYourEpisodes: (value: boolean) => void;
  albumSortOrder: LibrarySortOption;
  setAlbumSortOrder: (value: LibrarySortOption) => Promise<void>;
  podcastSortOrder: LibrarySortOption;
  setPodcastSortOrder: (value: LibrarySortOption) => Promise<void>;
  tabPreferences: TabPreferences;
  updateTabPreference: (
    key: keyof Omit<TabPreferences, "tabOrder">,
    value: boolean
  ) => Promise<void>;
  reorderTab: (tabId: TabId, direction: "up" | "down") => Promise<void>;
  isLoading: boolean;
}

interface StoredTabPreferences {
  showLikedSongs?: boolean;
  showAlbums?: boolean;
  showPodcasts?: boolean;
  showPlaylists?: boolean;
  showSearch?: boolean;
  tabOrder?: unknown;
}

const getBooleanValue = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const isLibrarySortOption = (value: unknown): value is LibrarySortOption =>
  value === "alphabetical" || value === "creator" || value === "recentlyAdded";

const parseStoredSortOption = (
  value: string | null,
  fallback: LibrarySortOption
): { sortOption: LibrarySortOption; shouldPersist: boolean } => {
  if (isLibrarySortOption(value)) {
    return { sortOption: value, shouldPersist: false };
  }
  return {
    sortOption: fallback,
    shouldPersist: value !== null,
  };
};

const sanitiseTabOrder = (value: unknown): TabId[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_TAB_ORDER];
  }

  const validOrder: TabId[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    if (!DEFAULT_TAB_ORDER_SET.has(item as TabId)) {
      continue;
    }

    const tabId = item as TabId;
    if (!validOrder.includes(tabId)) {
      validOrder.push(tabId);
    }
  }

  for (const tabId of DEFAULT_TAB_ORDER) {
    if (!validOrder.includes(tabId)) {
      validOrder.push(tabId);
    }
  }

  return validOrder;
};

const parseStoredTabPreferences = (
  value: string | null
): { tabPrefs: TabPreferences | null; shouldPersist: boolean } => {
  if (!value) {
    return { tabPrefs: null, shouldPersist: false };
  }

  try {
    const stored = JSON.parse(value) as StoredTabPreferences;
    const parsed: TabPreferences = {
      showLikedSongs: getBooleanValue(
        stored.showLikedSongs,
        defaultTabPreferences.showLikedSongs
      ),
      showAlbums: getBooleanValue(
        stored.showAlbums,
        defaultTabPreferences.showAlbums
      ),
      showPodcasts: getBooleanValue(
        stored.showPodcasts,
        defaultTabPreferences.showPodcasts
      ),
      showPlaylists: getBooleanValue(
        stored.showPlaylists,
        defaultTabPreferences.showPlaylists
      ),
      showSearch: getBooleanValue(
        stored.showSearch,
        defaultTabPreferences.showSearch
      ),
      tabOrder: sanitiseTabOrder(stored.tabOrder),
    };

    return {
      tabPrefs: parsed,
      shouldPersist: JSON.stringify(parsed) !== value,
    };
  } catch (error) {
    logError("Error parsing tab preferences:", error);
    return {
      tabPrefs: { ...defaultTabPreferences, tabOrder: [...DEFAULT_TAB_ORDER] },
      shouldPersist: true,
    };
  }
};

const parseStoredSettings = (
  results: readonly [string, string | null][]
): {
  settings: BooleanSettings;
  sortSettings: LibrarySortSettings;
  sortSettingsToPersist: [string, string][];
  tabPrefs: TabPreferences | null;
  shouldPersistTabPrefs: boolean;
} => {
  const settings = { ...defaultSettings };
  const sortSettings = { ...defaultSortSettings };
  const sortSettingsToPersist: [string, string][] = [];
  let tabPrefs: TabPreferences | null = null;
  let shouldPersistTabPrefs = false;
  for (const [key, value] of results) {
    if (key === TAB_PREFERENCES_KEY) {
      const parsed = parseStoredTabPreferences(value);
      tabPrefs = parsed.tabPrefs;
      shouldPersistTabPrefs = parsed.shouldPersist;
    } else if (key === SORT_SETTING_KEYS.albumSortOrder) {
      const parsed = parseStoredSortOption(
        value,
        defaultSortSettings.albumSortOrder
      );
      sortSettings.albumSortOrder = parsed.sortOption;
      if (parsed.shouldPersist) {
        sortSettingsToPersist.push([
          SORT_SETTING_KEYS.albumSortOrder,
          parsed.sortOption,
        ]);
      }
    } else if (key === SORT_SETTING_KEYS.podcastSortOrder) {
      const parsed = parseStoredSortOption(
        value,
        defaultSortSettings.podcastSortOrder
      );
      sortSettings.podcastSortOrder = parsed.sortOption;
      if (parsed.shouldPersist) {
        sortSettingsToPersist.push([
          SORT_SETTING_KEYS.podcastSortOrder,
          parsed.sortOption,
        ]);
      }
    } else if (value !== null && key in SETTING_KEYS) {
      settings[key as SettingKey] = value === "true";
    }
  }
  return {
    settings,
    sortSettings,
    sortSettingsToPersist,
    tabPrefs,
    shouldPersistTabPrefs,
  };
};

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<BooleanSettings>(defaultSettings);
  const [sortSettings, setSortSettings] =
    useState<LibrarySortSettings>(defaultSortSettings);
  const [tabPreferences, setTabPreferences] = useState<TabPreferences>(
    defaultTabPreferences
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const keys = Object.values(SETTING_KEYS);
        const sortKeys = Object.values(SORT_SETTING_KEYS);
        const results = await AsyncStorage.multiGet([
          ...keys,
          TAB_PREFERENCES_KEY,
          ...sortKeys,
        ]);
        const {
          settings: loaded,
          sortSettings: loadedSortSettings,
          sortSettingsToPersist,
          tabPrefs,
          shouldPersistTabPrefs,
        } = parseStoredSettings(results);
        if (tabPrefs) {
          setTabPreferences(tabPrefs);
          if (shouldPersistTabPrefs) {
            await AsyncStorage.setItem(
              TAB_PREFERENCES_KEY,
              JSON.stringify(tabPrefs)
            );
          }
        }
        setSettings(loaded);
        setSortSettings(loadedSortSettings);
        if (sortSettingsToPersist.length > 0) {
          await AsyncStorage.multiSet(sortSettingsToPersist);
        }
      } catch (error) {
        logError("Error loading settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const triggerHaptic = useCallback(() => {
    impactAsync(ImpactFeedbackStyle.Light);
  }, []);

  const setSetting = useCallback(async (key: SettingKey, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    await AsyncStorage.setItem(SETTING_KEYS[key], value.toString());
  }, []);

  const setInvertColors = useCallback(
    (v: boolean) => setSetting("invertColors", v),
    [setSetting]
  );
  const setHideAlbumCovers = useCallback(
    (v: boolean) => setSetting("hideAlbumCovers", v),
    [setSetting]
  );
  const setHideDetailCovers = useCallback(
    (v: boolean) => setSetting("hideDetailCovers", v),
    [setSetting]
  );
  const setShowPlaylistTrackCovers = useCallback(
    (v: boolean) => setSetting("showPlaylistTrackCovers", v),
    [setSetting]
  );
  const setHideCreatePlaylist = useCallback(
    (v: boolean) => setSetting("hideCreatePlaylist", v),
    [setSetting]
  );
  const setHideLikeButton = useCallback(
    (v: boolean) => setSetting("hideLikeButton", v),
    [setSetting]
  );
  const setHideDevicesButton = useCallback(
    (v: boolean) => setSetting("hideDevicesButton", v),
    [setSetting]
  );
  const setHideAddToPlaylistButton = useCallback(
    (v: boolean) => setSetting("hideAddToPlaylistButton", v),
    [setSetting]
  );
  const setHideLyricsButton = useCallback(
    (v: boolean) => setSetting("hideLyricsButton", v),
    [setSetting]
  );
  const setHidePlayingCover = useCallback(
    (v: boolean) => setSetting("hidePlayingCover", v),
    [setSetting]
  );
  const setHideYourEpisodes = useCallback(
    (v: boolean) => setSetting("hideYourEpisodes", v),
    [setSetting]
  );
  const setSortSetting = useCallback(
    async (key: SortSettingKey, value: LibrarySortOption) => {
      setSortSettings((prev) => ({ ...prev, [key]: value }));
      await AsyncStorage.setItem(SORT_SETTING_KEYS[key], value);
    },
    []
  );
  const setAlbumSortOrder = useCallback(
    (value: LibrarySortOption) => setSortSetting("albumSortOrder", value),
    [setSortSetting]
  );
  const setPodcastSortOrder = useCallback(
    (value: LibrarySortOption) => setSortSetting("podcastSortOrder", value),
    [setSortSetting]
  );

  const updateTabPreference = useCallback(
    async (key: keyof Omit<TabPreferences, "tabOrder">, value: boolean) => {
      try {
        const newPreferences = { ...tabPreferences, [key]: value };
        setTabPreferences(newPreferences);
        await AsyncStorage.setItem(
          TAB_PREFERENCES_KEY,
          JSON.stringify(newPreferences)
        );
      } catch (error) {
        logError("Error saving tab preferences:", error);
      }
    },
    [tabPreferences]
  );

  const reorderTab = useCallback(
    async (tabId: TabId, direction: "up" | "down") => {
      try {
        const currentOrder = [...tabPreferences.tabOrder];
        const currentIndex = currentOrder.indexOf(tabId);

        if (currentIndex === -1) {
          return;
        }
        if (direction === "up" && currentIndex === 0) {
          return;
        }
        if (direction === "down" && currentIndex === currentOrder.length - 1) {
          return;
        }

        const newIndex =
          direction === "up" ? currentIndex - 1 : currentIndex + 1;
        currentOrder.splice(currentIndex, 1);
        currentOrder.splice(newIndex, 0, tabId);

        const newPreferences = { ...tabPreferences, tabOrder: currentOrder };
        setTabPreferences(newPreferences);
        await AsyncStorage.setItem(
          TAB_PREFERENCES_KEY,
          JSON.stringify(newPreferences)
        );
      } catch (error) {
        logError("Error reordering tabs:", error);
      }
    },
    [tabPreferences]
  );

  const value: SettingsContextType = useMemo(
    () => ({
      triggerHaptic,
      invertColors: settings.invertColors,
      setInvertColors,
      hideAlbumCovers: settings.hideAlbumCovers,
      setHideAlbumCovers,
      hideDetailCovers: settings.hideDetailCovers,
      setHideDetailCovers,
      showPlaylistTrackCovers: settings.showPlaylistTrackCovers,
      setShowPlaylistTrackCovers,
      hideCreatePlaylist: settings.hideCreatePlaylist,
      setHideCreatePlaylist,
      hideLikeButton: settings.hideLikeButton,
      setHideLikeButton,
      hideDevicesButton: settings.hideDevicesButton,
      setHideDevicesButton,
      hideAddToPlaylistButton: settings.hideAddToPlaylistButton,
      setHideAddToPlaylistButton,
      hideLyricsButton: settings.hideLyricsButton,
      setHideLyricsButton,
      hidePlayingCover: settings.hidePlayingCover,
      setHidePlayingCover,
      hideYourEpisodes: settings.hideYourEpisodes,
      setHideYourEpisodes,
      albumSortOrder: sortSettings.albumSortOrder,
      setAlbumSortOrder,
      podcastSortOrder: sortSettings.podcastSortOrder,
      setPodcastSortOrder,
      tabPreferences,
      updateTabPreference,
      reorderTab,
      isLoading,
    }),
    [
      triggerHaptic,
      settings,
      setInvertColors,
      setHideAlbumCovers,
      setHideDetailCovers,
      setShowPlaylistTrackCovers,
      setHideCreatePlaylist,
      setHideLikeButton,
      setHideDevicesButton,
      setHideAddToPlaylistButton,
      setHideLyricsButton,
      setHidePlayingCover,
      setHideYourEpisodes,
      sortSettings,
      setAlbumSortOrder,
      setPodcastSortOrder,
      tabPreferences,
      updateTabPreference,
      reorderTab,
      isLoading,
    ]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
