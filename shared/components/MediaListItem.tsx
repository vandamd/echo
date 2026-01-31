import React, { useState } from "react";
import { View, StyleSheet, Image, StyleProp, ViewStyle, ImageStyle } from "react-native";
import { n } from "@/shared/utils";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { StyledText } from "@/shared/components/StyledText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSettings } from "@/features/settings";

interface MediaListItemProps {
    primaryText: string;
    secondaryText?: string;
    imageUri?: string;
    placeholderIcon?: keyof typeof MaterialIcons.glyphMap;
    isLoading?: boolean;
    disabled?: boolean;
    onPress: () => void;
    imageStyle?: StyleProp<ImageStyle>;
    style?: StyleProp<ViewStyle>;
}

export function MediaListItem({
    primaryText,
    secondaryText,
    imageUri,
    placeholderIcon = "music-note",
    isLoading = false,
    disabled = false,
    onPress,
    imageStyle,
    style,
}: MediaListItemProps) {
    const { hideAlbumCovers } = useSettings();
    const [imageError, setImageError] = useState(false);

    const showPlaceholder = !imageUri || imageError;

    return (
        <HapticPressable
            style={[styles.itemContainer, disabled && styles.disabledContainer, style]}
            onPress={onPress}
            disabled={disabled}
        >
            {!hideAlbumCovers && (
                showPlaceholder ? (
                    <View style={[styles.placeholderImageContainer, imageStyle]}>
                        <MaterialIcons
                            name={placeholderIcon}
                            size={n(24)}
                            color={disabled ? "#666" : "white"}
                        />
                        {isLoading && <View style={styles.loadingOverlay} />}
                    </View>
                ) : (
                    <View style={styles.imageContainer}>
                        <Image
                            source={{ uri: imageUri }}
                            style={[styles.image, imageStyle]}
                            onError={() => setImageError(true)}
                        />
                        {isLoading && <View style={styles.loadingOverlay} />}
                    </View>
                )
            )}
            <View style={styles.textContainer}>
                <StyledText style={styles.primaryText} numberOfLines={1}>
                    {primaryText}
                </StyledText>
                {secondaryText && (
                    <StyledText style={styles.secondaryText} numberOfLines={1}>
                        {secondaryText}
                    </StyledText>
                )}
            </View>
        </HapticPressable>
    );
}

const styles = StyleSheet.create({
    itemContainer: {
        minHeight: n(50),
        paddingVertical: 0,
        flexDirection: "row",
        alignItems: "center",
    },
    imageContainer: {
        width: n(50),
        height: n(50),
        marginRight: n(15),
        position: "relative",
    },
    image: {
        width: n(50),
        height: n(50),
    },
    placeholderImageContainer: {
        width: n(50),
        height: n(50),
        marginRight: n(15),
        backgroundColor: "#282828",
        justifyContent: "center",
        alignItems: "center",
    },
    textContainer: {
        flex: 1,
        gap: 0,
        paddingRight: n(10),
    },
    primaryText: {
        fontSize: n(22),
        lineHeight: n(24),
    },
    secondaryText: {
        fontSize: n(16),
        lineHeight: n(18),
    },
    loadingOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0, 0, 0, 0)",
        justifyContent: "center",
        alignItems: "center",
    },
    disabledContainer: {
        opacity: 0.3,
    },
});
