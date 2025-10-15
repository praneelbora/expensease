// components/FAB.js
import React from "react";
import { TouchableOpacity, View, Text, StyleSheet, Platform } from "react-native";
import { useTheme } from "context/ThemeProvider";
import Plus from "@/accIcons/plus.svg";

const isIos = Platform.OS === 'ios';
// Platform.Version is number on Android, string or number on iOS — normalize
const platformVersionNumber = (() => {
    const v = Platform.Version;
    if (typeof v === 'string') return parseFloat(v) || 0;
    if (typeof v === 'number') return v;
    return 0;
})();
const isIosLessThan26 = isIos && platformVersionNumber < 26;


export default function FAB({ onPress = () => { }, size = 54, right = 18, bottom = Platform.OS === "ios" ? 68 : 18, accessibilityLabel = "Add" }) {
    const { theme } = useTheme();
    const styles = makeStyles(theme, size, right, bottom);
    return (
        <TouchableOpacity style={[styles.fab, { backgroundColor: theme.mode == 'light' ? '#fff' : '#3a3a3a' }]} onPress={onPress}>
            <Plus width={22} height={22} color={theme.mode == 'light' ? '#000' : '#fff'} />
            <Text style={{ color: theme.mode == 'light' ? '#000' : '#fff', fontWeight: "700" }}>Add Expense</Text>
        </TouchableOpacity>
    );

    // return (
    //     <TouchableOpacity style={[styles.fab, { backgroundColor: (isIosLessThan26 || !isIos)?theme?.colors?.primary ?? "#00C49F":theme.mode=='light'?'#fff':'#212121' }]} onPress={onPress}>
    //         <Plus width={22} height={22} color={{color: (isIosLessThan26 || !isIos)?theme?.colors?.inverseText ?? "#121212":theme.mode=='light'?'#000':'#fff' , fontWeight: "700"}} />
    //         <Text style={{color: (isIosLessThan26 || !isIos)?theme?.colors?.inverseText ?? "#121212":theme.mode=='light'?'#000':'#fff' , fontWeight: "700"}}>Add Expense</Text>
    //     </TouchableOpacity>
    // );
}

const makeStyles = (theme, size, right, bottom) =>
    StyleSheet.create({
        fab: {
            position: "absolute",
            right: 16,
            bottom: Platform.OS == 'ios' && !isIosLessThan26 ? 92 : 14,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            shadowColor: "#000",
            shadowOpacity: 0.36,
            shadowRadius: 8,
            shadowOffset: { width: 4, height: 4 },
            elevation: 10,
            zIndex: 999

        },
        fabText: {},

    });
