// src/app/(app)/(tabs)/settings/report.js
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Sharing from 'expo-sharing';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as FileSystem from 'expo-file-system';
import Header from '~/header';
import XLSX from 'xlsx'; // SheetJS
import { getAllExpenses } from 'services/ExpenseService';
import { getCategoryLabel } from 'utils/categoryOptions';
import Dropdown from '~/dropDown'; // <-- your dropdown component
import { ThemeProvider, useTheme } from "context/ThemeProvider";

function isoDate(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function pad2(n) { return String(n).padStart(2, '0'); }

/** format date according to user choice */
function formatDateByOption(d, opt = 'dd/mm/yyyy') {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);

  const dd = pad2(dt.getDate());
  const mm = pad2(dt.getMonth() + 1);
  const yyyy = dt.getFullYear();
  const monthShort = dt.toLocaleString('en-GB', { month: 'short' }); // e.g. "Oct"

  if (opt === 'mm/dd/yyyy') return `${mm}/${dd}/${yyyy}`;
  if (opt === 'dd mon, yyyy') return `${dd} ${monthShort}, ${yyyy}`;
  // default dd/mm/yyyy
  return `${dd}/${mm}/${yyyy}`;
}

function formatReadable(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  } catch {
    return String(d);
  }
}

export default function DownloadExcelPage() {
const { theme } = useTheme();
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return isoDate(d); });
  const [endDate, setEndDate] = useState(() => isoDate(new Date()));
  const [loading, setLoading] = useState(false);
  const [showPickerFor, setShowPickerFor] = useState(null);

  // new states
  const [dateFormat, setDateFormat] = useState('dd/mm/yyyy'); // default
  const [sortBy, setSortBy] = useState('expense'); // 'expense' | 'created'
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'personal' | 'split'

  const styles = useMemo(() => createStyles(theme), [theme,]);

  const onConfirmDate = (date) => {
    const s = isoDate(date);
    if (showPickerFor === 'start') setStartDate(s); else setEndDate(s);
    setShowPickerFor(null);
  };
  const onCancelDate = () => setShowPickerFor(null);

  const handleDownload = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      Alert.alert('Error', 'Dates must be in YYYY-MM-DD');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      Alert.alert('Error', 'Start date must be before end date');
      return;
    }

    setLoading(true);
    try {
      const res = await getAllExpenses();
      const allExpenses = Array.isArray(res?.expenses) ? res.expenses : (Array.isArray(res) ? res : []);
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T23:59:59.999Z`);

      // filter by provided date range (expense.date)
      let expenses = allExpenses.filter(e => {
        if (!e?.date) return false;
        const dt = new Date(e.date);
        return dt >= start && dt <= end;
      });

      // Apply mode filter
      if (filterMode === 'personal') expenses = expenses.filter(e => e.mode === 'personal');
      else if (filterMode === 'split') expenses = expenses.filter(e => e.mode === 'split');

      if (!expenses.length) {
        Alert.alert('No data', 'No expenses found for the selected range and filters.');
        setLoading(false);
        return;
      }

      // Sort
      const sortKey = (sortBy === 'created') ? 'createdAt' : 'date';
      expenses.sort((a, b) => {
        const A = new Date(a?.[sortKey] || a?.date || a?.createdAt || 0).getTime();
        const B = new Date(b?.[sortKey] || b?.date || b?.createdAt || 0).getTime();
        if (A === B) {
          const aC = new Date(a.createdAt || 0).getTime();
          const bC = new Date(b.createdAt || 0).getTime();
          return aC - bC;
        }
        return  B - A;
      });

      // Build Detailed sheet
      const detailedHeader = ['Date','Description','Currency','Amount (You owe / paid)','Your Payment Method','Category','Group/Friend','Created By', 'Created At'];
      const detailedAOA = [detailedHeader];
      const myUserId = res?.id || null;

      expenses.forEach(e => {
        let mySplit = null;
        if (Array.isArray(e.splits)) {
          for (const s of e.splits) {
            const fid = String(s.friendId?._id || s.friendId || '');
            if (myUserId && fid === String(myUserId)) { mySplit = s; break; }
          }
        }
        const youOwe = mySplit && mySplit.owing ? Number(mySplit.oweAmount || 0) : 0;
        const youPay = mySplit && mySplit.paying ? Number(mySplit.payAmount || 0) : 0;

        const myPmLabel =
          (mySplit && mySplit.paidFromPaymentMethodId && (mySplit.paidFromPaymentMethodId.label || String(mySplit.paidFromPaymentMethodId)))
          || (e.paidFromPaymentMethodId && (e.paidFromPaymentMethodId.label || String(e.paidFromPaymentMethodId)))
          || '';

        const catLabel = getCategoryLabel(e) || 'Uncategorized';

        const groupOrFriend = e.groupId
          ? (typeof e.groupId === 'object' ? (e.groupId.name || '') + ' (Group)' : String(e.groupId))
          : (Array.isArray(e.splits) ? e.splits.filter(s => String(s.friendId?._id || s.friendId) !== String(myUserId)).map(s => (s.friendId?.name || s.friendId || '')).join('; ') : '');

        const amountCell = (e.mode === 'personal') ? Number(e.amount || 0) : youOwe;

        // depending on sortBy choice, show the corresponding date in selected format
        const dateToFormat = e.date
        const dateStr = formatDateByOption(dateToFormat, dateFormat);
        const createdStr = formatReadable(e.createdAt);

        // final row
        // ['Date','Description','Currency','Amount (You owe / paid)','Your Payment Method','Category','Group/Friend','Created By']
        detailedAOA.push([
          dateStr,
          e.description || '',
          e.currency || '',
          amountCell,
          myPmLabel,
          catLabel,
          groupOrFriend,
          e.createdBy?.name || '',
          
        ]);
      });

      // Monthly summary (by expense.date)
      const monthlyMap = {};
      const monthSet = new Set();
      for (const e of expenses) {
        const catLabel = getCategoryLabel(e) || 'Uncategorized';
        const dt = new Date(e.date);
        const monthKey = dt.toLocaleString('en-GB', { month: 'short', year: 'numeric' }); // "Oct 2025"
        monthSet.add(monthKey);
        monthlyMap[catLabel] = monthlyMap[catLabel] || {};
        monthlyMap[catLabel][monthKey] = (monthlyMap[catLabel][monthKey] || 0) + (Number(e.amount) || 0);
      }
      const sortedMonths = Array.from(monthSet).sort((a,b) => {
        const parse = s => { const [m,y] = s.split(' '); return new Date(`${m} 1 ${y}`).getTime(); };
        return parse(a) - parse(b);
      });
      const monthlyHeader = ['Bucket', ...sortedMonths.map(m => `${m} (INR)`), 'Total (INR)'];
      const monthlyAOA = [monthlyHeader];
      const monthlyCats = Object.keys(monthlyMap).sort((a,b) => a.localeCompare(b));
      for (const cat of monthlyCats) {
        let total = 0;
        const row = [cat];
        for (const m of sortedMonths) {
          const v = monthlyMap[cat][m] || 0;
          row.push(v);
          total += v;
        }
        row.push(total);
        monthlyAOA.push(row);
      }

      // Yearly summary
      const yearlyMap = {};
      for (const e of expenses) {
        const year = new Date(e.date).getFullYear();
        const catLabel = getCategoryLabel(e) || 'Uncategorized';
        yearlyMap[year] = yearlyMap[year] || {};
        yearlyMap[year][catLabel] = (yearlyMap[year][catLabel] || 0) + (Number(e.amount) || 0);
      }
      const yearlyAOA = [['Category', 'Year', 'Total (INR)']];
      const yearsSorted = Object.keys(yearlyMap).sort();
      for (const year of yearsSorted) {
        const catKeys = Object.keys(yearlyMap[year]).sort((a,b) => a.localeCompare(b));
        for (const cat of catKeys) {
          yearlyAOA.push([cat, String(year), yearlyMap[year][cat]]);
        }
      }

      // Build workbook
      const wb = XLSX.utils.book_new();
      const wsDetailed = XLSX.utils.aoa_to_sheet(detailedAOA);
      XLSX.utils.book_append_sheet(wb, wsDetailed, 'Detailed Expenses');
      const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyAOA);
      XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Category Summary');
      const wsYearly = XLSX.utils.aoa_to_sheet(yearlyAOA);
      XLSX.utils.book_append_sheet(wb, wsYearly, 'Yearly Summary');

      // Write workbook to base64
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      // Save to file
      const fileName = `expensease_report_${startDate}_to_${endDate}.xlsx`;
      const fileUri = `${FileSystemLegacy.cacheDirectory || FileSystem.cacheDirectory}${fileName}`;

      const base64Encoding = (FileSystemLegacy.EncodingType && FileSystemLegacy.EncodingType.Base64)
        || (FileSystem.EncodingType && FileSystem.EncodingType.Base64)
        || 'base64';

      try {
        await FileSystemLegacy.writeAsStringAsync(fileUri, wbout, { encoding: base64Encoding });
      } catch (writeErr) {
        await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: base64Encoding }).catch(e => { throw writeErr; });
      }

      // share
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Expensease Report' });
      } else {
        Alert.alert('Saved', `Report saved to ${fileUri}`);
      }
    } catch (err) {
      console.error('Excel generation error', err);
      Alert.alert('Error', err?.message || 'Failed to generate Excel');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, dateFormat, sortBy, filterMode]);

  const dateFormatOptions = [
    { value: 'dd/mm/yyyy', label: 'DD/MM/YYYY' },
    { value: 'mm/dd/yyyy', label: 'MM/DD/YYYY' },
    { value: 'dd mon, yyyy', label: 'DD MON, YYYY' },
  ];
  const sortOptions = [
    { value: 'expense', label: 'Expense date' },
    { value: 'created', label: 'Creation date' },
  ];
  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'personal', label: 'Personal' },
    { value: 'split', label: 'Split' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      <Header showBack />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.title}>Download Excel</Text>
        <Text style={styles.subtitle}>Downlaod expenses and summaries associated. Choose date range, format, sort & filter.</Text>
        <View style={{flexDirection: 'row', gap: 12, marginBottom: 12}}>
        <View style={{flexDirection: 'column', flex: 1}}>
          <Text style={styles.label}>Start date</Text>
          <TouchableOpacity style={styles.dateTouchable} onPress={() => setShowPickerFor('start')} disabled={loading}>
            <Text style={{color: theme?.colors?.text, fontWeight: '700'}}>{startDate}</Text>
          </TouchableOpacity>
        </View>

        <View style={{flexDirection: 'column', flex: 1}}>
          <Text style={styles.label}>End date</Text>
          <TouchableOpacity style={styles.dateTouchable} onPress={() => setShowPickerFor('end')} disabled={loading}>
            <Text style={{color: theme?.colors?.text, fontWeight: '700'}}>{endDate}</Text>
          </TouchableOpacity>
        </View>
        </View>
        <View style={{flexDirection: 'row', gap: 12,  marginBottom: 12}}>
        <View style={{ flex: 1, flexDirection: 'column' }}>
          <Text style={styles.label}>Date format</Text>
          <Dropdown
            value={dateFormat}
            options={dateFormatOptions}
            onChange={(v) => setDateFormat(v)}
            placeholder="Select date format"
            menuWidth={220}
          />
        </View>

        <View style={{ flex: 1,flexDirection: 'column' }}>
          <Text style={styles.label}>Sort by</Text>
          <Dropdown
            value={sortBy}
            options={sortOptions}
            onChange={(v) => setSortBy(v)}
            placeholder="Sort by"
            menuWidth={220}
          />
        </View>
        </View>
        <View style={{  marginBottom: 12}}>
          <Text style={styles.label}>Include</Text>
          <Dropdown
            value={filterMode}
            options={filterOptions}
            onChange={(v) => setFilterMode(v)}
            placeholder="Include"
            menuWidth={220}
          />
        </View>

        <TouchableOpacity style={[styles.button, loading ? { opacity: 0.7 } : null]} onPress={handleDownload} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Download Excel</Text>}
        </TouchableOpacity>

        <DateTimePickerModal
          isVisible={!!showPickerFor}
          mode="date"
          onConfirm={onConfirmDate}
          onCancel={onCancelDate}
          date={showPickerFor === 'start' ? new Date(startDate) : new Date(endDate)}
          maximumDate={new Date()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme) => ({
  safe: { flex: 1, backgroundColor: theme?.colors?.background || '#fff' },
  container: { padding: 16, flex: 1 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 6, color: theme?.colors?.text || '#000' },
  subtitle: { color: '#6b7280', marginBottom: 12, color: theme?.colors?.muted || '#000' },
  row: { flexDirection: 'row', flex: 1, marginBottom: 12 },
  label: { marginBottom: 6, color: theme?.colors?.text, fontWeight: '500' },
  dateTouchable: { height: 44, borderWidth: 1, borderColor: theme?.colors?.border, borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: theme?.colors?.background || '#f9f9f9' },
  button: { backgroundColor: '#0ea5a3', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
