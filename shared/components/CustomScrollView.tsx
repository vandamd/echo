import React, { useState, useRef } from "react";
import {
    FlatList,
    View,
    Animated,
    StyleSheet,
    FlatListProps,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from "react-native";
import { n } from "@/shared/utils";
import { useSettings } from "@/features/settings";

interface CustomScrollViewProps<T = unknown> extends FlatListProps<T> {}

const CustomScrollView = <T,>({
    style,
    contentContainerStyle,
    ...rest
}: CustomScrollViewProps<T>) => {
    const { invertColors } = useSettings();
    const [contentHeight, setContentHeight] = useState<number>(0);
    const [scrollViewHeight, setScrollViewHeight] = useState<number>(0);
    const scrollY = useRef(new Animated.Value(0)).current;
    const zeroValue = useRef(new Animated.Value(0)).current;

    const scrollIndicatorHeight =
        scrollViewHeight > 0 &&
            contentHeight > 0 &&
            contentHeight > scrollViewHeight
            ? Math.max(
                (scrollViewHeight * scrollViewHeight) / contentHeight,
                n(20)
            )
            : 0;

    const scrollIndicatorPosition =
        contentHeight > scrollViewHeight && scrollIndicatorHeight > 0
            ? scrollY.interpolate({
                inputRange: [0, contentHeight - scrollViewHeight],
                outputRange: [0, scrollViewHeight - scrollIndicatorHeight],
                extrapolate: "clamp",
            })
            : zeroValue;

    const handleScroll = Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
            useNativeDriver: false,
            listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
                if (rest.onScroll) {
                    rest.onScroll(event);
                }
            },
        }
    );

    return (
        <View style={styles.container}>
            <FlatList
                style={[{ width: "100%" }, style]}
                contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
                showsVerticalScrollIndicator={false}
                overScrollMode="never"
                onContentSizeChange={(width, height) => {
                    setContentHeight(height);
                    if (rest.onContentSizeChange) {
                        rest.onContentSizeChange(width, height);
                    }
                }}
                onLayout={(event) => {
                    const { height } = event.nativeEvent.layout;
                    setScrollViewHeight(height);
                    if (rest.onLayout) {
                        rest.onLayout(event);
                    }
                }}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                {...rest}
            />
            {scrollIndicatorHeight > 0 && (
                <View
                    style={[
                        styles.scrollIndicatorTrack,
                        { transform: [{ translateX: n(1) }] },
                        { backgroundColor: invertColors ? "black" : "white" },
                    ]}
                >
                    <Animated.View
                        style={[
                            styles.scrollIndicatorThumb,
                            {
                                backgroundColor: invertColors
                                    ? "black"
                                    : "white",
                            },
                            {
                                height: scrollIndicatorHeight,
                                transform: [{ translateY: scrollIndicatorPosition }],
                            },
                        ]}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: "row",
        width: "100%",
    },
    scrollIndicatorTrack: {
        width: n(1),
        height: "100%",
        position: "absolute",
        right: n(-2),
    },
    scrollIndicatorThumb: {
        width: n(5),
        position: "absolute",
        right: n(-2),
    },
});

export default CustomScrollView;
