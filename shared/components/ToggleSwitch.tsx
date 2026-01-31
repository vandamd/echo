import React from "react";
import { View, StyleSheet } from "react-native";
import { n } from "@/shared/utils";
import { StyledText } from "./StyledText";
import { HapticPressable } from "./HapticPressable";
import { useSettings } from "@/features/settings";
import { MaterialIcons } from "@expo/vector-icons";

interface ToggleSwitchGraphicProps {
	value: boolean;
}

const CIRCLE_DIAMETER = n(9.8);
const CIRCLE_BORDER = n(2.5);
const LINE_WIDTH = n(14.5);
const LINE_HEIGHT = n(2.22);

const ToggleSwitchGraphic = ({ value }: ToggleSwitchGraphicProps) => {
	const { invertColors } = useSettings();
	const switchColor = invertColors ? "black" : "white";

	return (
		<View style={graphicStyles.container}>
			{!value ? (
				<>
					<View style={[graphicStyles.hollowCircle, { borderColor: switchColor }]} />
					<View style={[graphicStyles.line, { backgroundColor: switchColor }]} />
				</>
			) : (
				<>
					<View style={[graphicStyles.line, { backgroundColor: switchColor }]} />
					<View style={[graphicStyles.circle, { backgroundColor: switchColor }]} />
				</>
			)}
		</View>
	);
};

const graphicStyles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
	},
	circle: {
		width: CIRCLE_DIAMETER,
		height: CIRCLE_DIAMETER,
		borderRadius: CIRCLE_DIAMETER / 2,
	},
	hollowCircle: {
		width: CIRCLE_DIAMETER,
		height: CIRCLE_DIAMETER,
		borderRadius: CIRCLE_DIAMETER / 2,
		borderWidth: CIRCLE_BORDER,
	},
	line: {
		width: LINE_WIDTH,
		height: LINE_HEIGHT,
	},
});

interface ToggleSwitchProps {
	label: string;
	value: boolean;
	onValueChange: (value: boolean) => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
	isFirst?: boolean;
	isLast?: boolean;
}

export function ToggleSwitch({
	label,
	value,
	onValueChange,
	onMoveUp,
	onMoveDown,
	isFirst = false,
	isLast = false,
}: ToggleSwitchProps) {
	const { invertColors } = useSettings();
	const iconColor = invertColors ? "black" : "white";
	const disabledColor = invertColors ? "#C1C1C1" : "#6E6E6E";
	const showReorderButtons = onMoveUp !== undefined || onMoveDown !== undefined;

	return (
		<View style={styles.container}>
			<HapticPressable
				onPress={() => {
					onValueChange(!value);
				}}
				style={styles.toggleArea}
			>
				<View style={styles.switchTouchable}>
					<ToggleSwitchGraphic value={value} />
				</View>
				<View style={styles.textTouchable}>
					<StyledText style={[styles.label]}>{label}</StyledText>
				</View>
			</HapticPressable>
			{showReorderButtons && (
				<View style={styles.arrowContainer}>
					<HapticPressable
						onPress={onMoveDown}
						disabled={isLast}
						style={styles.arrowButton}
					>
						<MaterialIcons
							name="keyboard-arrow-down"
							size={n(32)}
							color={isLast ? disabledColor : iconColor}
						/>
					</HapticPressable>
					<HapticPressable
						onPress={onMoveUp}
						disabled={isFirst}
						style={styles.arrowButton}
					>
						<MaterialIcons
							name="keyboard-arrow-up"
							size={n(32)}
							color={isFirst ? disabledColor : iconColor}
						/>
					</HapticPressable>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		paddingTop: n(9),
		width: "100%",
	},
	toggleArea: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	switchTouchable: {
		marginTop: n(12),
		marginRight: n(20),
		marginLeft: n(8.5),
	},
	textTouchable: {
		flex: 1,
	},
	label: {
		fontSize: n(30),
	},
	arrowContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: n(4),
	},
	arrowButton: {
		padding: n(4),
	},
});
