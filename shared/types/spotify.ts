export interface SpotifyImage {
  url: string;
  height?: number;
  width?: number;
}

export interface SpotifyPlaylistOwner {
  display_name?: string;
  id: string;
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  images?: SpotifyImage[];
  uri: string;
  href: string;
  type: "user";
}

export interface SpotifyPaginatedResponse<T> {
  href: string;
  items: T[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  images: SpotifyImage[];
  owner: SpotifyPlaylistOwner;
  items: {
    href: string;
    total: number;
  };
  public?: boolean;
  collaborative: boolean;
  uri: string;
  href: string;
}

export type SpotifyPlaylistsResponse =
  SpotifyPaginatedResponse<SpotifyPlaylist>;

export interface SpotifyArtistSimple {
  external_urls: { spotify: string };
  href: string;
  id: string;
  name: string;
  type: "artist";
  uri: string;
}

export interface SpotifyAlbum {
  album_type: "album" | "single" | "compilation";
  total_tracks: number;
  external_urls: { spotify: string };
  href: string;
  id: string;
  images: SpotifyImage[];
  name: string;
  release_date: string;
  release_date_precision: "year" | "month" | "day";
  type: "album";
  uri: string;
  artists: SpotifyArtistSimple[];
  tracks?: SpotifyAlbumTracks;
}

export interface SpotifyArtist {
  external_urls: { spotify: string };
  genres: string[];
  href: string;
  id: string;
  images: SpotifyImage[];
  name: string;
  type: "artist";
  uri: string;
}

export interface SpotifyArtists {
  href: string;
  limit: number;
  next: string | null;
  cursors: Cursor;
  total: number;
  items: SpotifyArtist[];
}

export interface Cursor {
  after: string;
  before: string;
}

export interface SpotifyFollowedArtistsResponse {
  artists: SpotifyArtists;
}

export interface SpotifyAlbumTracks
  extends SpotifyPaginatedResponse<SpotifyTrackSimple> {
  uri: string;
}

export interface SpotifyTrackSimple {
  artists: SpotifyArtistSimple[];
  disc_number: number;
  duration_ms: number;
  explicit: boolean;
  external_urls: { spotify: string };
  href: string;
  id: string;
  is_local: boolean;
  name: string;
  preview_url: string | null;
  track_number: number;
  type: "track";
  uri: string;
  album?: SpotifyAlbum;
}

export interface SpotifySavedAlbum {
  added_at: string;
  album: SpotifyAlbum;
}

export type SpotifySavedAlbumsResponse =
  SpotifyPaginatedResponse<SpotifySavedAlbum>;

export type SpotifyArtistAlbumsResponse =
  SpotifyPaginatedResponse<SpotifyAlbumSimple>;

export interface SavedTrackObject {
  added_at: string;
  track: SpotifyTrackSimple;
}

export type SavedTracksResponse = SpotifyPaginatedResponse<SavedTrackObject>;

export interface SpotifyShow {
  id: string;
  name: string;
  description: string;
  html_description?: string;
  publisher?: string;
  images: SpotifyImage[];
  total_episodes: number;
  uri: string;
  href: string;
  media_type: string;
  explicit: boolean;
  type: "show";
  languages: string[];
  episodes?: SpotifyShowEpisodes;
}

export interface SpotifyEpisode {
  id: string;
  name: string;
  description: string;
  html_description?: string;
  duration_ms: number;
  release_date: string;
  release_date_precision: "year" | "month" | "day";
  uri: string;
  href: string;
  type: "episode";
  images: SpotifyImage[];
  explicit: boolean;
  is_externally_hosted: boolean;
  is_playable: boolean;
  language?: string;
  languages?: string[];
  resume_point?: {
    fully_played: boolean;
    resume_position_ms: number;
  };
  show?: SpotifyShow;
}

export type SpotifyShowEpisodes = SpotifyPaginatedResponse<SpotifyEpisode>;

export interface SpotifySavedShow {
  added_at: string;
  show: SpotifyShow;
}

export type SpotifySavedShowsResponse =
  SpotifyPaginatedResponse<SpotifySavedShow>;

export interface SpotifySavedEpisode {
  added_at: string;
  episode: SpotifyEpisode;
}

export type SpotifySavedEpisodesResponse =
  SpotifyPaginatedResponse<SpotifySavedEpisode>;

export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
  supports_volume: boolean;
  uri: string;
}

export interface SpotifyDevicesResponse {
  devices: SpotifyDevice[];
}

export interface SpotifyRepeatState {
  state: "off" | "track" | "context";
}

export interface SpotifyCurrentlyPlaying {
  timestamp: number;
  context: SpotifyPlaybackContext | null;
  progress_ms: number | null;
  is_playing: boolean;
  item: SpotifyTrackSimple | SpotifyEpisode | null;
  currently_playing_type: "track" | "episode" | "ad" | "unknown";
  actions: { disallows: Record<string, boolean> };
  device: SpotifyDevice;
  shuffle_state: boolean;
  repeat_state: SpotifyRepeatState["state"];
}

export interface SpotifyPlaybackContext {
  type: "album" | "artist" | "playlist" | "show";
  href: string;
  external_urls: { spotify: string };
  uri: string;
}

export interface SpotifyAlbumSimple {
  album_type: "album" | "single" | "compilation";
  total_tracks: number;
  href: string;
  id: string;
  images: SpotifyImage[];
  name: string;
  release_date: string;
  release_date_precision: "year" | "month" | "day";
  type: "album";
  uri: string;
  artists: SpotifyArtistSimple[];
}

export interface SpotifyTrack {
  album: SpotifyAlbumSimple;
  artists: SpotifyArtistSimple[];
  disc_number: number;
  duration_ms: number;
  explicit: boolean;
  external_urls: { spotify: string };
  href: string;
  id: string;
  is_local: boolean;
  name: string;
  preview_url: string | null;
  track_number: number;
  type: "track";
  uri: string;
}

export interface SpotifyPlaylistSimple {
  collaborative: boolean;
  description: string | null;
  external_urls: { spotify: string };
  href: string;
  id: string;
  images: SpotifyImage[];
  name: string;
  owner: SpotifyPlaylistOwner;
  public: boolean | null;
  snapshot_id: string;
  items: {
    href: string;
    total: number;
  };
  type: "playlist";
  uri: string;
}

export interface SpotifyPlaylistTrack {
  added_at: string;
  added_by: {
    external_urls: { spotify: string };
    href: string;
    id: string;
    type: string;
    uri: string;
  } | null;
  is_local: boolean;
  item: SpotifyTrackSimple | null;
}

export interface SpotifyPlaylistFull extends SpotifyPlaylist {
  id: string;
  name: string;
  images: SpotifyImage[];
  items: {
    href: string;
    items: SpotifyPlaylistTrack[];
    limit: number;
    next: string | null;
    offset: number;
    previous: string | null;
    total: number;
  };
}

export interface SpotifySearchResults {
  tracks?: SpotifyPaginatedResponse<SpotifyTrack>;
  albums?: SpotifyPaginatedResponse<SpotifyAlbumSimple>;
  artists?: SpotifyPaginatedResponse<SpotifyArtist>;
  playlists?: SpotifyPaginatedResponse<SpotifyPlaylistSimple>;
  shows?: SpotifyPaginatedResponse<SpotifyShow>;
}
