// components/CategoryIcon.js
import React from "react";
import { useColorScheme } from "react-native";
import { iconMap } from "@/icons";
import { categoryMap } from "utils/categories";

export default function CategoryIcon({ category, size = 24 }) {
    const scheme = useColorScheme();
    const categoryConfig = categoryMap[category];
    const Icon = categoryConfig ? iconMap[categoryConfig.icon] : iconMap["notepad"];

    return (
        // <></>
        <Icon
            width={size}
            height={size}
            color={'#EBF1D5'}
        />
    );
}
