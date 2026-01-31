import React, { useState } from "react";
import { View, StyleSheet, TextInput } from "react-native";
import { router } from "expo-router";
import ContentContainer from "@/shared/components/ContentContainer";
import { HapticPressable } from "@/shared/components/HapticPressable";
import { useSettings } from "@/features/settings";
import * as Haptics from "expo-haptics";
import { MaterialIcons } from "@expo/vector-icons";
import { usePreventDoubleTap } from "@/shared/hooks/usePreventDoubleTap";
import { n } from "@/shared/utils";

export default function SearchScreen() {
	const [searchQuery, setSearchQuery] = useState("");
    const { invertColors } = useSettings();

    const handleSubmit = usePreventDoubleTap(() => {
        if (searchQuery.length > 0) {
            router.push({
                pathname: "/search-results",
                params: { query: searchQuery },
            });
        }
    });

	return (
        <ContentContainer 
            headerTitle="Search"
            hideBackButton={true}
            headerIcon="check"
            headerIconShowLength={searchQuery.length}
            headerIconPress={handleSubmit}
        >
			<View
				style={[
					styles.inputContainer,
					{ borderBottomColor: invertColors ? "black" : "white" },
				]}
			>
				<TextInput
					style={[
						styles.input,
						{ color: invertColors ? "black" : "white" },
					]}
					placeholderTextColor="#888"
					value={searchQuery}
					placeholder="Search for something!"
					onChangeText={setSearchQuery}
					cursorColor={invertColors ? "black" : "white"}
					selectionColor={invertColors ? "black" : "white"}
					onSubmitEditing={handleSubmit}
				/>
				{searchQuery.length > 0 && (
					<HapticPressable
						style={styles.clearButton}
						onPress={() => {
							setSearchQuery("");
							Haptics.impactAsync(
								Haptics.ImpactFeedbackStyle.Medium
							);
						}}
					>
						<MaterialIcons
							name="clear"
							size={n(24)}
							color={invertColors ? "black" : "white"}
						/>
					</HapticPressable>
				)}
			</View>
		</ContentContainer>
	);
}

const styles = StyleSheet.create({
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
});
