import React from "react";
import { Text as DefaultText, TextProps, StyleSheet } from "react-native";
import { useSettings } from "@/features/settings";

interface StyledTextProps extends TextProps {
    children: React.ReactNode;
}

export function StyledText({ style, ...rest }: StyledTextProps) {
    const { invertColors } = useSettings();
    return (
        <DefaultText
            style={[
                styles.text,
                { color: invertColors ? "black" : "white" },
                style,
            ]}
            {...rest}
        />
    );
}

const styles = StyleSheet.create({
    text: {
        fontFamily: "PublicSans-Regular",
    },
});

