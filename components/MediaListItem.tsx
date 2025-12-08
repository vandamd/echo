import React from "react";
import { View, StyleSheet, Image, StyleProp, ViewStyle, ImageStyle } from "react-native";
import { HapticPressable } from "@/components/HapticPressable";
import { StyledText } from "@/components/StyledText";
import { MaterialIcons } from "@expo/vector-icons";

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
    return (
        <HapticPressable
            style={[styles.itemContainer, disabled && styles.disabledContainer, style]}
            onPress={onPress}
            disabled={disabled}
        >
            {imageUri ? (
                <View style={styles.imageContainer}>
                    <Image
                        source={{ uri: imageUri }}
                        style={[styles.image, imageStyle]}
                    />
                    {isLoading && <View style={styles.loadingOverlay} />}
                </View>
            ) : (
                <View style={styles.placeholderImageContainer}>
                    <MaterialIcons
                        name={placeholderIcon}
                        size={24}
                        color={disabled ? "#666" : "white"}
                    />
                    {isLoading && <View style={styles.loadingOverlay} />}
                </View>
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
        paddingVertical: 0,
        flexDirection: "row",
        alignItems: "center",
    },
    imageContainer: {
        width: 50,
        height: 50,
        marginRight: 15,
        position: "relative",
    },
    image: {
        width: 50,
        height: 50,
    },
    placeholderImageContainer: {
        width: 50,
        height: 50,
        marginRight: 15,
        backgroundColor: "#282828",
        justifyContent: "center",
        alignItems: "center",
    },
    textContainer: {
        flex: 1,
        gap: 0,
        paddingRight: 10,
    },
    primaryText: {
        fontSize: 22,
        lineHeight: 24,
    },
    secondaryText: {
        fontSize: 16,
        lineHeight: 18,
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
