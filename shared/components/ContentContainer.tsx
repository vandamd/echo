import React, { ReactNode } from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { n } from "@/shared/utils";
import { Header } from "@/shared/components/Header";
import { useSettings } from "@/features/settings";
import { MaterialIcons } from "@expo/vector-icons";

interface ContentContainerProps {
    headerTitle?: string;
    children?: ReactNode;
    hideBackButton?: boolean;
    onBackPress?: () => void;
    headerIcon?: keyof typeof MaterialIcons.glyphMap;
    headerIconPress?: () => void;
    headerIconShowLength?: number;
    style?: StyleProp<ViewStyle>;
    onTitlePress?: () => void;
}

export default function ContentContainer({
    headerTitle,
    children,
    hideBackButton = false,
    onBackPress,
    headerIcon,
    headerIconPress,
    headerIconShowLength = 1,
    style,
    onTitlePress,
}: ContentContainerProps) {
    const { invertColors } = useSettings();
    return (
        <View
            style={[
                styles.container,
                { backgroundColor: invertColors ? "white" : "black" },
            ]}
        >
            {headerTitle && (
                <Header
                    headerTitle={headerTitle}
                    hideBackButton={hideBackButton}
                    backEvent={onBackPress}
                    iconName={headerIcon}
                    onIconPress={headerIconPress}
                    iconShowLength={headerIconShowLength}
                    onTitlePress={onTitlePress}
                />
            )}
            <View style={[styles.content, style]}>{children ?? null}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: "100%",
    },
    content: {
        flex: 1,
        justifyContent: "flex-start",
        alignItems: "flex-start",
        paddingHorizontal: n(37),
        paddingTop: n(14),
        gap: n(47),
    },
});
