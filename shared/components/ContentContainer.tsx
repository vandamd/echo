import type { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { useSettings } from "@/features/settings";
import { Header } from "@/shared/components/Header";
import { SwipeBackContainer } from "@/shared/components/SwipeBackContainer";
import { n } from "@/shared/utils";

interface ContentContainerProps {
  headerTitle?: string;
  children?: ReactNode;
  hideBackButton?: boolean;
  onBackPress?: () => void;
  headerIcon?: keyof typeof MaterialIcons.glyphMap;
  headerIconPress?: () => void;
  headerIconShowLength?: number;
  headerIconLoading?: boolean;
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
  headerIconLoading = false,
  style,
  onTitlePress,
}: ContentContainerProps) {
  const { invertColors } = useSettings();
  const canSwipeBack = Boolean(headerTitle) && !hideBackButton;
  const handleBack = useCallback(() => {
    if (onBackPress) {
      onBackPress();
      return;
    }

    if (router.canGoBack()) {
      router.back();
    }
  }, [onBackPress]);

  return (
    <SwipeBackContainer enabled={canSwipeBack} onSwipeBack={handleBack}>
      <View
        style={[
          styles.container,
          { backgroundColor: invertColors ? "white" : "black" },
        ]}
      >
        {headerTitle && (
          <Header
            backEvent={handleBack}
            headerTitle={headerTitle}
            hideBackButton={hideBackButton}
            iconLoading={headerIconLoading}
            iconName={headerIcon}
            iconShowLength={headerIconShowLength}
            onIconPress={headerIconPress}
            onTitlePress={onTitlePress}
          />
        )}
        <View style={[styles.content, style]}>{children ?? null}</View>
      </View>
    </SwipeBackContainer>
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
