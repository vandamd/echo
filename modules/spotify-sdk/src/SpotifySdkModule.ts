import { NativeModule, requireNativeModule } from "expo";
import type {
  SpotifyApiResponse,
  SpotifyAuthResponse,
  SpotifyPlayerState,
  SpotifySdkEvents,
} from "./SpotifySdk.types";

declare class SpotifySdkModule extends NativeModule<SpotifySdkEvents> {
  AUTH_TOKEN_REFRESH_REQUEST_CODE: number;
  AUTH_TOKEN_REQUEST_CODE: number;

  authorize(
    clientId: string,
    redirectUri: string,
    scopes: string[],
    state?: string,
    showDialog?: boolean
  ): Promise<SpotifyApiResponse<SpotifyAuthResponse>>;
  clearSession(): Promise<{ cleared: boolean }>;

  connect(
    clientId: string,
    redirectUri: string
  ): Promise<{ connected: boolean }>;
  disconnect(): Promise<{ disconnected: boolean }>;
  isConnected(): Promise<boolean>;
  play(uri?: string): Promise<{ playing: boolean }>;
  playUriWithSkipToUri(
    uri: string,
    skipToUri: string
  ): Promise<{ playing: boolean }>;
  pause(): Promise<{ paused: boolean }>;
  resume(): Promise<{ resumed: boolean }>;
  skipNext(): Promise<{ skipped: boolean }>;
  skipPrevious(): Promise<{ skipped: boolean }>;
  skipToIndex(uri: string, index: number): Promise<{ skipped: boolean }>;
  seekTo(positionMs: number): Promise<{ seeked: boolean }>;
  setShuffle(shuffle: boolean): Promise<{ shuffleSet: boolean }>;
  setRepeat(repeatMode: number): Promise<{ repeatSet: boolean }>;
  getPlayerState(): Promise<SpotifyPlayerState>;
  getImage(uri: string, size?: string): Promise<string>;
  getCurrentTrackImage(size?: string): Promise<string>;
  addToLibrary(uri: string): Promise<{ added: boolean }>;
  removeFromLibrary(uri: string): Promise<{ removed: boolean }>;
  getLibraryState(uri: string): Promise<{ isAdded: boolean; canAdd: boolean }>;
}

export default requireNativeModule<SpotifySdkModule>("SpotifySdk");
