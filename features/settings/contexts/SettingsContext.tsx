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
  hidePlayingCover: "hidePlayingCover",
  hideYourEpisodes: "hideYourEpisodes",
} as const;

type SettingKey = keyof typeof SETTING_KEYS;

type BooleanSettings = Record<SettingKey, boolean>;

export type TabId =
  | "index"
  | "artists"
  | "albums"
  | "podcasts"
  | "playlists"
  | "search";

export const DEFAULT_TAB_ORDER: TabId[] = [
  "index",
  "artists",
  "albums",
  "podcasts",
  "playlists",
  "search",
];

export interface TabPreferences {
  showLikedSongs: boolean;
  showArtists: boolean;
  showAlbums: boolean;
  showPodcasts: boolean;
  showPlaylists: boolean;
  showSearch: boolean;
  tabOrder: TabId[];
}

const defaultTabPreferences: TabPreferences = {
  showLikedSongs: true,
  showArtists: false,
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
  hidePlayingCover: false,
  hideYourEpisodes: false,
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
  hidePlayingCover: boolean;
  setHidePlayingCover: (value: boolean) => void;
  hideYourEpisodes: boolean;
  setHideYourEpisodes: (value: boolean) => void;
  tabPreferences: TabPreferences;
  updateTabPreference: (
    key: keyof Omit<TabPreferences, "tabOrder">,
    value: boolean
  ) => Promise<void>;
  reorderTab: (tabId: TabId, direction: "up" | "down") => Promise<void>;
  isLoading: boolean;
}

const parseStoredSettings = (
  results: readonly [string, string | null][]
): { settings: BooleanSettings; tabPrefs: TabPreferences | null } => {
  const settings = { ...defaultSettings };
  let tabPrefs: TabPreferences | null = null;
  for (const [key, value] of results) {
    if (key === TAB_PREFERENCES_KEY) {
      if (value) {
        tabPrefs = { ...defaultTabPreferences, ...JSON.parse(value) };
      }
    } else if (value !== null && key in SETTING_KEYS) {
      settings[key as SettingKey] = value === "true";
    }
  }
  return { settings, tabPrefs };
};

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<BooleanSettings>(defaultSettings);
  const [tabPreferences, setTabPreferences] = useState<TabPreferences>(
    defaultTabPreferences
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const keys = Object.values(SETTING_KEYS);
        const results = await AsyncStorage.multiGet([
          ...keys,
          TAB_PREFERENCES_KEY,
        ]);
        const { settings: loaded, tabPrefs } = parseStoredSettings(results);
        if (tabPrefs) {
          setTabPreferences(tabPrefs);
        }
        setSettings(loaded);
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
  const setHidePlayingCover = useCallback(
    (v: boolean) => setSetting("hidePlayingCover", v),
    [setSetting]
  );
  const setHideYourEpisodes = useCallback(
    (v: boolean) => setSetting("hideYourEpisodes", v),
    [setSetting]
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
      hidePlayingCover: settings.hidePlayingCover,
      setHidePlayingCover,
      hideYourEpisodes: settings.hideYourEpisodes,
      setHideYourEpisodes,
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
      setHidePlayingCover,
      setHideYourEpisodes,
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
