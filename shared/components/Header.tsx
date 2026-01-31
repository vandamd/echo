import React from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { n } from "@/shared/utils";
import { StyledText } from "./StyledText";
import { HapticPressable } from "./HapticPressable";
import { useSettings } from "@/features/settings";

interface HeaderProps {
    iconName?: keyof typeof MaterialIcons.glyphMap;
    onIconPress?: () => void;
    iconShowLength?: number;
    headerTitle?: string;
    backEvent?: () => void;
    hideBackButton?: boolean;
    onTitlePress?: () => void;
}

export function Header({
    iconName,
    onIconPress,
    iconShowLength = 1,
    headerTitle,
    backEvent,
    hideBackButton = false,
    onTitlePress,
}: HeaderProps) {
    const { invertColors } = useSettings();
    const handleBack = backEvent
        ? backEvent
        : () => {
            if (router.canGoBack()) {
                router.back();
            }
        };

    const iconColor = invertColors ? "black" : "white";

    return (
        <View
            style={[
                styles.header,
                { backgroundColor: invertColors ? "white" : "black" },
            ]}
        >
            {!hideBackButton ? (
                <HapticPressable onPress={handleBack}>
                    <View style={styles.iconContainerLeft}>
                        <MaterialIcons
                            name="arrow-back-ios"
                            size={n(28)}
                            color={iconColor}
                        />
                    </View>
                </HapticPressable>
            ) : (
                <View style={styles.iconContainerLeft} />
            )}

            {onTitlePress ? (
                <HapticPressable onPress={onTitlePress} style={styles.titlePressable}>
                    <StyledText style={styles.titleText} numberOfLines={1}>
                        {headerTitle}
                    </StyledText>
                </HapticPressable>
            ) : (
                <StyledText style={[styles.titleText, styles.titleMaxWidth]} numberOfLines={1}>
                    {headerTitle}
                </StyledText>
            )}
            {iconShowLength > 0 && iconName ? (
                <HapticPressable onPress={onIconPress}>
                    <View style={styles.iconContainerRight}>
                        <MaterialIcons
                            name={iconName}
                            size={n(28)}
                            color={iconColor}
                        />
                    </View>
                </HapticPressable>
            ) : (
                <View style={styles.iconContainerRight} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: n(22),
        paddingVertical: n(5),
        zIndex: 1,
    },
    iconContainerLeft: {
        width: n(32),
        height: n(32),
        alignItems: "center",
        paddingTop: n(6),
        paddingRight: n(4),
    },
    iconContainerRight: {
        width: n(32),
        height: n(32),
        alignItems: "center",
        paddingTop: n(6),
        paddingLeft: n(4),
    },
    titlePressable: {
        maxWidth: "75%",
    },
    titleText: {
        fontSize: n(20),
        fontFamily: "PublicSans-Regular",
        paddingTop: n(2),
    },
    titleMaxWidth: {
        maxWidth: "75%",
    },
});
