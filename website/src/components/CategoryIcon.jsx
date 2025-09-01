// components/CategoryIcon.jsx
import React from "react";
import { getIconForCategory } from "../assets/icons";

export default function CategoryIcon({ category, size = 20, className = "" }) {
    const Icon = getIconForCategory(category);
    return <Icon width={size} height={size} className={className || "text-[#EBF1D5]"} />;
}
