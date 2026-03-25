import { View } from "react-native";
import { useSettings } from "@/features/settings";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { ToggleSwitch } from "@/shared/components/ToggleSwitch";
import { n } from "@/shared/utils";

interface SettingsItem {
  type: "toggle";
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export default function CustomisePlayingScreen() {
  const {
    hideLikeButton,
    setHideLikeButton,
    hideDevicesButton,
    setHideDevicesButton,
    hideAddToPlaylistButton,
    setHideAddToPlaylistButton,
    hideLyricsButton,
    setHideLyricsButton,
    hidePlayingCover,
    setHidePlayingCover,
  } = useSettings();

  const settingsItems: SettingsItem[] = [
    {
      type: "toggle",
      label: "Hide Cover Image",
      value: hidePlayingCover,
      onValueChange: setHidePlayingCover,
    },
    {
      type: "toggle",
      label: "Hide Like Button",
      value: hideLikeButton,
      onValueChange: setHideLikeButton,
    },
    {
      type: "toggle",
      label: "Hide Devices Button",
      value: hideDevicesButton,
      onValueChange: setHideDevicesButton,
    },
    {
      type: "toggle",
      label: "Hide Add to Playlist",
      value: hideAddToPlaylistButton,
      onValueChange: setHideAddToPlaylistButton,
    },
    {
      type: "toggle",
      label: "Hide Lyrics Button",
      value: hideLyricsButton,
      onValueChange: setHideLyricsButton,
    },
  ];

  const renderItem = ({ item }: { item: SettingsItem }) => (
    <ToggleSwitch
      label={item.label}
      onValueChange={item.onValueChange}
      value={item.value}
    />
  );

  return (
    <ContentContainer
      headerTitle="Now Playing"
      style={{ paddingRight: n(20), paddingBottom: n(20), gap: 0 }}
    >
      <CustomScrollView
        data={settingsItems}
        ItemSeparatorComponent={() => <View style={{ height: n(47) }} />}
        keyExtractor={(_, index) => index.toString()}
        overScrollMode="never"
        renderItem={renderItem}
      />
    </ContentContainer>
  );
}
