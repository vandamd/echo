import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFonts } from "expo-font";
import { setVisibilityAsync } from "expo-navigation-bar";
import { Stack, useRouter } from "expo-router";
import { setStatusBarHidden } from "expo-status-bar";
import { setBackgroundColorAsync } from "expo-system-ui";
import { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "@/features/auth";
import { CredentialsProvider, useCredentials } from "@/features/credentials";
import { useLibraryInit } from "@/features/library";
import { PlaybackProvider } from "@/features/playback";
import { SettingsProvider, useSettings } from "@/features/settings";
import { StyledText } from "@/shared/components/StyledText";
import "@/shared/utils/logger";

function RootNavigation() {
  useLibraryInit();
  const router = useRouter();
  const {
    accessToken,
    isLoading: authLoading,
    authError,
    clearAuthError,
  } = useAuth();
  const {
    tabPreferences,
    isLoading: preferencesLoading,
    invertColors,
  } = useSettings();
  const { isLoading: credentialsLoading } = useCredentials();
  const [fontsLoaded, fontError] = useFonts({
    "PublicSans-Regular": require("../assets/fonts/PublicSans-Regular.ttf"),
    ...MaterialIcons.font,
  });
  const isLoading =
    authLoading ||
    preferencesLoading ||
    credentialsLoading ||
    !(fontsLoaded || fontError);
  const hasDoneInitialRouting = useRef(false);
  const previousAccessToken = useRef<string | null>(null);

  useEffect(() => {
    if (authError) {
      router.push({
        pathname: "/error",
        params: {
          title: authError.title,
          message: authError.message,
        },
      });
      clearAuthError();
    }
  }, [authError, clearAuthError, router]);

  const getFirstAvailableTab = useCallback(() => {
    if (tabPreferences.showLikedSongs) {
      return "/(tabs)";
    }
    if (tabPreferences.showArtists) {
      return "/(tabs)/artists";
    }
    if (tabPreferences.showAlbums) {
      return "/(tabs)/albums";
    }
    if (tabPreferences.showPodcasts) {
      return "/(tabs)/podcasts";
    }
    if (tabPreferences.showPlaylists) {
      return "/(tabs)/playlists";
    }
    if (tabPreferences.showSearch) {
      return "/(tabs)/search";
    }
    return "/(tabs)/settings";
  }, [tabPreferences]);

  useEffect(() => {
    setStatusBarHidden(true, "none");
    setVisibilityAsync("hidden");
    const newColor = invertColors ? "#FFFFFF" : "#000000";
    setBackgroundColorAsync(newColor);
  }, [invertColors]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const justLoggedIn = !previousAccessToken.current && accessToken;
    const shouldRoute = !hasDoneInitialRouting.current || justLoggedIn;

    if (shouldRoute) {
      if (accessToken) {
        const firstAvailableTab = getFirstAvailableTab();
        router.replace(firstAvailableTab as never);
      } else {
        router.replace("/login");
      }
      hasDoneInitialRouting.current = true;
    }

    previousAccessToken.current = accessToken;
  }, [accessToken, isLoading, router, getFirstAvailableTab]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: invertColors ? "white" : "black",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {fontsLoaded && <StyledText>Loading data...</StyledText>}
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none",
        contentStyle: { backgroundColor: invertColors ? "white" : "black" },
        freezeOnBlur: true,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="album/[id]" />
      <Stack.Screen name="artist/[id]" />
      <Stack.Screen name="playlist/[id]" />
      <Stack.Screen name="playlist/[id]/edit" />
      <Stack.Screen name="playlist/[id]/cover" />
      <Stack.Screen name="podcast/[id]" />
      <Stack.Screen name="search-results" />
      <Stack.Screen name="playing" />
      <Stack.Screen name="login" />
      <Stack.Screen name="select-device" />
      <Stack.Screen name="add-to-playlist" />
      <Stack.Screen name="create-playlist" />
      <Stack.Screen name="customise" />
      <Stack.Screen name="customise-tabs" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CredentialsProvider>
        <SettingsProvider>
          <AuthProvider>
            <PlaybackProvider>
              <RootNavigation />
            </PlaybackProvider>
          </AuthProvider>
        </SettingsProvider>
      </CredentialsProvider>
    </GestureHandlerRootView>
  );
}
