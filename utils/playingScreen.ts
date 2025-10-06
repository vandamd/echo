export type TrackLike = {
    id?: string | null;
    name?: string | null;
    artists?: { id?: string | null; name?: string | null }[] | null;
    album?: {
        id?: string | null;
        name?: string | null;
        images?: { url?: string | null }[] | null;
    } | null;
};

export const buildPlayingScreenParams = (track: TrackLike | null | undefined) => {
    if (!track) {
        return {} as Record<string, string>;
    }

    const primaryArtist = track.artists?.[0];
    const artistNames = (track.artists ?? [])
        .map((artist) => artist?.name)
        .filter(Boolean)
        .join(", ");

    return {
        trackId: track.id ?? "",
        trackName: track.name ?? "",
        trackArtists: artistNames,
        albumImageUrl: track.album?.images?.[0]?.url ?? "",
        albumId: track.album?.id ?? "",
        albumName: track.album?.name ?? "",
        artistId: primaryArtist?.id ?? "",
        artistName: primaryArtist?.name ?? "",
    } as Record<string, string>;
};
