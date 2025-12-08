import React, { useState, useCallback } from "react";
import { View, StyleSheet, TextStyle, StyleProp, LayoutChangeEvent } from "react-native";
import AutoScroll from "@homielab/react-native-auto-scroll";
import { StyledText } from "./StyledText";

interface MarqueeTextProps {
    children: string;
    style?: StyleProp<TextStyle>;
    msPerChar?: number;
    delay?: number;
    isActive?: boolean;
}

export function MarqueeText({
    children,
    style,
    msPerChar = 250,
    delay = 1250,
    isActive = true,
}: MarqueeTextProps) {
    const [containerWidth, setContainerWidth] = useState(0);
    const [textWidth, setTextWidth] = useState(0);

    const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
        setContainerWidth(event.nativeEvent.layout.width);
    }, []);

    const handleTextLayout = useCallback((event: LayoutChangeEvent) => {
        setTextWidth(event.nativeEvent.layout.width);
    }, []);

    const shouldScroll = isActive && textWidth > containerWidth + 5 && containerWidth > 0;

    const duration = children.length * msPerChar;

    return (
        <View style={styles.container} onLayout={handleContainerLayout}>
            <View style={styles.measuringContainer} pointerEvents="none">
                <StyledText style={style} onLayout={handleTextLayout}>
                    {children}
                </StyledText>
            </View>

            {shouldScroll ? (
                <AutoScroll
                    style={styles.scrollContainer}
                    duration={duration}
                    delay={delay}
                    endPaddingWidth={25}
                >
                    <StyledText style={style}>{children}</StyledText>
                </AutoScroll>
            ) : (
                <StyledText style={style} numberOfLines={1}>
                    {children}
                </StyledText>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        overflow: "hidden",
    },
    measuringContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        opacity: 0,
    },
    scrollContainer: {
        width: "100%",
    },
});
