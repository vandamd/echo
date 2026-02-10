// Removed React Native view imports as they're not needed for this module

export interface SpotifySdkModuleEvents {
  onChange: (params: ChangeEventPayload) => void;
}

export interface ChangeEventPayload {
  value: string;
}

// SpotifySdkViewProps removed - module doesn't export view components

// Spotify Android SDK Types

// Auth Library Types
export interface SpotifyAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  showDialog?: boolean;
  state?: string;
  responseType?: "code" | "token";
}

export interface SpotifyAuthResponse {
  accessToken?: string;
  authorizationCode?: string;
  error?: string;
  state?: string;
  type: "TOKEN" | "CODE" | "ERROR" | "EMPTY";
}

export interface SpotifyAuthRequest {
  clientId: string;
  redirectUri: string;
  responseType: "TOKEN" | "CODE";
  scopes: string[];
  state?: string;
  showDialog?: boolean;
}

// User Profile Types
export interface SpotifyUser {
  id: string;
  displayName?: string;
  images?: SpotifyImage[];
}

export interface SpotifyImage {
  url: string;
  width?: number;
  height?: number;
}

// App Remote Library Types
export interface SpotifyConnectionParams {
  clientId: string;
  redirectUri: string;
}

export interface SpotifyTrack {
  uri: string;
  name: string;
  artist: {
    name: string;
    uri: string;
  };
  album: {
    name: string;
    uri: string;
  };
  imageUri: string;
  duration: number;
  isPodcast: boolean;
  isEpisode: boolean;
}

export interface SpotifyPlayerState {
  track: SpotifyTrack;
  playbackPosition: number;
  playbackSpeed: number;
  isPaused: boolean;
  playbackOptions: {
    isShuffling: boolean;
    repeatMode: number;
  };
  playbackRestrictions: {
    canSkipNext: boolean;
    canSkipPrev: boolean;
    canRepeatTrack: boolean;
    canRepeatContext: boolean;
    canToggleShuffle: boolean;
    canSeek: boolean;
  };
}

export interface SpotifyPlaybackOptions {
  isShuffling?: boolean;
  repeatMode?: number; // 0 = off, 1 = context, 2 = track
}

// Content API Types
export interface SpotifyPlaylist {
  uri: string;
  name: string;
  description?: string;
  owner: {
    id: string;
    displayName?: string;
  };
  images?: SpotifyImage[];
  items: {
    total: number;
  };
  collaborative: boolean;
  public?: boolean;
}

export interface SpotifyAlbum {
  uri: string;
  name: string;
  artists: SpotifyArtist[];
  images?: SpotifyImage[];
  releaseDate?: string;
  totalTracks: number;
}

export interface SpotifyArtist {
  uri: string;
  name: string;
  images?: SpotifyImage[];
  genres?: string[];
}

export interface SpotifyListItem {
  id: string;
  uri: string;
  name: string;
  subtitle?: string;
  playable: boolean;
  imageUri?: string;
}

export interface SpotifyRecommendation {
  uri: string;
  title: string;
  subtitle?: string;
  imageUri?: string;
}

// Error types
export interface SpotifyError {
  message: string;
  code?: string;
  details?: unknown;
}

// Connection State
export interface SpotifyConnectionState {
  isLoggedIn: boolean;
  accessToken?: string;
  expiresAt?: number;
}

// Playback Context Types
export interface SpotifyPlaybackContext {
  uri: string;
  title: string;
  subtitle?: string;
  type: string;
}

// Subscribe Types for Capabilities
export interface SpotifyCapabilities {
  canPlayOnDemand: boolean;
}

// Event types
export type SpotifyPlayerStateCallback = (
  playerState: SpotifyPlayerState
) => void;
export type SpotifyErrorCallback = (error: SpotifyError) => void;
export type SpotifyConnectionCallback = () => void;
export type SpotifyAuthCallback = (response: SpotifyAuthResponse) => void;

// Module Events
export interface SpotifySdkEvents {
  onPlayerStateChanged: (event: { playerState: SpotifyPlayerState }) => void;
  onConnectionError: (event: { error: string }) => void;
  onConnected: (event: { connected: boolean }) => void;
  onDisconnected: (event: { disconnected: boolean; forced?: boolean }) => void;
  onActivityStarted: (event: { foreground: boolean }) => void;
  onActivityStopped: (event: {
    background: boolean;
    skipDisconnect?: boolean;
  }) => void;
  onAuthComplete: (event: { response: SpotifyAuthResponse }) => void;
  onCapabilitiesChanged: (event: { capabilities: SpotifyCapabilities }) => void;
  onUserLoggedIn: (event: { user: SpotifyUser }) => void;
  onUserLoggedOut: (event: { loggedOut: boolean }) => void;
  // biome-ignore lint/suspicious/noExplicitAny: index signature requires any for event handler variance
  [key: string]: (...args: any[]) => void;
}

// API Response Types
export interface SpotifyApiResponse<T> {
  success: boolean;
  data?: T;
  error?: SpotifyError;
}

// Search Types
export interface SpotifySearchResult {
  tracks?: SpotifyTrack[];
  albums?: SpotifyAlbum[];
  artists?: SpotifyArtist[];
  playlists?: SpotifyPlaylist[];
}

// Queue Types
export interface SpotifyQueue {
  currentTrack: SpotifyTrack;
  nextTracks: SpotifyTrack[];
  previousTracks: SpotifyTrack[];
}
