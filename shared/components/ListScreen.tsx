import type { MaterialIcons } from "@expo/vector-icons";
import type { ReactElement } from "react";
import { RefreshControl, View } from "react-native";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { StyledText } from "@/shared/components/StyledText";
import { tabScreenStyles as styles } from "@/shared/styles/detailScreen";
import { n } from "@/shared/utils";

interface ListScreenProps<T> {
  title: string;
  data: T[] | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  renderItem: (props: { item: T; index: number }) => ReactElement | null;
  keyExtractor: (item: T) => string;
  emptyMessage: string;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  isOnline?: boolean;
  refreshEnabled?: boolean;
  headerLeftIcon?: keyof typeof MaterialIcons.glyphMap;
  headerLeftIconPress?: () => void;
  headerIcon?: keyof typeof MaterialIcons.glyphMap;
  headerIconPress?: () => void;
}

export function ListScreen<T>({
  title,
  data,
  isRefreshing,
  onRefresh,
  renderItem,
  keyExtractor,
  emptyMessage,
  onLoadMore,
  isLoadingMore,
  isOnline,
  refreshEnabled = true,
  headerLeftIcon,
  headerLeftIconPress,
  headerIcon = "multitrack-audio",
  headerIconPress,
}: ListScreenProps<T>) {
  const shouldAttachRefreshControl = data !== null;

  if (!data || data.length === 0) {
    return (
      <ContentContainer
        headerIcon={headerIcon}
        headerIconPress={headerIconPress}
        headerIconShowLength={1}
        headerLeftIcon={headerLeftIcon}
        headerLeftIconPress={headerLeftIconPress}
        headerTitle={title}
        hideBackButton={true}
        style={{ paddingHorizontal: n(20) }}
      >
        <CustomScrollView
          data={data ?? []}
          ItemSeparatorComponent={() => <View style={{ height: n(8) }} />}
          keyExtractor={keyExtractor as (item: unknown) => string}
          ListHeaderComponent={
            data && data.length === 0 ? (
              <StyledText style={styles.emptyText}>{emptyMessage}</StyledText>
            ) : null
          }
          overScrollMode="never"
          refreshControl={
            shouldAttachRefreshControl ? (
              <RefreshControl
                colors={["white"]}
                enabled={refreshEnabled && isOnline !== false}
                onRefresh={onRefresh}
                progressBackgroundColor="black"
                refreshing={isRefreshing}
                size={"large" as never}
              />
            ) : undefined
          }
          renderItem={
            renderItem as (props: {
              item: unknown;
              index: number;
            }) => ReactElement | null
          }
          style={styles.list}
        />
      </ContentContainer>
    );
  }

  const renderFooter = () => {
    if (!isLoadingMore) {
      return null;
    }
    return <View style={{ paddingVertical: n(20) }} />;
  };

  return (
    <ContentContainer
      headerIcon={headerIcon}
      headerIconPress={headerIconPress}
      headerIconShowLength={1}
      headerLeftIcon={headerLeftIcon}
      headerLeftIconPress={headerLeftIconPress}
      headerTitle={title}
      hideBackButton={true}
      style={{ paddingHorizontal: n(20) }}
    >
      <CustomScrollView
        contentContainerStyle={styles.listContentContainer}
        data={data}
        ItemSeparatorComponent={() => <View style={{ height: n(8) }} />}
        keyExtractor={keyExtractor as (item: unknown) => string}
        ListFooterComponent={renderFooter}
        onEndReached={onLoadMore}
        onEndReachedThreshold={2}
        overScrollMode="never"
        refreshControl={
          shouldAttachRefreshControl ? (
            <RefreshControl
              colors={["white"]}
              enabled={refreshEnabled && isOnline !== false}
              onRefresh={onRefresh}
              progressBackgroundColor="black"
              refreshing={isRefreshing}
              size={"large" as never}
            />
          ) : undefined
        }
        renderItem={
          renderItem as (props: {
            item: unknown;
            index: number;
          }) => ReactElement | null
        }
        style={styles.list}
      />
    </ContentContainer>
  );
}
