import { StyleSheet } from "react-native";
import { n } from "@/shared/utils";
import { StyledText } from "./StyledText";

interface RateLimitListMessageProps {
  message: string;
}

export function RateLimitListMessage({ message }: RateLimitListMessageProps) {
  return <StyledText style={styles.text}>{message}</StyledText>;
}

const styles = StyleSheet.create({
  text: {
    fontSize: n(16),
    lineHeight: n(20),
    textAlign: "center",
    marginBottom: n(2),
  },
});
