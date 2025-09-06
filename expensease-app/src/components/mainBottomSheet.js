// components/MainBottomSheet.js
import React from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "context/ThemeProvider";

/**
 * Theme-aware wrapper for BottomSheetModal used across the app.
 * - reads colors from ThemeProvider (falls back to sensible defaults)
 * - exposes same API as before (innerRef, onDismiss, children)
 * - keeps handle hidden (handleComponent={null}) as before
 */
const MainBottomSheet = ({ children, innerRef, onDismiss, snapPoints = ["100%"], backgroundStyle, addView = false }) => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme?.() || {};
    const colors = theme?.colors || {};

    const backgroundColor = colors.card ?? "#212121";

    return (
        <BottomSheetModal
            ref={innerRef}
            snapPoints={snapPoints}
            enablePanDownToClose={false}
            enableDynamicSizing={false}
            enableOverDrag={false}
            overDragResistanceFactor={0}
            onDismiss={onDismiss}
            handleComponent={null} // hide pull handle
            backgroundComponent={() => <View style={[styles.bg, { backgroundColor }]} />}
            style={[styles.sheet, { backgroundColor }, backgroundStyle]}
        >
            {children}
        </BottomSheetModal>
    );
};

export default MainBottomSheet;

const styles = StyleSheet.create({
    sheet: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -9 },
        shadowOpacity: 0.75,
        shadowRadius: 12.35,
        elevation: 19,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: "hidden",
    },
    bg: {
        flex: 1,
    },
});
