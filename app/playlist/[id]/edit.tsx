import { useLocalSearchParams, useRouter } from "expo-router";
import ContentContainer from "@/shared/components/ContentContainer";
import { StyledButton } from "@/shared/components/StyledButton";

export default function PlaylistEditScreen() {
  const router = useRouter();
  const { id, currentName } = useLocalSearchParams<{
    id: string;
    currentName?: string;
  }>();

  const handleRenamePress = () => {
    if (!id) {
      return;
    }

    router.push({
      pathname: "/create-playlist",
      params: {
        mode: "rename",
        playlistId: id,
        currentName: currentName ?? "",
      },
    });
  };

  const handleChangeCoverPress = () => {
    if (!id) {
      return;
    }

    router.push({
      pathname: "/playlist/[id]/cover",
      params: { id },
    });
  };

  return (
    <ContentContainer headerTitle="Edit Playlist">
      <StyledButton onPress={handleRenamePress} text="Rename" />
      <StyledButton onPress={handleChangeCoverPress} text="Change Cover" />
    </ContentContainer>
  );
}
