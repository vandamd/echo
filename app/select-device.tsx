import React, { useState, useEffect } from "react";
import { View, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { StyledText } from "@/shared/components/StyledText";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useSpotifyLibrary } from "@/features/library/contexts/LibraryContext";
import { SpotifyDevice } from "@/shared/types/spotify";
import { router } from "expo-router";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { logError } from "@/shared/utils/logger";
import { n } from "@/shared/utils";

export default function SelectDeviceScreen() {
    const { ensureValidToken } = useAuth();
    const { makeApiRequest } = useSpotifyLibrary();
    const [devices, setDevices] = useState<SpotifyDevice[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchDevices = async () => {
        setIsLoading(true);
        try {
            const data = await makeApiRequest(
                "https://api.spotify.com/v1/me/player/devices",
                "Fetch available devices"
            );
            if (data && data.devices) {
                setDevices(data.devices);
            }
        } catch (error) {
            logError("Error fetching devices:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDevices();
    }, []);

    const handleSelectDevice = async (deviceId: string | null) => {
        if (!deviceId) return;
        try {
            const validToken = await ensureValidToken();
            if (!validToken) return;
            await fetch("https://api.spotify.com/v1/me/player", {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${validToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ device_ids: [deviceId] }),
            });
        } catch (error) {
            logError("Error transferring playback to device:", error);
        }
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace("/playing");
        }
    };

    if (isLoading) {
        return (
            <ContentContainer headerTitle="Select a device" >
            </ContentContainer>
        );
    }

    return (
        <ContentContainer headerTitle="Select a device" >
                <CustomScrollView
                    data={devices}
                    keyExtractor={(item, index) => item.id ?? index.toString()}
                    renderItem={({ item }) => {
                        return (
                            <HapticPressable
                                style={[styles.itemContainer]}
                                onPress={() => handleSelectDevice(item.id)}
                            >
                                <StyledText
                                    style={[
                                        styles.deviceName,
                                        item.is_active &&
                                            styles.activeDeviceText,
                                    ]}
                                    numberOfLines={1}
                                >
                                    {item.name === "LightPhoneIII"
                                        ? "Light Phone III"
                                        : item.name}
                                </StyledText>
                            </HapticPressable>
                        );
                    }}
                />
        </ContentContainer>
    );
}

const styles = StyleSheet.create({
    centered: {
        justifyContent: "center",
        alignItems: "center",
    },
    itemContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingBottom: n(46),
    },
    deviceName: {
        fontSize: n(30),
    },
    activeDeviceText: {
        textDecorationLine: "underline",
    },
});
