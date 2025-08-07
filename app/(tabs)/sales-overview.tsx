// /app/(tabs)/sales-overview.tsx

import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Dimensions,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarChart, PieChart } from 'react-native-chart-kit';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import type { FullBillRow } from '../../services/DatabaseService';
import { databaseService } from '../../services/DatabaseService';

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PADDING = 16;
const CHART_WIDTH = SCREEN_WIDTH - PADDING * 2;
const BAR_CHART_HEIGHT = 220;
const SPACING = 24;
const CM_TO_PX = 37.8;
const TOP_GAP = 1.5 * CM_TO_PX;

// format YYYY-MM-DD
const toISODate = (d: Date) => {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
};

// hour labels
const hourLabels = Array.from({ length: 24 }, (_, i) =>
  i % 3 === 0
    ? i === 0
      ? '12 AM'
      : i < 12
        ? `${i} AM`
        : i === 12
          ? '12 PM'
          : `${i - 12} PM`
    : ''
);

export default function SalesOverviewScreen() {
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        router.replace('/(tabs)/admin-dashboard-billing');
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => subscription.remove();
    }, [router])
  );

  const today = new Date();
  const [reportType, setReportType] = useState<'range' | 'single'>('range');
  const [startDate, setStartDate] = useState<Date>(today);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerStage, setPickerStage] = useState<'start' | 'end' | 'single'>('single');
  const [revenue, setRevenue] = useState(0);
  const [orders, setOrders] = useState(0);
  const [avgValue, setAvgValue] = useState(0);
  const [hourlyOrders, setHourlyOrders] = useState<number[]>(Array(24).fill(0));
  const [dailySales, setDailySales] = useState<number[]>([]);
  const [dailyLabels, setDailyLabels] = useState<string[]>([]);
  const [pieData, setPieData] = useState<{
    name: string;
    population: number;
    color: string;
    percentage: string;
    legendFontColor: string;
    legendFontSize: number;
  }[]>([]);

  function showPicker(stage: 'start' | 'end' | 'single') {
    setPickerStage(stage);
    setPickerVisible(true);
  }

  function handleConfirm(d: Date) {
    setPickerVisible(false);
    if (pickerStage === 'single') {
      setStartDate(d);
      setEndDate(null);
    } else if (pickerStage === 'start') {
      setStartDate(d);
      if (Platform.OS === 'web') {
        setTimeout(() => showPicker('end'), 50);
      } else {
        setEndDate(null);
      }
    } else {
      setEndDate(d);
    }
  }

  const handleWebDateChange = (e: React.ChangeEvent<HTMLInputElement>, stage: 'start' | 'end' | 'single') => {
    const date = new Date(e.target.value);
    if (stage === 'single') {
      setStartDate(date);
      setEndDate(null);
    } else if (stage === 'start') {
      setStartDate(date);
      setEndDate(null);
    } else {
      setEndDate(date);
    }
  };

  const formatDateForInput = (date: Date) => date.toISOString().split('T')[0];

  useEffect(() => {
    if (!startDate) return;
    (async () => {
      try {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        const base = reportType === 'single' ? startDate : endDate || startDate;
        const e = new Date(base);
        e.setHours(23, 59, 59, 999);

        const fromIso = s.toISOString();
        const toIso = e.toISOString();

        // Summary
        const rev = await databaseService.getRevenueForDateRange(fromIso, toIso);
        const cnt = await databaseService.getOrderCountForDateRange(fromIso, toIso);
        setRevenue(rev);
        setOrders(cnt);
        setAvgValue(cnt > 0 ? rev / cnt : 0);

        // Hourly
        const hrsRaw = await databaseService.getBillRowsForDateRange(fromIso, toIso);
        const hrs = Array(24).fill(0);
        hrsRaw.forEach(r => hrs[new Date(r.created_at).getHours()]++);
        setHourlyOrders(hrs);

        // Daily
        const days: Date[] = [];
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          days.push(new Date(d));
        }
        const dailyTotals = await Promise.all(
          days.map(d => {
            const ds = new Date(d);
            ds.setHours(0, 0, 0, 0);
            const de = new Date(d);
            de.setHours(23, 59, 59, 999);
            return databaseService.getRevenueForDateRange(ds.toISOString(), de.toISOString());
          })
        );
        setDailySales(dailyTotals);

        const labels = days.map(d =>
          d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            weekday: days.length <= 14 ? 'short' : undefined,
          })
        );
        setDailyLabels(labels);

        // Pie
        const items = await databaseService.getItemTotalsForDateRange(fromIso, toIso);
        const totalQty = items.reduce((sum, i) => sum + i.totalQty, 0) || 1;
        const sorted = [...items].sort((a, b) => b.totalQty - a.totalQty);

        setPieData(
          sorted.map((it, i, arr) => {
            const hue = Math.round((i * 360) / arr.length);
            return {
              name: it.item_name,
              population: it.totalQty,
              percentage: ((it.totalQty / totalQty) * 100).toFixed(1),
              color: `hsl(${hue}, 70%, 50%)`,
              legendFontColor: '#333',
              legendFontSize: 12,
            };
          })
        );
      } catch (err: any) {
        Alert.alert('Error', err.message);
      }
    })();
  }, [startDate, endDate, reportType]);

  const formattedDate = () =>
    reportType === 'single'
      ? startDate.toDateString()
      : `${startDate.toDateString()} → ${endDate ? endDate.toDateString() : '...'}`;

  const exportToExcel = async () => {
    try {
      const all: (FullBillRow & {
        franchise_id?: string;
        payment_method?: string;
      })[] = await databaseService.getAllBillingData();

      const detailedRows = all.flatMap(bill =>
        bill.items.map(item => ({
          Bill_ID: bill.id,
          Date: new Date(bill.created_at).toLocaleString('en-IN'),
          Franchise_ID: bill.franchise_id || '—',
          Item_Name: item.item_name,
          Quantity: item.qty,
          Price: item.price,
          Subtotal: item.qty * item.price,
          Total_Bill_Amount: bill.total,
          Payment_Method: bill.payment_method || 'Unknown',
        }))
      );

      const ws = XLSX.utils.json_to_sheet(detailedRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Detailed Sales Report');

      const filename = `detailed_sales_${toISODate(new Date())}.xlsx`;

      if (Platform.OS === 'web') {
        // Browser download
        XLSX.writeFile(wb, filename);
      } else {
        // Mobile: write to file and share
        const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const fileUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, wbout, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
      }
    } catch (e: any) {
      Alert.alert('Export failed', e.message);
    }
  };

  // Chart configuration
  const barChartConfig = {
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#fff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0, 100, 0, ${opacity})`,
    labelColor: () => '#333',
    barPercentage: 0.6,
    propsForLabels: { fontSize: 10 },
    propsForBackgroundLines: { strokeWidth: 0 },
    fillShadowGradient: '#006400',
    fillShadowGradientOpacity: 1,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: TOP_GAP }]}>
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.replace('/(tabs)/admin-dashboard-billing')}
            >
              <MaterialIcons name="arrow-back" size={24} color="#006400" />
            </TouchableOpacity>
            <Text style={styles.mainTitle}>SALES ANALYTICS</Text>
            <TouchableOpacity style={styles.exportBtn} onPress={exportToExcel}>
              <MaterialIcons name="file-download" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Date Selector */}
        <View style={styles.dateSection}>
          <View style={styles.dateToggleRow}>
            <TouchableOpacity
              style={[styles.dateToggleBtn, reportType === 'range' && styles.dateToggleBtnActive]}
              onPress={() => { setReportType('range'); setEndDate(null); }}
            >
              <Text style={[styles.dateToggleText, reportType === 'range' && styles.dateToggleTextActive]}>
                Date Range
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateToggleBtn, reportType === 'single' && styles.dateToggleBtnActive]}
              onPress={() => { setReportType('single'); setEndDate(null); }}
            >
              <Text style={[styles.dateToggleText, reportType === 'single' && styles.dateToggleTextActive]}>
                Single Day
              </Text>
            </TouchableOpacity>
          </View>
          
          {Platform.OS === 'web' ? (
            <View style={styles.webDateContainer}>
              {reportType === 'single' ? (
                <input
                  type="date"
                  value={formatDateForInput(startDate)}
                  onChange={(e) => handleWebDateChange(e, 'single')}
                  style={styles.webDateInput}
                />
              ) : (
                <>
                  <input
                    type="date"
                    value={formatDateForInput(startDate)}
                    onChange={(e) => handleWebDateChange(e, 'start')}
                    style={styles.webDateInput}
                  />
                  <Text style={styles.webDateSeparator}>to</Text>
                  <input
                    type="date"
                    value={endDate ? formatDateForInput(endDate) : ''}
                    onChange={(e) => handleWebDateChange(e, 'end')}
                    style={styles.webDateInput}
                    min={formatDateForInput(startDate)}
                  />
                </>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.dateInput} onPress={() => showPicker(reportType === 'single' ? 'single' : 'start')}>
              <MaterialIcons name="event" size={20} color="#006400" />
              <Text style={styles.dateText}>{formattedDate()}</Text>
            </TouchableOpacity>
          )}
        </View>

        {Platform.OS !== 'web' && (
          <DateTimePickerModal
            isVisible={pickerVisible}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onConfirm={handleConfirm}
            onCancel={() => setPickerVisible(false)}
          />
        )}

        {/* Summary Cards */}
        <View style={styles.summarySection}>
          <View style={styles.summaryCard}>
            <MaterialIcons name="currency-rupee" size={24} color="#4CAF50" />
            <Text style={styles.summaryValue}>₹{revenue.toLocaleString('en-IN')}</Text>
            <Text style={styles.summaryLabel}>Total Revenue</Text>
          </View>
          <View style={styles.summaryCard}>
            <MaterialIcons name="receipt" size={24} color="#2196F3" />
            <Text style={styles.summaryValue}>{orders.toLocaleString('en-IN')}</Text>
            <Text style={styles.summaryLabel}>Total Orders</Text>
          </View>
          <View style={styles.summaryCard}>
            <MaterialIcons name="trending-up" size={24} color="#FFC107" />
            <Text style={styles.summaryValue}>
              ₹{avgValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.summaryLabel}>Avg. Order Value</Text>
          </View>
        </View>

        {/* Charts */}
        <View style={styles.chartsContainer}>
          {/* Hourly Sales */}
          <View style={styles.spaciousChartContainer}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Sales by Hour</Text>
              <View style={styles.swipeIndicator}>
                <Text style={styles.swipeText}>Swipe left</Text>
                <MaterialIcons name="chevron-right" size={16} color="#666" />
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              contentContainerStyle={styles.dailyChartScrollContainer}
            >
              <BarChart
                data={{
                  labels: hourLabels,
                  datasets: [{
                    data: hourlyOrders,
                    colors: Array(hourlyOrders.length).fill((opacity = 1) => `rgba(0, 100, 0, ${opacity})`)
                  }]
                }}
                width={Math.max(CHART_WIDTH, hourLabels.length * 40)}
                height={BAR_CHART_HEIGHT}
                fromZero
                showValuesOnTopOfBars
                withHorizontalLabels={false}
                withVerticalLabels
                withInnerLines={false}
                chartConfig={barChartConfig}
                style={{ ...styles.chart, marginLeft: -50, paddingLeft: 5 }}
                yAxisLabel=""
                yAxisSuffix=""
              />
            </ScrollView>
          </View>

          {/* Daily Sales */}
          <View style={[styles.spaciousChartContainer, { marginBottom: SPACING * 1.5 }]}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Sales by Day</Text>
              <View style={styles.swipeIndicator}>
                <Text style={styles.swipeText}>Swipe left</Text>
                <MaterialIcons name="chevron-right" size={16} color="#666" />
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              contentContainerStyle={styles.dailyChartScrollContainer}
            >
              <BarChart
                data={{
                  labels: dailyLabels,
                  datasets: [{
                    data: dailySales,
                    colors: Array(dailySales.length).fill((opacity = 1) => `rgba(0, 100, 0, ${opacity})`)
                  }]
                }}
                width={Math.max(CHART_WIDTH, dailyLabels.length * 60)}
                height={BAR_CHART_HEIGHT}
                fromZero
                showValuesOnTopOfBars
                withHorizontalLabels={false}
                withVerticalLabels
                withInnerLines={false}
                chartConfig={barChartConfig}
                style={{ ...styles.chart, marginLeft: -50, paddingLeft: 5 }}
                yAxisLabel=""
                yAxisSuffix=""
              />
            </ScrollView>
          </View>

          {/* Sales by Item */}
          <View style={styles.spaciousChartContainer}>
            <Text style={styles.chartTitle}>Sales by Item</Text>
            <View style={styles.pieChartWrapper}>
              <PieChart
                data={pieData}
                width={CHART_WIDTH}
                height={BAR_CHART_HEIGHT}
                chartConfig={{ backgroundGradientFrom: '#fff', backgroundGradientTo: '#fff', color: () => '#333' }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute
                hasLegend={false}
                avoidFalseZero
                center={[CHART_WIDTH / 4, 0]}
                style={styles.pieChart}
              />
            </View>
            {pieData.length > 0 && (
              <View style={styles.itemsTableContainer}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 2 }]}>Item</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Qty</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>%</Text>
                </View>
                {pieData.map((item, idx) => (
                  <View key={idx} style={styles.tableRow}>
                    <View style={[styles.tableCell, { flex: 2, flexDirection: 'row', alignItems: 'center' }]}>
                      <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
                      <Text style={styles.tableCellText} numberOfLines={1}>{item.name}</Text>
                    </View>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right' }]}>
                      {item.population.toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right' }]}>
                      {item.percentage}%
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8faf8' },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    padding: PADDING,
    paddingBottom: SPACING,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    zIndex: 1,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#006400',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  exportBtn: {
    backgroundColor: '#006400',
    padding: 8,
    borderRadius: 20,
    position: 'absolute',
    right: 0,
  },
  dateSection: {
    padding: PADDING,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: SPACING,
  },
  dateToggleRow: {
    flexDirection: 'row',
    marginBottom: SPACING,
    backgroundColor: '#f0f4f7',
    borderRadius: 10,
    padding: 4,
  },
  dateToggleBtn: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center' },
  dateToggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dateToggleText: { color: '#666', fontWeight: '600' },
  dateToggleTextActive: { color: '#006400' },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#f9f9f9',
  },
  dateText: { marginLeft: 10, color: '#333', fontWeight: '500', fontSize: 16 },
  webDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  webDateInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius:
  10,
    padding: 12,
    backgroundColor: '#f9f9f9',
    fontSize: 16,
    flex: 1,
  },
  webDateSeparator: {
    color: '#666',
    fontWeight: '500',
  },
  summarySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: PADDING,
    backgroundColor: '#fff',
    marginBottom: SPACING,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#f8faf8',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#eee',
  },
  summaryValue: { fontSize: 18, fontWeight: '700', marginTop: 8, color: '#333' },
  summaryLabel: { fontSize: 14, color: '#666', marginTop: 4 },
  chartsContainer: { paddingHorizontal: PADDING, paddingBottom: PADDING * 2 },
  spaciousChartContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: SPACING,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  chartTitle: { fontSize: 18, fontWeight: '700', color: '#2c3e50' },
  swipeIndicator: { flexDirection: 'row', alignItems: 'center' },
  swipeText: { fontSize: 12, color: '#666', marginRight: 4 },
  chart: { borderRadius: 12, overflow: 'hidden' },
  dailyChartScrollContainer: { paddingBottom: 10 },
  pieChartWrapper: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  pieChart: { borderRadius: 12, overflow: 'hidden' },
  itemsTableContainer: { marginTop: 16, borderWidth: 1, borderColor: '#eee', borderRadius: 12, overflow: 'hidden' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tableHeaderText: { fontWeight: '700', color: '#2c3e50', fontSize: 14 },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    alignItems: 'center',
  },
  tableCell: { paddingHorizontal: 4 },
  tableCellText: { color: '#444', fontSize: 14 },
  colorIndicator: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
});
