import React from "react";
import { View, StyleSheet } from "react-native";
import { n, formatDuration, getArtistNames } from "@/shared/utils";
import { StyledText } from "./StyledText";
import { HapticPressable } from "./HapticPressable";

interface Artist {
    name: string;
}

interface TrackListItemProps {
    trackNumber: number;
    name: string;
    artists: Artist[];
    durationMs?: number;
    onPress: () => void;
}

export function TrackListItem({
    trackNumber,
    name,
    artists,
    durationMs,
    onPress,
}: TrackListItemProps) {
    const subtitle = durationMs
        ? `${getArtistNames(artists)} · ${formatDuration(durationMs)}`
        : getArtistNames(artists);

    return (
        <HapticPressable style={styles.container} onPress={onPress}>
            <StyledText style={styles.trackNumber}>{trackNumber}.</StyledText>
            <View style={styles.textContainer}>
                <StyledText style={styles.trackName} numberOfLines={1}>
                    {name}
                </StyledText>
                <StyledText style={styles.subtitle}>{subtitle}</StyledText>
            </View>
        </HapticPressable>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        width: "100%",
    },
    trackNumber: {
        fontSize: n(26),
        paddingRight: n(8),
        textAlign: "center",
        width: n(56),
    },
    textContainer: {
        flex: 1,
        alignItems: "flex-start",
        paddingRight: n(10),
    },
    trackName: {
        flex: 1,
        fontSize: n(26),
    },
    subtitle: {
        fontSize: n(16),
        lineHeight: n(18),
        paddingBottom: n(6),
    },
});
