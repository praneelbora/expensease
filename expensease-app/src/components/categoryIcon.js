// components/CategoryIcon.js
import React from "react";
import { iconMap } from "@/icons";
import { categoryMap } from "utils/categories";
import { useTheme } from "context/ThemeProvider";

export default function CategoryIcon({ category, size = 24, color }) {
    const { theme } = useTheme();
    const categoryConfig = categoryMap[category];
    const Icon = categoryConfig ? iconMap[categoryConfig.icon] : iconMap["notepad"];

    return (
        <Icon
            width={size}
            height={size}
            color={color || theme.colors.text} // fallback to theme text color
        />
    );
}
