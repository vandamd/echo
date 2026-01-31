import React, { useState } from "react";
import { View, StyleSheet, TextInput } from "react-native";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useCredentials } from "@/features/credentials";
import { useSettings } from "@/features/settings";
import { StyledText } from "@/shared/components/StyledText";
import { HapticPressable } from "@/shared/components/HapticPressable";
import ContentContainer from "@/shared/components/ContentContainer";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { n } from "@/shared/utils";

type SetupStep = "clientId" | "clientSecret";

export default function LoginScreen() {
    const { login, isLoading } = useAuth();
    const { credentials, isConfigured, saveCredentials, clearCredentials } = useCredentials();
    const { invertColors } = useSettings();

    const [step, setStep] = useState<SetupStep>("clientId");
    const [clientId, setClientId] = useState(credentials?.clientId ?? "");
    const [clientSecret, setClientSecret] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const textColor = invertColors ? "black" : "white";
    const borderColor = invertColors ? "black" : "white";

    const handleClientIdNext = () => {
        if (clientId.trim()) {
            setStep("clientSecret");
        }
    };

    const handleSaveCredentials = async () => {
        if (!clientSecret.trim()) return;

        setIsSaving(true);
        try {
            await saveCredentials({
                clientId: clientId.trim(),
                clientSecret: clientSecret.trim(),
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleBackToSetup = async () => {
        await clearCredentials();
        setStep("clientSecret");
    };

    if (!isConfigured) {
        if (step === "clientId") {
            return (
                <ContentContainer
                    headerTitle="Client ID"
                    hideBackButton={true}
                    headerIcon="arrow-forward"
                    headerIconShowLength={clientId.trim().length}
                    headerIconPress={handleClientIdNext}
                >
                    <View style={[styles.inputContainer, { borderBottomColor: borderColor }]}>
                        <TextInput
                            style={[styles.input, { color: textColor }]}
                            value={clientId}
                            onChangeText={setClientId}
                            placeholder="Enter your Client ID"
                            placeholderTextColor="#888"
                            autoCapitalize="none"
                            autoCorrect={false}
                            cursorColor={textColor}
                            selectionColor={textColor}
                            onSubmitEditing={handleClientIdNext}
                            autoFocus
                        />
                        {clientId.length > 0 && (
                            <HapticPressable
                                style={styles.clearButton}
                                onPress={() => {
                                    setClientId("");
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                }}
                            >
                                <MaterialIcons name="clear" size={n(24)} color={textColor} />
                            </HapticPressable>
                        )}
                    </View>
                </ContentContainer>
            );
        }

        return (
            <ContentContainer 
                headerTitle="Client Secret" 
                hideBackButton={false}
                onBackPress={() => setStep("clientId")}
                headerIcon="arrow-forward"
                headerIconShowLength={clientSecret.trim().length}
                headerIconPress={handleSaveCredentials}
            >
                <View style={[styles.inputContainer, { borderBottomColor: borderColor }]}>
                    <TextInput
                        style={[styles.input, { color: textColor }]}
                        value={clientSecret}
                        onChangeText={setClientSecret}
                        placeholder="Enter your Client Secret"
                        placeholderTextColor="#888"
                        autoCapitalize="none"
                        autoCorrect={false}
                        cursorColor={textColor}
                        selectionColor={textColor}
                        onSubmitEditing={handleSaveCredentials}
                        autoFocus
                    />
                    {clientSecret.length > 0 && (
                        <HapticPressable
                            style={styles.clearButton}
                            onPress={() => {
                                setClientSecret("");
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            }}
                        >
                            <MaterialIcons name="clear" size={n(24)} color={textColor} />
                        </HapticPressable>
                    )}
                </View>
            </ContentContainer>
        );
    }

    return (
        <ContentContainer
            headerTitle="Login"
            hideBackButton={false}
            onBackPress={handleBackToSetup}
        >
            <StyledText style={styles.informationText}>
                Welcome to Echo!
                {"\n"}
                {"\n"}
                If there are any issues, please don't hesitate to let me know via GitHub.
                {"\n"}
                {"\n"}
                If you'd like to support development, please consider sponsoring me on
                GitHub. Any support helps keep the project going and is greatly appreciated! :)
                {"\n"}
                {"\n"}
                With love,
                {"\n"}
                Vandam
            </StyledText>

            <View style={styles.buttonContainer}>
                <HapticPressable
                    onPress={login}
                    style={styles.loginButton}
                    disabled={isLoading}
                >
                    <StyledText style={styles.loginButtonText}>Login</StyledText>
                </HapticPressable>
            </View>
        </ContentContainer>
    );
}

const styles = StyleSheet.create({
    informationText: {
        fontSize: n(18),
        marginHorizontal: 0,
        marginTop: n(10),
    },
    inputContainer: {
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        borderBottomWidth: n(1),
    },
    input: {
        flex: 1,
        fontSize: n(24),
        fontFamily: "PublicSans-Regular",
        paddingVertical: n(2),
        textAlign: "left",
        paddingBottom: n(6),
    },
    clearButton: {
        padding: n(5),
    },
    buttonContainer: {
        width: "100%",
        flex: 1,
        justifyContent: "flex-end",
        alignItems: "center",
    },
    loginButton: {
        paddingVertical: n(15),
        paddingHorizontal: n(30),
        alignItems: "center",
        justifyContent: "flex-end",
        minWidth: n(200),
    },
    loginButtonText: {
        fontSize: n(40),
        textTransform: "uppercase",
    },
});
