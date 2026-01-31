import React from "react";
import { StyleSheet } from "react-native";
import { n } from "@/shared/utils";
import { StyledText } from "./StyledText";
import { HapticPressable } from "./HapticPressable";

interface ButtonProps {
    text: string;
    onPress?: () => void;
}

export function StyledButton({ text, onPress }: ButtonProps) {
    return (
        <HapticPressable style={styles.button} onPress={onPress}>
            <StyledText style={styles.buttonText}>{text}</StyledText>
        </HapticPressable>
    );
}

const styles = StyleSheet.create({
    button: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    buttonText: {
        fontSize: n(30),
    },
});
