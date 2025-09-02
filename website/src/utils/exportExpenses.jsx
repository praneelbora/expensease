// src/utils/exportExpenses.js
import * as XLSX from "xlsx";
import { getCategoryLabel } from "./categoryOptions";
import { getSymbol } from "./currencies";

/**
 * Export expenses to an Excel file with raw + summary sheets (multi-currency, currency-aware totals)
 * @param {Array} expenses - Array of expense objects
 * @param {string} userId - Current user ID (to identify "You Owe")
 */
export function exportExpensesToExcel(expenses, userId) {
  if (!expenses?.length) {
    alert("No expenses to export");
    return;
  }

  // -----------------------------
  // 1. Raw Expenses Sheet
  // -----------------------------
  const rows = expenses.flatMap((exp) => {
    const date = new Date(exp.date).toLocaleDateString();
    const ccy = exp.currency || "INR";
    const base = {
      Date: date,
      Description: exp.description || "",
      Category: getCategoryLabel(exp.category) || "Uncategorized",
      TotalAmount: `${getSymbol(ccy)} ${Number(exp.amount || 0).toFixed(2)}`,
      Currency: ccy,
      Type: exp.typeOf,
      PaidBy: exp.paidBy?.name || "You",
    };

    if (exp.splits?.length) {
      return exp.splits.map((s) => ({
        ...base,
        SplitWith: s.friendId?.name || "You",
        YourShare:
          s.friendId?._id === userId
            ? `${getSymbol(ccy)} ${Number(s.oweAmount || 0).toFixed(2)}`
            : `${getSymbol(ccy)} 0.00`,
      }));
    }

    return {
      ...base,
      SplitWith: "-",
      YourShare: exp.splits?.find((s) => s.friendId?._id === userId)?.oweAmount
        ? `${getSymbol(ccy)} ${Number(
            exp.splits.find((s) => s.friendId?._id === userId)?.oweAmount
          ).toFixed(2)}`
        : exp.paidBy?._id === userId
        ? `${getSymbol(ccy)} 0.00`
        : `${getSymbol(ccy)} ${Number(exp.amount || 0).toFixed(2)}`,
    };
  });

  const wsRaw = XLSX.utils.json_to_sheet(rows);

  // -----------------------------
  // Helpers
  // -----------------------------
  function getMonthKey(d) {
    return d.toLocaleString("default", { month: "short", year: "numeric" });
  }

  function accumulate(map, bucket, month, currency, value) {
    if (!map[bucket]) map[bucket] = {};
    const key = `${month} (${currency})`;
    map[bucket][key] = (map[bucket][key] || 0) + value;
  }

  function buildSummary(map) {
    // Collect all month+currency keys
    const allKeys = new Set();
    Object.values(map).forEach((row) => {
      Object.keys(row).forEach((k) => allKeys.add(k));
    });

    // Order keys: sort by actual date, then currency
    const orderedKeys = Array.from(allKeys).sort((a, b) => {
      const [ma, ca] = a.split(" (");
      const [mb, cb] = b.split(" (");
      const da = new Date(ma);
      const db = new Date(mb);
      if (da.getTime() !== db.getTime()) return da - db;
      return ca.localeCompare(cb);
    });

    // Build rows with totals column (currency-aware)
    const rows = Object.entries(map).map(([bucket, values]) => {
      const row = { Bucket: bucket };
      const totalsByCurrency = {};

      orderedKeys.forEach((k) => {
        const [month, ccyWithParen] = k.split(" (");
        const ccy = ccyWithParen.replace(")", "");
        const val = values[k] || 0;
        row[k] = `${getSymbol(ccy)} ${val.toFixed(2)}`;
        totalsByCurrency[ccy] = (totalsByCurrency[ccy] || 0) + val;
      });

      // Create "Total (Currency)" columns
      Object.entries(totalsByCurrency).forEach(([ccy, sum]) => {
        row[`Total (${ccy})`] = `${getSymbol(ccy)} ${sum.toFixed(2)}`;
      });

      return row;
    });

    // Move "Total" bucket to the end
    const totalRowIndex = rows.findIndex((r) => r.Bucket === "Total");
    if (totalRowIndex > -1) {
      const [totalRow] = rows.splice(totalRowIndex, 1);
      rows.push(totalRow);
    }

    return rows;
  }

  // -----------------------------
  // 2. Category × Month × Currency
  // -----------------------------
  const categoryMonthMap = {};
  expenses.forEach((exp) => {
    if (exp.typeOf !== "expense") return;

    const d = new Date(exp.date);
    const monthKey = getMonthKey(d);
    const category = getCategoryLabel(exp.category) || "Others";
    const userSplit = exp.splits?.find((s) => s.friendId?._id === userId);

    let share = exp.groupId
      ? userSplit?.owing
        ? Number(userSplit?.oweAmount) || 0
        : 0
      : exp.splits?.length > 0
      ? userSplit?.owing
        ? Number(userSplit?.oweAmount) || 0
        : 0
      : Number(exp.amount) || 0;

    if (share <= 0) return;

    const ccy = exp.currency || "INR";
    accumulate(categoryMonthMap, category, monthKey, ccy, share);
    accumulate(categoryMonthMap, "Total", monthKey, ccy, share);
  });

  const summaryRows = buildSummary(categoryMonthMap);
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

  // -----------------------------
  // 3. Monthly Trends × Type × Currency
  // -----------------------------
  const monthTrendMap = {};
  expenses.forEach((exp) => {
    if (exp.typeOf !== "expense") return;

    const d = new Date(exp.date);
    const monthKey = getMonthKey(d);
    const userSplit = exp.splits?.find((s) => s.friendId?._id === userId);

    let share = 0;
    let type = "Personal";
    if (exp.groupId) {
      type = "Group";
      if (userSplit?.owing) share = Number(userSplit?.oweAmount) || 0;
    } else if (exp.splits?.length > 0) {
      type = "Friend";
      if (userSplit?.owing) share = Number(userSplit?.oweAmount) || 0;
    } else {
      type = "Personal";
      share = Number(exp.amount) || 0;
    }

    if (share <= 0) return;

    const ccy = exp.currency || "INR";
    accumulate(monthTrendMap, type, monthKey, ccy, share);
    accumulate(monthTrendMap, "Total", monthKey, ccy, share);
  });

  const monthTrendRows = buildSummary(monthTrendMap);
  const wsMonthTrends = XLSX.utils.json_to_sheet(monthTrendRows);

  // -----------------------------
  // 4. Yearly Trends × Type × Currency
  // -----------------------------
  const yearTrendMap = {};
  expenses.forEach((exp) => {
    if (exp.typeOf !== "expense") return;

    const d = new Date(exp.date);
    const yearKey = d.getFullYear();
    const userSplit = exp.splits?.find((s) => s.friendId?._id === userId);

    let share = 0;
    let type = "Personal";
    if (exp.groupId) {
      type = "Group";
      if (userSplit?.owing) share = Number(userSplit?.oweAmount) || 0;
    } else if (exp.splits?.length > 0) {
      type = "Friend";
      if (userSplit?.owing) share = Number(userSplit?.oweAmount) || 0;
    } else {
      type = "Personal";
      share = Number(exp.amount) || 0;
    }

    if (share <= 0) return;

    const ccy = exp.currency || "INR";
    accumulate(yearTrendMap, type, yearKey, ccy, share);
    accumulate(yearTrendMap, "Total", yearKey, ccy, share);
  });

  const yearTrendRows = buildSummary(yearTrendMap);
  const wsYearTrends = XLSX.utils.json_to_sheet(yearTrendRows);

  // -----------------------------
  // Create workbook
  // -----------------------------
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsRaw, "Expenses");
  XLSX.utils.book_append_sheet(wb, wsSummary, "Category Summary");
  XLSX.utils.book_append_sheet(wb, wsMonthTrends, "Monthly Trends");
  XLSX.utils.book_append_sheet(wb, wsYearTrends, "Yearly Trends");

  const fileName = `expenses_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
