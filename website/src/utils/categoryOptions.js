// utils/categoryOptions.js
import { categoryMap } from "./categories";

export const getCategoryOptions = () => {
    return Object.entries(categoryMap).map(([value, cfg]) => ({
        value,
        label: cfg.label,
        icon: cfg.icon,
        keywords: cfg.keywords,
    }));
};

export const getCategoryLabel = (value) => {
    return categoryMap[value]?.label || value;
};