import { StyleSheet } from "react-native";
import { n } from "@/shared/utils";
import { HapticPressable } from "./HapticPressable";
import { StyledText } from "./StyledText";

interface ButtonProps {
  text: string;
  onPress?: () => void;
  underline?: boolean;
}

export function StyledButton({
  text,
  onPress,
  underline = false,
}: ButtonProps) {
  return (
    <HapticPressable onPress={onPress} style={styles.button}>
      <StyledText style={[styles.buttonText, underline && styles.underline]}>
        {text}
      </StyledText>
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  buttonText: {
    fontSize: n(30),
  },
  underline: {
    textDecorationLine: "underline",
  },
});
