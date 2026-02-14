import { getItemAsync } from "expo-secure-store";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

const APP_STATE_PATTERN = /inactive|background/;

import {
  AUTH_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  TOKEN_EXPIRY_KEY,
} from "@/constants/spotify";
import { useCredentials } from "@/features/credentials";
import { useAlbumsStore } from "@/features/library/stores/useAlbumsStore";
import { usePlaylistsStore } from "@/features/library/stores/usePlaylistsStore";
import { usePodcastsStore } from "@/features/library/stores/usePodcastsStore";
import { useSavedEpisodesStore } from "@/features/library/stores/useSavedEpisodesStore";
import { useSavedTracksStore } from "@/features/library/stores/useSavedTracksStore";
import { clearCachedData } from "@/features/library/utils/cache";
import type { SpotifyUser } from "@/shared/types/spotify";
import { configureApiClient } from "@/shared/utils/api-client";
import { logError, logInfo, logWarn } from "@/shared/utils/logger";
import {
  loadStoredAuth,
  loginWithSpotify,
  logoutFromSpotify,
} from "../services/spotifyAuth";

export interface AuthError {
  title: string;
  message: string;
}

export interface AuthContextType {
  accessToken: string | null;
  refreshToken: string | null;
  user: SpotifyUser | null;
  tokenExpiry: number | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  appState: AppStateStatus;
  authError: AuthError | null;
  clearAuthError: () => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  ensureValidToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [initialAuthProcessed, setInitialAuthProcessed] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const appStateRef = useRef(AppState.currentState);
  const [authError, setAuthError] = useState<AuthError | null>(null);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const handleTokenUpdate = useCallback(
    (newAccessToken: string, newRefreshToken?: string, expiry?: number) => {
      logInfo("AuthContext: Token update", {
        hasNewAccessToken: !!newAccessToken,
        hasNewRefreshToken: !!newRefreshToken,
        newExpiry: expiry ? new Date(expiry).toISOString() : null,
      });
      setAccessToken(newAccessToken);
      if (newRefreshToken) {
        setRefreshToken(newRefreshToken);
      }
      if (expiry) {
        setTokenExpiry(expiry);
      }
    },
    []
  );

  const handleUserUpdate = useCallback((userData: SpotifyUser) => {
    setUser(userData);
  }, []);

  const clearState = useCallback(() => {
    logInfo("AuthContext: Clearing all state (logout)");
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setTokenExpiry(null);
    setIsLoading(false);
    setIsAuthenticating(false);
    setInitialAuthProcessed(false);
    logInfo("AuthContext: State cleared");
  }, []);

  const handleLibraryCleanup = useCallback(async () => {
    await clearCachedData();
    useAlbumsStore.getState().reset();
    usePlaylistsStore.getState().reset();
    usePodcastsStore.getState().reset();
    useSavedEpisodesStore.getState().reset();
    useSavedTracksStore.getState().reset();
  }, []);

  const ensureValidToken = useCallback(async (): Promise<string | null> => {
    const [latestAccessToken, latestRefreshToken, latestTokenExpiry] =
      await Promise.all([
        getItemAsync(AUTH_TOKEN_KEY),
        getItemAsync(REFRESH_TOKEN_KEY),
        getItemAsync(TOKEN_EXPIRY_KEY),
      ]);

    if (!(latestAccessToken && latestRefreshToken && latestTokenExpiry)) {
      logInfo("AuthContext: Missing token data for validation", {
        hasAccessToken: !!latestAccessToken,
        hasRefreshToken: !!latestRefreshToken,
        hasTokenExpiry: !!latestTokenExpiry,
      });
      return null;
    }

    const expiryTimestamp = Number.parseInt(latestTokenExpiry, 10);
    const timeUntilExpiry = expiryTimestamp - Date.now();
    const needsRefresh = timeUntilExpiry < 5 * 60 * 1000;

    if (needsRefresh) {
      const isAlreadyExpired = timeUntilExpiry < 0;
      logInfo(
        isAlreadyExpired
          ? "AuthContext: Token already expired, refreshing..."
          : "AuthContext: Token expires soon, refreshing...",
        { timeUntilExpiry }
      );

      try {
        const { refreshAccessToken } = await import(
          "@/shared/utils/spotifyApi"
        );
        const refreshed = await refreshAccessToken(
          latestRefreshToken,
          handleTokenUpdate,
          async () => {
            await logoutFromSpotify(clearState, handleLibraryCleanup);
          }
        );
        if (refreshed) {
          const updatedToken = await getItemAsync(AUTH_TOKEN_KEY);
          logInfo("AuthContext: Token refresh successful", {
            hasUpdatedToken: !!updatedToken,
          });
          return updatedToken || latestAccessToken;
        }
        logWarn(
          "AuthContext: Token refresh failed, but will try to use current token"
        );
        return latestAccessToken;
      } catch (error) {
        logError("AuthContext: Token refresh failed:", error);
        return latestAccessToken;
      }
    }

    return latestAccessToken;
  }, [handleTokenUpdate, clearState, handleLibraryCleanup]);

