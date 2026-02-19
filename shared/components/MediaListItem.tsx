import { MaterialIcons } from "@expo/vector-icons";
import { Image, type ImageStyle } from "expo-image";
import React, { useState } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { useSettings } from "@/features/settings";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { StyledText } from "@/shared/components/StyledText";
import { n } from "@/shared/utils";

interface MediaListItemProps {
  primaryText: string;
  secondaryText?: string;
  imageUri?: string;
  placeholderIcon?: keyof typeof MaterialIcons.glyphMap;
  forceShowImage?: boolean;
  disabled?: boolean;
  onPress: () => void;
  imageStyle?: StyleProp<ImageStyle>;
  style?: StyleProp<ViewStyle>;
}

export const MediaListItem = React.memo(function MediaListItem({
  primaryText,
  secondaryText,
  imageUri,
  placeholderIcon = "music-note",
  forceShowImage = false,
  disabled = false,
  onPress,
  imageStyle,
  style,
}: MediaListItemProps) {
  const { hideAlbumCovers } = useSettings();
  const [imageError, setImageError] = useState(false);

  const showPlaceholder = !imageUri || imageError;
  const shouldShowImage = forceShowImage || !hideAlbumCovers;

  return (
    <HapticPressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.itemContainer,
        disabled && styles.disabledContainer,
        style,
      ]}
    >
      {shouldShowImage &&
        (showPlaceholder ? (
          <View style={[styles.placeholderImageContainer, imageStyle]}>
            <MaterialIcons
              color={disabled ? "#666" : "white"}
              name={placeholderIcon}
              size={n(24)}
            />
          </View>
        ) : (
          <View style={styles.imageContainer}>
            <Image
              cachePolicy="disk"
              onError={() => setImageError(true)}
              source={{ uri: imageUri }}
              style={[styles.image, imageStyle]}
            />
          </View>
        ))}
      <View style={styles.textContainer}>
        <StyledText numberOfLines={1} style={styles.primaryText}>
          {primaryText}
        </StyledText>
        {secondaryText && (
          <StyledText numberOfLines={1} style={styles.secondaryText}>
            {secondaryText}
          </StyledText>
        )}
      </View>
    </HapticPressable>
  );
});

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
  disabledContainer: {
    opacity: 0.3,
  },
});
