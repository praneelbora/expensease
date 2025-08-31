// components/CurrenciesSheet.js
import React from "react";
import BottomSheetList from "./btmShtList";

const CurrenciesSheet = ({ innerRef, value, options, onSelect, onClose }) => {
  return (
    <BottomSheetList
      innerRef={innerRef}
      value={value}
      options={options}
      onSelect={onSelect}
      onClose={onClose}
      title="Select Currency"
      withSearch={true}
      searchPlaceholder="Search currency"
      labelKey="label"
      valueKey="value"
      extraRightKey="code"
    />
  );
};

export default CurrenciesSheet;
