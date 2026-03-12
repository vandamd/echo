import { getStoredCredentials, REDIRECT_URI } from "@/features/credentials";
import type { SpotifyPlayerState } from "./SpotifySdk.types";
import SpotifySdkNative from "./SpotifySdkModule";

class SpotifySDK {
  private connectionPromise: Promise<boolean> | null = null;

  connect(): Promise<boolean> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = (async () => {
      try {
        if (await this.isConnected()) {
          return true;
        }
        const credentials = await getStoredCredentials();
        if (!credentials) {
          return false;
        }
        const result = await SpotifySdkNative.connect(
          credentials.clientId,
          REDIRECT_URI
        );
        return result.connected;
      } finally {
        this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  async disconnect(): Promise<void> {
    await SpotifySdkNative.disconnect();
  }

  isConnected(): Promise<boolean> {
    return SpotifySdkNative.isConnected();
  }

  // Player controls with auto-connection
  async play(uri?: string): Promise<void> {
    await this.ensureConnected();
    await SpotifySdkNative.play(uri);
  }

  async playUriWithSkipToUri(uri: string, skipToUri: string): Promise<void> {
    await this.ensureConnected();
    await SpotifySdkNative.playUriWithSkipToUri(uri, skipToUri);
  }

  async pause(): Promise<void> {
    await this.ensureConnected();
    await SpotifySdkNative.pause();
  }

  async resume(): Promise<void> {
    await this.ensureConnected();
    await SpotifySdkNative.resume();
  }

  async skipNext(): Promise<void> {
    await this.ensureConnected();
    await SpotifySdkNative.skipNext();
  }

  async skipPrevious(): Promise<void> {
    await this.ensureConnected();
    await SpotifySdkNative.skipPrevious();
  }

  async skipToIndex(uri: string, index: number): Promise<void> {
    await this.ensureConnected();
    await SpotifySdkNative.skipToIndex(uri, index);
  }

  async seekTo(positionMs: number): Promise<void> {
    await this.ensureConnected();
    await SpotifySdkNative.seekTo(positionMs);
  }

  async setShuffle(enabled: boolean): Promise<void> {
    await this.ensureConnected();
    await SpotifySdkNative.setShuffle(enabled);
  }

  async setRepeat(mode: number): Promise<void> {
    await this.ensureConnected();
    await SpotifySdkNative.setRepeat(mode);
  }

  async getPlayerState(): Promise<SpotifyPlayerState | null> {
    if (!(await this.isConnected())) {
      return null;
    }
    return SpotifySdkNative.getPlayerState();
  }

  async getImage(uri: string, size?: string): Promise<string | null> {
    await this.ensureConnected();
    return SpotifySdkNative.getImage(uri, size);
  }

  async getCurrentTrackImage(size?: string): Promise<string | null> {
    await this.ensureConnected();
    return SpotifySdkNative.getCurrentTrackImage(size);
  }

  // Library methods
  async addToLibrary(uri: string): Promise<boolean> {
    await this.ensureConnected();
    const result = await SpotifySdkNative.addToLibrary(uri);
    return result.added;
  }

  async removeFromLibrary(uri: string): Promise<boolean> {
    await this.ensureConnected();
    const result = await SpotifySdkNative.removeFromLibrary(uri);
    return result.removed;
  }

  async getLibraryState(
    uri: string
  ): Promise<{ isAdded: boolean; canAdd: boolean } | null> {
    if (!(await this.isConnected())) {
      return null;
    }
    return SpotifySdkNative.getLibraryState(uri);
  }

  // Internal helper
  private async ensureConnected(): Promise<void> {
    if (!(await this.isConnected())) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error("Failed to connect to Spotify");
      }
    }
  }

  // Event subscriptions with automatic cleanup
  onPlayerStateChanged(
    callback: (state: SpotifyPlayerState) => void
  ): () => void {
    const subscription = SpotifySdkNative.addListener(
      "onPlayerStateChanged",
      (event) => callback(event.playerState)
    );
    return () => subscription.remove();
  }

  onConnectionChanged(callback: (connected: boolean) => void): () => void {
    const connectedSub = SpotifySdkNative.addListener("onConnected", () =>
      callback(true)
    );
    const disconnectedSub = SpotifySdkNative.addListener("onDisconnected", () =>
      callback(false)
    );
    const startedSub = SpotifySdkNative.addListener("onActivityStarted", () => {
      /* keep alive */
    });

    return () => {
      connectedSub.remove();
      disconnectedSub.remove();
      startedSub.remove();
    };
  }

  onError(callback: (error: string) => void): () => void {
    const subscription = SpotifySdkNative.addListener(
      "onConnectionError",
      (event) => callback(event.error)
    );
    return () => subscription.remove();
  }
}

export const spotify = new SpotifySDK();
