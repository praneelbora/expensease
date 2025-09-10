import React from "react";
import BottomSheetList from "./btmShtList2";

const CategoriesSheet = ({ innerRef, value, options, onSelect, onClose }) => (
    
    <BottomSheetList
        innerRef={innerRef}
        value={value}
        options={options}
        onSelect={onSelect}
        onClose={onClose}
        title="Select Category"
        withSearch={true}
        labelKey="label"
        valueKey="value"
    />
);

export default CategoriesSheet;
