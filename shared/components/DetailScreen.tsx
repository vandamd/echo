import type { MaterialIcons } from "@expo/vector-icons";
import type { ReactElement } from "react";
import { View } from "react-native";
import { useSettings } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { FallbackImage } from "@/shared/components/FallbackImage";
import { ListFooter } from "@/shared/components/ListFooter";
import { StyledText } from "@/shared/components/StyledText";
import { detailScreenStyles } from "@/shared/styles/detailScreen";
import { n } from "@/shared/utils";

interface DetailScreenProps<T> {
  title: string;
  imageUrl?: string;
  placeholderIcon?: keyof typeof MaterialIcons.glyphMap;
  placeholderText?: string;
  data: T[];
  renderItem: (props: { item: T; index: number }) => ReactElement | null;
  keyExtractor: (item: T, index: number) => string;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  onTitlePress?: () => void;
  error?: string | null;
  emptyMessage?: string;
  isInitialLoading?: boolean;
  hideDetailCovers?: boolean;
  headerIcon?: keyof typeof MaterialIcons.glyphMap;
  headerIconPress?: () => void;
  headerIconShowLength?: number;
  itemSeparatorComponent?: React.ComponentType<{ leadingItem: T }> | null;
}

const DefaultItemSeparator = () => <View style={{ height: n(8) }} />;

export function DetailScreen<T>({
  title,
  imageUrl,
  placeholderIcon = "music-note",
  placeholderText,
  data,
  renderItem,
  keyExtractor,
  onLoadMore,
  isLoadingMore = false,
  onTitlePress,
  error,
  emptyMessage,
  isInitialLoading = false,
  hideDetailCovers,
  headerIcon,
  headerIconPress,
  headerIconShowLength,
  itemSeparatorComponent,
}: DetailScreenProps<T>) {
  const { hideDetailCovers: settingsHideCovers } = useSettings();
  const shouldHideCovers = hideDetailCovers ?? settingsHideCovers;
  const resolvedItemSeparatorComponent =
    itemSeparatorComponent === null
      ? undefined
      : (itemSeparatorComponent ?? DefaultItemSeparator);

  return (
    <ContentContainer
      headerIcon={headerIcon}
      headerIconPress={headerIconPress}
      headerIconShowLength={headerIconShowLength}
      headerTitle={title}
      onTitlePress={onTitlePress}
      style={{ paddingHorizontal: n(20) }}
    >
      <View style={{ paddingBottom: n(20) }}>
        <CustomScrollView
          contentContainerStyle={detailScreenStyles.listContentContainer}
          data={data}
          ItemSeparatorComponent={
            resolvedItemSeparatorComponent as React.ComponentType<{
              leadingItem: unknown;
            }>
          }
          keyExtractor={keyExtractor}
          ListEmptyComponent={(() => {
            if (error) {
              return (
                <StyledText style={detailScreenStyles.errorText}>
                  {error}
                </StyledText>
              );
            }
            if (isInitialLoading) {
              return null;
            }
            if (emptyMessage && data.length === 0) {
              return (
                <StyledText style={detailScreenStyles.emptyText}>
                  {emptyMessage}
                </StyledText>
              );
            }
            return null;
          })()}
          ListFooterComponent={<ListFooter isLoading={isLoadingMore} />}
          ListHeaderComponent={
            shouldHideCovers ? null : (
              <View style={detailScreenStyles.imageContainer}>
                <FallbackImage
                  placeholderIcon={placeholderIcon}
                  placeholderText={placeholderText}
                  style={detailScreenStyles.image}
                  uri={imageUrl}
                />
              </View>
            )
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={2}
          overScrollMode="never"
          renderItem={renderItem}
        />
      </View>
    </ContentContainer>
  );
}
