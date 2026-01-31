import React from "react";
import { View } from "react-native";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { useRouter } from "expo-router";
import { StyledButton } from "@/shared/components/StyledButton";
import { ToggleSwitch } from "@/shared/components/ToggleSwitch";
import { useSettings } from "@/features/settings";
import { n } from "@/shared/utils";

type SettingsItem = 
    | { type: "toggle"; label: string; value: boolean; onValueChange: (value: boolean) => void }
    | { type: "button"; text: string; onPress: () => void };

export default function CustomiseTabsScreen() {
    const router = useRouter();
    const { invertColors, setInvertColors, hideAlbumCovers, setHideAlbumCovers, hideDetailCovers, setHideDetailCovers, hideCreatePlaylist, setHideCreatePlaylist, hideYourEpisodes, setHideYourEpisodes } = useSettings();
    const handleCustomiseTabs = () => {
        router.push("/customise-tabs" as any);
    };
    const handleCustomisePlaying = () => {
        router.push("/customise-playing" as any);
    };

    const settingsItems: SettingsItem[] = [
        { type: "button", text: "Navigation Bar", onPress: handleCustomiseTabs },
        { type: "button", text: "Now Playing", onPress: handleCustomisePlaying },
        { type: "toggle", label: "Hide Item Images", value: hideAlbumCovers, onValueChange: setHideAlbumCovers },
        { type: "toggle", label: "Hide Detail Images", value: hideDetailCovers, onValueChange: setHideDetailCovers },
        { type: "toggle", label: "Hide Create Playlist", value: hideCreatePlaylist, onValueChange: setHideCreatePlaylist },
        { type: "toggle", label: "Hide Your Episodes", value: hideYourEpisodes, onValueChange: setHideYourEpisodes },
        { type: "toggle", label: "Invert Colours", value: invertColors, onValueChange: setInvertColors },
    ];

    const renderItem = ({ item }: { item: SettingsItem }) => {
        if (item.type === "toggle") {
            return (
                <ToggleSwitch
                    value={item.value}
                    label={item.label}
                    onValueChange={item.onValueChange}
                />
            );
        }
        return (
            <StyledButton
                text={item.text}
                onPress={item.onPress}
            />
        );
    };

    return (
        <ContentContainer
            headerTitle="Customise"
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
