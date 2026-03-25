import { useRef, useState } from "react";
import {
  Animated,
  type FlatListProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from "react-native";
import { useSettings } from "@/features/settings";
import { n } from "@/shared/utils";

interface CustomScrollViewProps<T = unknown> extends FlatListProps<T> {}

const CustomScrollView = <T,>({
  style,
  contentContainerStyle,
  onScroll: onScrollProp,
  onContentSizeChange: onContentSizeChangeProp,
  onLayout: onLayoutProp,
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
      ? Math.max((scrollViewHeight * scrollViewHeight) / contentHeight, n(20))
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
      useNativeDriver: true,
      listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        onScrollProp?.(event as never);
      },
    }
  );

  return (
    <View
      onLayout={(event) => {
        setScrollViewHeight(event.nativeEvent.layout.height);
      }}
      style={styles.container}
    >
      <Animated.FlatList
        {...(rest as FlatListProps<unknown>)}
        contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
        onContentSizeChange={(width: number, height: number) => {
          setContentHeight(height);
          onContentSizeChangeProp?.(width, height);
        }}
        onLayout={onLayoutProp}
        onScroll={handleScroll}
        overScrollMode="never"
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={[{ width: "100%" }, style]}
      />
      {scrollIndicatorHeight > 0 && (
        <View
          style={[
            styles.scrollIndicatorTrack,
            {
              transform: [{ translateX: n(1) }],
              backgroundColor: invertColors ? "black" : "white",
            },
          ]}
        >
          <Animated.View
            style={[
              styles.scrollIndicatorThumb,
              {
                backgroundColor: invertColors ? "black" : "white",
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
