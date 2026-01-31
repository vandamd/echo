import React from "react";
import { ActivityIndicator } from "react-native";
import { n } from "@/shared/utils";

interface ListFooterProps {
    isLoading: boolean;
}

export function ListFooter({ isLoading }: ListFooterProps) {
    if (!isLoading) return null;
    return (
        <ActivityIndicator
            style={{ marginVertical: n(20) }}
            size="large"
            color="white"
        />
    );
}
