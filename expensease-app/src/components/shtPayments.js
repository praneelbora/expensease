import React from "react";
import BottomSheetList from "./btmShtList";

const PaymentSheet = ({ innerRef, value, options, onSelect, onClose }) => {
  return (
    <BottomSheetList
      innerRef={innerRef}
      value={value}
      options={options}
      onSelect={onSelect}
      onClose={onClose}
      title="Select Payment Account"
      withSearch={false}
      labelKey="label"
      valueKey="_id"
      extraRightKey="type"
    />
  );
};

export default PaymentSheet;
