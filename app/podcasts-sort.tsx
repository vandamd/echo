import { router } from "expo-router";
import { type LibrarySortOption, useSettings } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import { StyledButton } from "@/shared/components/StyledButton";

export default function PodcastsSortScreen() {
  const { podcastSortOrder, setPodcastSortOrder } = useSettings();

  const handleSortSelect = async (sortOrder: LibrarySortOption) => {
    await setPodcastSortOrder(sortOrder);
    router.back();
  };

  return (
    <ContentContainer headerTitle="Sort Podcasts">
      <StyledButton
        onPress={() => {
          handleSortSelect("alphabetical");
        }}
        text="Alphabetical"
        underline={podcastSortOrder === "alphabetical"}
      />
      <StyledButton
        onPress={() => {
          handleSortSelect("creator");
        }}
        text="Creator"
        underline={podcastSortOrder === "creator"}
      />
      <StyledButton
        onPress={() => {
          handleSortSelect("recentlyAdded");
        }}
        text="Recently Added"
        underline={podcastSortOrder === "recentlyAdded"}
      />
    </ContentContainer>
  );
}