  const { credentials, redirectUri } = useCredentials();

  const login = useCallback(async () => {
    if (isAuthenticating) {
      logInfo("AuthContext: Authentication already in progress");
      return;
    }

    if (!credentials) {
      logError("AuthContext: No credentials configured");
      return;
    }

    setIsAuthenticating(true);
    setIsLoading(true);

    try {
      await loginWithSpotify(
        credentials,
        redirectUri,
        handleTokenUpdate,
        handleUserUpdate,
        async () => {
          /* no-op */
        }
      );
    } catch (error: unknown) {
      logError("AuthContext: Error during authentication:", error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("invalid_client") ||
        errorMessage.includes("Invalid client secret") ||
        errorMessage.includes("AUTHENTICATION_SERVICE_UNKNOWN_ERROR")
      ) {
        setAuthError({
          title: "Invalid Credentials",
          message:
            "Your Client ID or Secret is incorrect.\n\nPlease check your Spotify Dashboard and try again.",
        });
      } else {
        setAuthError({
          title: "Login Failed",
          message: errorMessage,
        });
      }
    } finally {
      setIsAuthenticating(false);
      setIsLoading(false);
    }
  }, [
    isAuthenticating,
    credentials,
    redirectUri,
    handleTokenUpdate,
    handleUserUpdate,
  ]);

  const logout = useCallback(async () => {
    if (isAuthenticating) {
      logWarn("AuthContext: Logout blocked - authentication in progress");
      return;
    }

    logInfo("AuthContext: Logout initiated");
    await logoutFromSpotify(clearState, handleLibraryCleanup);
    logInfo("AuthContext: Logout completed");
  }, [isAuthenticating, clearState, handleLibraryCleanup]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(APP_STATE_PATTERN) &&
        nextAppState === "active"
      ) {
        logInfo("AuthContext: App resumed");
      }
      appStateRef.current = nextAppState;
      setAppState(nextAppState);
    };

    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      appStateSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (initialAuthProcessed || isAuthenticating) {
      return;
    }

    logInfo("AuthContext: Starting initial auth load...");

    const loadInitialAuth = async () => {
      try {
        const authData = await loadStoredAuth();

        if (authData.accessToken) {
          setAccessToken(authData.accessToken);
          setRefreshToken(authData.refreshToken);
          setUser(authData.user);
          setTokenExpiry(authData.tokenExpiry);
        }
      } catch (error) {
        logError("AuthContext: Failed to load auth state:", error);
      } finally {
        setIsLoading(false);
        setInitialAuthProcessed(true);
        logInfo("AuthContext: Initial auth load completed");
      }
    };

    loadInitialAuth();
  }, [isAuthenticating, initialAuthProcessed]);

  useEffect(() => {
    configureApiClient({ getToken: ensureValidToken, onLogout: logout });
  }, [ensureValidToken, logout]);

  const isAuthenticated = !!accessToken && !!user;

  const value: AuthContextType = useMemo(
    () => ({
      accessToken,
      refreshToken,
      user,
      tokenExpiry,
      isLoading,
      isAuthenticated,
      appState,
      authError,
      clearAuthError,
      login,
      logout,
      ensureValidToken,
    }),
    [
      accessToken,
      refreshToken,
      user,
      tokenExpiry,
      isLoading,
      isAuthenticated,
      appState,
      authError,
      clearAuthError,
      login,
      logout,
      ensureValidToken,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
