// components/MainBottomSheet.js
import React from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MainBottomSheet = ({ children, innerRef, onDismiss }) => {
    const insets = useSafeAreaInsets();

    return (
        <BottomSheetModal
            ref={innerRef}
            snapPoints={["100%"]}
            enablePanDownToClose={false}
            enableDynamicSizing={false}
            enableOverDrag={false}
            overDragResistanceFactor={0}
            onDismiss={onDismiss}
            handleComponent={null} // ❌ hide pull handle
            backgroundComponent={() => <View style={{ backgroundColor: "#212121" }} />}
            style={styles.sheet}
        >
            {children}
        </BottomSheetModal>
    );
};

export default MainBottomSheet;

const styles = StyleSheet.create({
    sheet: {
        backgroundColor: "#212121",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -9 },
        shadowOpacity: 0.75,
        shadowRadius: 12.35,
        elevation: 19,
    },
});
