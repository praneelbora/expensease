// utils/currencies.js
import currencies from "../../assets/currencies.json"; // adjust path

// make a quick lookup by code
const currencyMap = {};
currencies.forEach(c => {
  currencyMap[c.code] = c;
});

export const getCurrency = (code = "INR") => currencyMap[code];

export const getSymbol = (code = "INR") =>
  currencyMap[code]?.symbol || currencyMap[code]?.symbolNative || "";

export const getDigits = (code = "INR") =>
  currencyMap[code]?.decimalDigits ?? 2;

export const formatMoney = (code, v = 0) => {
  const c = currencyMap[code];
  const symbol = c?.symbolNative || c?.symbol || "";
  const digits = c?.decimalDigits ?? 2;
  return `${symbol} ${Number(v || 0).toFixed(digits)}`;
};

export const allCurrencies = currencies;
