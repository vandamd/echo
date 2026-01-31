import { StyleSheet } from "react-native";
import { n } from "@/shared/utils";

export const detailScreenStyles = StyleSheet.create({
    centeredMessageContainer: {
        flex: 1,
        backgroundColor: "black",
        justifyContent: "center",
        alignItems: "center",
        padding: n(20),
    },
    errorText: {
        fontSize: n(16),
        textAlign: "center",
    },
    emptyText: {
        fontSize: n(16),
        textAlign: "center",
        marginTop: n(20),
    },
    imageContainer: {
        alignItems: "center",
        paddingBottom: n(20),
    },
    image: {
        width: n(200),
        height: n(200),
        marginBottom: n(10),
    },
    placeholderImageContainer: {
        width: n(200),
        height: n(200),
        marginBottom: n(10),
        backgroundColor: "#282828",
        justifyContent: "center",
        alignItems: "center",
    },
    listContentContainer: {
        paddingBottom: 0,
    },
});

export const tabScreenStyles = StyleSheet.create({
    list: {
        flex: 1,
        width: "100%",
    },
    listContentContainer: {
        paddingTop: 0,
        paddingBottom: 0,
    },
    centeredMessageContainer: {
        flex: 1,
        backgroundColor: "black",
        justifyContent: "center",
        alignItems: "center",
    },
    emptyText: {
        marginTop: n(20),
        textAlign: "center",
    },
});
