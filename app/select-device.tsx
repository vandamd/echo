import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { useAuth } from "@/features/auth";
import ContentContainer from "@/shared/components/ContentContainer";
import CustomScrollView from "@/shared/components/CustomScrollView";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { StyledText } from "@/shared/components/StyledText";
import type { SpotifyDevice } from "@/shared/types/spotify";
import { n } from "@/shared/utils";
import { apiGet, apiPut } from "@/shared/utils/api-client";
import { logError } from "@/shared/utils/logger";

export default function SelectDeviceScreen() {
  const { ensureValidToken } = useAuth();
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDevices = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<{ devices: SpotifyDevice[] }>(
        "https://api.spotify.com/v1/me/player/devices"
      );
      if (data?.devices) {
        setDevices(data.devices);
      }
    } catch (error) {
      logError("Error fetching devices:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleSelectDevice = async (deviceId: string | null) => {
    if (!deviceId) {
      return;
    }
    try {
      const validToken = await ensureValidToken();
      if (!validToken) {
        return;
      }
      const transferred = await apiPut("https://api.spotify.com/v1/me/player", {
        device_ids: [deviceId],
      });
      if (!transferred) {
        return;
      }
    } catch (error) {
      logError("Error transferring playback to device:", error);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/playing");
    }
  };

  if (isLoading) {
    return <ContentContainer headerTitle="Select a device" />;
  }

  return (
    <ContentContainer headerTitle="Select a device">
      <CustomScrollView
        data={devices}
        keyExtractor={(item, index) => item.id ?? index.toString()}
        renderItem={({ item }) => {
          return (
            <HapticPressable
              onPress={() => handleSelectDevice(item.id)}
              style={[styles.itemContainer]}
            >
              <StyledText
                numberOfLines={1}
                style={[
                  styles.deviceName,
                  item.is_active && styles.activeDeviceText,
                ]}
              >
                {item.name === "LightPhoneIII" ? "Light Phone III" : item.name}
              </StyledText>
            </HapticPressable>
          );
        }}
      />
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
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
