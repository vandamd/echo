export const SPOTIFY_SCOPES = [
  "user-library-read",
  "user-library-modify",
  "user-read-recently-played",
  "user-top-read",
  "user-follow-read",
  "user-follow-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "ugc-image-upload",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-read-playback-position",
  "streaming",
];

// Storage Keys
export const AUTH_TOKEN_KEY = "spotifyAuthToken";
export const REFRESH_TOKEN_KEY = "spotifyRefreshToken";
export const USER_INFO_KEY = "spotifyUserInfo";
export const TOKEN_EXPIRY_KEY = "spotifyTokenExpiry";
export const PLAYLISTS_KEY = "spotifyPlaylists";
export const ALBUMS_KEY = "spotifyAlbums";
export const PODCASTS_KEY = "spotifyPodcasts";
export const ARTISTS_KEY = "spotifyArtists";
export const SAVED_TRACKS_KEY = "spotifySavedTracks";
export const SAVED_EPISODES_KEY = "spotifySavedEpisodes";
export const ALBUM_DETAIL_KEY_PREFIX = "spotifyAlbumDetail_";
export const PLAYLIST_DETAIL_KEY_PREFIX = "spotifyPlaylistDetail_";
export const SHOW_DETAIL_KEY_PREFIX = "spotifyShowDetail_";
