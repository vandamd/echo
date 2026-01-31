import React, { useState } from "react";
import { Image, View, StyleSheet, StyleProp, ImageStyle, ViewStyle } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { StyledText } from "./StyledText";

interface FallbackImageProps {
    uri?: string;
    style?: StyleProp<ImageStyle>;
    containerStyle?: StyleProp<ViewStyle>;
    placeholderIcon?: keyof typeof MaterialIcons.glyphMap;
    placeholderText?: string;
    placeholderIconSize?: number;
    placeholderIconColor?: string;
    fadeDuration?: number;
}

export function FallbackImage({
    uri,
    style,
    containerStyle,
    placeholderIcon = "music-note",
    placeholderText,
    placeholderIconSize = 100,
    placeholderIconColor = "white",
    fadeDuration = 0,
}: FallbackImageProps) {
    const [hasError, setHasError] = useState(false);

    const showPlaceholder = !uri || hasError;

    if (showPlaceholder) {
        return (
            <View style={[styles.placeholderContainer, containerStyle, style]}>
                {placeholderText ? (
                    <StyledText style={[styles.placeholderText, { fontSize: placeholderIconSize * 0.6 }]}>
                        {placeholderText}
                    </StyledText>
                ) : (
                    <MaterialIcons
                        name={placeholderIcon}
                        size={placeholderIconSize}
                        color={placeholderIconColor}
                    />
                )}
            </View>
        );
    }

    return (
        <View style={containerStyle}>
            <Image
                source={{ uri }}
                style={style}
                fadeDuration={fadeDuration}
                onError={() => setHasError(true)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    placeholderContainer: {
        backgroundColor: "#282828",
        justifyContent: "center",
        alignItems: "center",
    },
    placeholderText: {
        color: "white",
    },
});
