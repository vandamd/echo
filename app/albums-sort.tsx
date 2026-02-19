import { router } from "expo-router";
import { type LibrarySortOption, useSettings } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import { StyledButton } from "@/shared/components/StyledButton";

export default function AlbumsSortScreen() {
  const { albumSortOrder, setAlbumSortOrder } = useSettings();

  const handleSortSelect = async (sortOrder: LibrarySortOption) => {
    await setAlbumSortOrder(sortOrder);
    router.back();
  };

  return (
    <ContentContainer headerTitle="Sort Albums">
      <StyledButton
        onPress={() => {
          handleSortSelect("alphabetical");
        }}
        text="Alphabetical"
        underline={albumSortOrder === "alphabetical"}
      />
      <StyledButton
        onPress={() => {
          handleSortSelect("creator");
        }}
        text="Creator"
        underline={albumSortOrder === "creator"}
      />
      <StyledButton
        onPress={() => {
          handleSortSelect("recentlyAdded");
        }}
        text="Recently Added"
        underline={albumSortOrder === "recentlyAdded"}
      />
    </ContentContainer>
  );
}
