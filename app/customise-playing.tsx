import React from "react";
import { View } from "react-native";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { ToggleSwitch } from "@/shared/components/ToggleSwitch";
import { useSettings } from "@/features/settings";
import { n } from "@/shared/utils";

type SettingsItem = {
    type: "toggle";
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
};

export default function CustomisePlayingScreen() {
    const {
        hideLikeButton,
        setHideLikeButton,
        hideDevicesButton,
        setHideDevicesButton,
        hideAddToPlaylistButton,
        setHideAddToPlaylistButton,
        hidePlayingCover,
        setHidePlayingCover,
    } = useSettings();

    const settingsItems: SettingsItem[] = [
        { type: "toggle", label: "Hide Cover Image", value: hidePlayingCover, onValueChange: setHidePlayingCover },
        { type: "toggle", label: "Hide Like Button", value: hideLikeButton, onValueChange: setHideLikeButton },
        { type: "toggle", label: "Hide Devices Button", value: hideDevicesButton, onValueChange: setHideDevicesButton },
        { type: "toggle", label: "Hide Add to Playlist", value: hideAddToPlaylistButton, onValueChange: setHideAddToPlaylistButton },
    ];

    const renderItem = ({ item }: { item: SettingsItem }) => (
        <ToggleSwitch
            value={item.value}
            label={item.label}
            onValueChange={item.onValueChange}
        />
    );

    return (
        <ContentContainer
            headerTitle="Now Playing"
            style={{ paddingRight: n(20), paddingBottom: n(20), gap: 0 }}
        >
            <CustomScrollView
                data={settingsItems}
                renderItem={renderItem}
                keyExtractor={(_, index) => index.toString()}
                ItemSeparatorComponent={() => <View style={{ height: n(47) }} />}
                overScrollMode="never"
            />
        </ContentContainer>
    );
}
