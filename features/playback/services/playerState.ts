import type {
  SpotifyPlayerState as NativeSpotifyPlayerState,
  SpotifyTrack as NativeSpotifyTrack,
} from "@/modules/spotify-sdk";
import type {
  SpotifyCurrentlyPlaying,
  SpotifyEpisode,
  SpotifyImage,
  SpotifyShow,
  SpotifyTrackSimple,
} from "@/shared/types/spotify";

export interface PlaybackSnapshot {
  track: SpotifyTrackSimple | SpotifyEpisode | null;
  isPlaying: boolean;
  progressMs: number;
  receivedAt: number;
  currentlyPlayingType: SpotifyCurrentlyPlaying["currently_playing_type"];
}

const APP_REMOTE_DEVICE: SpotifyCurrentlyPlaying["device"] = {
  id: "spotify_app_remote",
  is_active: true,
  is_private_session: false,
  is_restricted: false,
  name: "Spotify App Remote",
  type: "smartphone",
  volume_percent: 100,
  supports_volume: false,
  uri: "spotify:device:app_remote",
};

const getNativeArtistId = (track: NativeSpotifyTrack) =>
  track.artist.uri.split(":").pop() || "";

const buildTrackArtist = (track: NativeSpotifyTrack) => ({
  external_urls: { spotify: "" },
  href: "",
  id: getNativeArtistId(track),
  name: track.artist.name,
  type: "artist" as const,
  uri: track.artist.uri,
});

const buildBaseResponse = (
  playerState: NativeSpotifyPlayerState,
  timestamp: number,
  currentlyPlayingType: SpotifyCurrentlyPlaying["currently_playing_type"]
): Omit<SpotifyCurrentlyPlaying, "item"> => ({
  timestamp,
  context: null,
  progress_ms: playerState.playbackPosition,
  is_playing: !playerState.isPaused,
  currently_playing_type: currentlyPlayingType,
  actions: { disallows: {} },
  device: APP_REMOTE_DEVICE,
  shuffle_state: playerState.playbackOptions.isShuffling,
  repeat_state:
    (["off", "track", "context"] as const)[
      playerState.playbackOptions.repeatMode
    ] ?? "off",
});

const buildEpisodeItem = (
  track: NativeSpotifyTrack,
  albumImages: SpotifyImage[]
): SpotifyEpisode => {
  const show: SpotifyShow = {
    id: track.album.uri.split(":").pop() || "",
    name: track.album.name || track.name,
    description: "",
    publisher: track.artist.name,
    images: albumImages,
    total_episodes: 0,
    uri: track.album.uri,
    href: "",
    media_type: "audio",
    explicit: false,
    type: "show",
    languages: [],
  };

  return {
    id: track.uri.split(":").pop() || "",
    name: track.name,
    description: "",
    duration_ms: track.duration,
    release_date: "",
    release_date_precision: "day",
    uri: track.uri,
    href: "",
    type: "episode",
    images: albumImages,
    explicit: false,
    is_externally_hosted: false,
    is_playable: true,
    languages: [],
    show,
  };
};

const buildTrackItem = (
  track: NativeSpotifyTrack,
  albumImages: SpotifyImage[]
): SpotifyTrackSimple => {
  const artist = buildTrackArtist(track);

  return {
    artists: [artist],
    disc_number: 1,
    duration_ms: track.duration,
    explicit: false,
    external_urls: { spotify: "" },
    href: "",
    id: track.uri.split(":").pop() || "",
    is_local: false,
    name: track.name,
    preview_url: null,
    track_number: 1,
    type: "track",
    uri: track.uri,
    album: {
      album_type: "album",
      total_tracks: 1,
      external_urls: { spotify: "" },
      href: "",
      id: track.album.uri.split(":").pop() || "",
      images: albumImages,
      name: track.album.name,
      release_date: "",
      release_date_precision: "day",
      type: "album",
      uri: track.album.uri,
      artists: [artist],
    },
  };
};

export const normalisePlayerState = (
  playerState: NativeSpotifyPlayerState,
  albumImages: SpotifyImage[] = [],
  timestamp = Date.now()
): SpotifyCurrentlyPlaying => {
  const currentlyPlayingType: SpotifyCurrentlyPlaying["currently_playing_type"] =
    playerState.track.isEpisode ? "episode" : "track";
  const baseResponse = buildBaseResponse(
    playerState,
    timestamp,
    currentlyPlayingType
  );

  if (playerState.track.isEpisode) {
    return {
      ...baseResponse,
      item: buildEpisodeItem(playerState.track, albumImages),
    };
  }

  return {
    ...baseResponse,
    item: buildTrackItem(playerState.track, albumImages),
  };
};

export const toPlaybackSnapshot = (
  playerState: NativeSpotifyPlayerState,
  receivedAt = Date.now()
): PlaybackSnapshot => {
  const currentlyPlaying = normalisePlayerState(playerState, [], receivedAt);

  return {
    track: currentlyPlaying.item,
    isPlaying: currentlyPlaying.is_playing,
    progressMs: currentlyPlaying.progress_ms ?? 0,
    receivedAt,
    currentlyPlayingType: currentlyPlaying.currently_playing_type,
  };
};
