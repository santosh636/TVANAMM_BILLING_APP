// frontend/app/(tabs)/sales-overview.tsx
import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  BackHandler,
} from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { databaseService } from '../../services/DatabaseService';
import type { FullBillRow } from '../../services/DatabaseService';
import { MaterialIcons } from '@expo/vector-icons';

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PADDING = 16;
const CHART_WIDTH = SCREEN_WIDTH - PADDING * 2;
const BAR_CHART_HEIGHT = 220;
const PIE_CHART_HEIGHT = 280;
const SPACING = 16;
const CM_TO_PX = 37.8;
const TOP_GAP = 1.5 * CM_TO_PX;

// Color constants
const PRIMARY_COLOR = '#006437'; // RGB: 0, 100, 55
const PRIMARY_LIGHT = '#e6f2ed';
const PRIMARY_DARK = '#004d29';

/**
 * Generate `count` visually distinct HSL colors.
 * Example output: ["hsl(0,65%,50%)", "hsl(60,65%,50%)", ...]
 */
const generateDistinctColors = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => {
    const hue = Math.round((i * 360) / count);
    return `hsl(${hue},65%,50%)`;
 });

// format YYYY-MM-DD
const toISODate = (d: Date) => {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
};

// hour labels every 3 hours
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
  const params = useLocalSearchParams<{ franchiseId?: string }>();
  const extFid = params.franchiseId;

  // central‐branch state
  const [extRevenue, setExtRevenue] = useState<number | null>(null);
  const [extOrders, setExtOrders] = useState<number | null>(null);
  const [extPie, setExtPie] = useState<{ name: string; population: number; color: string }[]>([]);

  // fallback (admin) branch state
  const today = new Date();
  const [reportType, setReportType] = useState<'range' | 'single'>('range');
  const [startDate, setStartDate] = useState<Date>(today);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerStage, setPickerStage] = useState<'start' | 'end' | 'single'>('single');
  const [revenue, setRevenue] = useState(0);
  const [orders, setOrders] = useState(0);
  const [hourlyOrders, setHourlyOrders] = useState<number[]>(Array(24).fill(0));
  const [dailySales, setDailySales] = useState<number[]>([]);
  const [dailyLabels, setDailyLabels] = useState<string[]>([]);
  const [pieData, setPieData] = useState<
    {
      name: string;
      population: number;
      percentage: string;
      color: string;
      legendFontColor: string;
      legendFontSize: number;
    }[]
  >([]);

  // Android back handler
  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        router.replace(extFid ? '/(tabs)/central_dashboard' : '/(tabs)/admin-dashboard-billing');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [router, extFid])
  );

  // Fetch central‐branch metrics
  useEffect(() => {
    if (!extFid) return;
    (async () => {
      try {
        const [rev, cnt, items] = await Promise.all([
          databaseService.getRevenueForFranchise(extFid),
          databaseService.getOrderCountForFranchise(extFid),
          databaseService.getItemTotalsForFranchise(extFid),
        ]);
        setExtRevenue(rev);
        setExtOrders(cnt);

        // generate one unique color per item
        const colors = generateDistinctColors(items.length);
        setExtPie(
          items.map((it, i) => ({
            name: `${it.item_name} (${it.totalQty})`,
            population: it.totalQty,
            color: colors[i],
          }))
        );
      } catch (e: any) {
        Alert.alert('Error', e.message);
      }
    })();
  }, [extFid]);

  // Fetch fallback‐branch analytics
  useEffect(() => {
    if (extFid) return;
    (async () => {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      const base = reportType === 'single' ? startDate : endDate || startDate;
      const e = new Date(base);
      e.setHours(23, 59, 59, 999);

      const fromIso = s.toISOString();
      const toIso = e.toISOString();

      try {
        // Summary
        const rev = await databaseService.getRevenueForDateRange(fromIso, toIso);
        const cnt = await databaseService.getOrderCountForDateRange(fromIso, toIso);
        setRevenue(rev);
        setOrders(cnt);

        // Hourly
        const billRows = await databaseService.getBillRowsForDateRange(fromIso, toIso);
        const hrs = Array(24).fill(0);
        billRows.forEach((r) => {
          hrs[new Date(r.created_at).getHours()]++;
        });
        setHourlyOrders(hrs);

        // Daily
        const days: Date[] = [];
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          days.push(new Date(d));
        }
        const dailyTotals = await Promise.all(
          days.map((d) => {
            const ds = new Date(d);
            ds.setHours(0, 0, 0, 0);
            const de = new Date(d);
            de.setHours(23, 59, 59, 999);
            return databaseService.getRevenueForDateRange(ds.toISOString(), de.toISOString());
          })
        );
        setDailySales(dailyTotals);

        setDailyLabels(
          days.map((d) => {
            const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = d.getDate();
            return `${weekday} ${dayNum}`;
          })
        );

        // Pie
        const items = await databaseService.getItemTotalsForDateRange(fromIso, toIso);
        const totalQty = items.reduce((sum, it) => sum + it.totalQty, 0) || 1;
        const colors = generateDistinctColors(items.length);
        setPieData(
          items.map((it, i) => ({
            name: it.item_name,
            population: it.totalQty,
            percentage: ((it.totalQty / totalQty) * 100).toFixed(1),
            color: colors[i],
            legendFontColor: '#333',
            legendFontSize: 12,
          }))
        );
      } catch (e: any) {
        Alert.alert('Error', e.message);
      }
    })();
  }, [startDate, endDate, reportType, extFid]);

  // DatePicker handlers
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
      setEndDate(null);
      setTimeout(() => showPicker('end'), 50);
    } else {
      setEndDate(d);
    }
  }

  // Export to Excel
  const exportToExcel = async () => {
    try {
      const all: FullBillRow[] = await databaseService.getAllBillingData();
      const flat = all.flatMap((b) =>
        b.items.map((i) => ({
          bill_id: b.id,
          created_at: b.created_at,
          total: b.total,
          item_name: i.item_name,
          qty: i.qty,
          price: i.price,
        }))
      );
      const ws = XLSX.utils.json_to_sheet(flat);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sales');
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fn = FileSystem.documentDirectory + `sales_${toISODate(new Date())}.xlsx`;
      await FileSystem.writeAsStringAsync(fn, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await Sharing.shareAsync(fn, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } catch (e: any) {
      Alert.alert('Export failed', e.message);
    }
  };

  // CENTRAL BRANCH VIEW
  if (extFid) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={{ padding: PADDING }}>
          <Text style={styles.centralHeader}>Sales Overview for {extFid}</Text>
          <View style={styles.summarySection}>
            <View style={styles.summaryCard}>
              <MaterialIcons name="currency-rupee" size={24} color={PRIMARY_COLOR} />
              <Text style={styles.summaryValue}>₹{extRevenue?.toLocaleString('en-IN') ?? '—'}</Text>
              <Text style={styles.summaryLabel}>Total Revenue</Text>
            </View>
            <View style={styles.summaryCard}>
              <MaterialIcons name="receipt" size={24} color={PRIMARY_COLOR} />
              <Text style={styles.summaryValue}>{extOrders?.toLocaleString('en-IN') ?? '—'}</Text>
              <Text style={styles.summaryLabel}>Total Orders</Text>
            </View>
          </View>
          {extPie.length > 0 && (
            <>
              <Text style={styles.subheader}>Item Mix</Text>
              <PieChart
                data={extPie.map((d) => ({
                  name: d.name,
                  population: d.population,
                  color: d.color,
                  legendFontColor: '#333',
                  legendFontSize: 12,
                }))}
                width={CHART_WIDTH}
                height={PIE_CHART_HEIGHT}
                chartConfig={{
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                  color: () => `#333`,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute
                hasLegend
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ADMIN BRANCH VIEW
  const formattedDate = () =>
    reportType === 'single'
      ? startDate.toDateString()
      : `${startDate.toDateString()} → ${endDate ? endDate.toDateString() : '...'}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: TOP_GAP }]}>
          <View style={styles.headerContent}>
            <Text style={styles.mainTitle}>SALES ANALYTICS</Text>
            <TouchableOpacity style={styles.exportBtn} onPress={exportToExcel}>
              <MaterialIcons name="file-download" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Report Type Toggle */}
        <View style={styles.dateToggleRow}>
          <TouchableOpacity
            style={[styles.dateToggleBtn, reportType === 'range' && styles.dateToggleBtnActive]}
            onPress={() => {
              setReportType('range');
              setEndDate(null);
            }}
          >
            <Text style={[styles.dateToggleText, reportType === 'range' && styles.dateToggleTextActive]}>
              Date Range
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateToggleBtn, reportType === 'single' && styles.dateToggleBtnActive]}
            onPress={() => {
              setReportType('single');
              setEndDate(null);
            }}
          >
            <Text style={[styles.dateToggleText, reportType === 'single' && styles.dateToggleTextActive]}>
              Single Date
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Picker */}
        <View style={styles.dateSection}>
          <TouchableOpacity
            style={styles.dateInput}
            onPress={() => showPicker(reportType === 'single' ? 'single' : 'start')}
          >
            <MaterialIcons name="event" size={20} color={PRIMARY_COLOR} />
            <Text style={styles.dateText}>{formattedDate()}</Text>
          </TouchableOpacity>
          <DateTimePickerModal
            isVisible={pickerVisible}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onConfirm={handleConfirm}
            onCancel={() => setPickerVisible(false)}
          />
        </View>

        {/* Summary */}
        <View style={styles.summarySection}>
          <View style={styles.summaryCard}>
            <MaterialIcons name="attach-money" size={24} color={PRIMARY_COLOR} />
            <Text style={styles.summaryValue}>₹{revenue.toLocaleString('en-IN')}</Text>
            <Text style={styles.summaryLabel}>Total Revenue</Text>
          </View>
          <View style={styles.summaryCard}>
            <MaterialIcons name="receipt" size={24} color={PRIMARY_COLOR} />
            <Text style={styles.summaryValue}>{orders.toLocaleString('en-IN')}</Text>
            <Text style={styles.summaryLabel}>Total Orders</Text>
          </View>
        </View>

        {/* Charts */}
        <View style={styles.chartsContainer}>
          {/* Sales by Hour */}
          <View style={styles.chartContainer}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Sales by Hour</Text>
              <View style={styles.swipeIndicator}>
                <Text style={styles.swipeText}>Swipe left</Text>
                <MaterialIcons name="chevron-right" size={16} color="#666" />
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.chartScroll}>
              <BarChart
                data={{ labels: hourLabels, datasets: [{ data: hourlyOrders }] }}
                width={Math.max(CHART_WIDTH, hourLabels.length * 40)}
                height={BAR_CHART_HEIGHT}
                fromZero
                showValuesOnTopOfBars
                withHorizontalLabels={false}
                withVerticalLabels
                withInnerLines={false}
                chartConfig={{
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                  decimalPlaces: 0,
                  color: () => `#333`,
                  labelColor: () => `#333`,
                  barPercentage: 0.5,
                  propsForLabels: { fontSize: 10 },
                  propsForBackgroundLines: { strokeWidth: 0 },
                }}
                style={{ ...styles.chart, marginLeft: -34 }}
                yAxisLabel=""
                yAxisSuffix=""
              />
            </ScrollView>
          </View>

          {/* Sales by Day */}
          <View style={styles.chartContainer}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Sales by Day</Text>
              <View style={styles.swipeIndicator}>
                <Text style={styles.swipeText}>Swipe left</Text>
                <MaterialIcons name="chevron-right" size={16} color="#666" />
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.chartScroll}>
              <BarChart
                data={{ labels: dailyLabels, datasets: [{ data: dailySales }] }}
                width={Math.max(CHART_WIDTH, dailyLabels.length * 60)}
                height={BAR_CHART_HEIGHT}
                fromZero
                showValuesOnTopOfBars
                withHorizontalLabels={false}
                withVerticalLabels
                withInnerLines={false}
                chartConfig={{
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                  decimalPlaces: 0,
                  color: () => `#333`,
                  labelColor: () => `#333`,
                  barPercentage: 0.6,
                  propsForLabels: { fontSize: 10 },
                  propsForBackgroundLines: { strokeWidth: 0 },
                }}
                style={{ ...styles.chart, marginLeft: -34 }}
                yAxisLabel=""
                yAxisSuffix=""
              />
            </ScrollView>
          </View>

          {/* Sales by Item */}
          <View style={styles.chartContainer}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Sales by Item</Text>
            </View>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <PieChart
                data={pieData}
                width={CHART_WIDTH}
                height={PIE_CHART_HEIGHT}
                chartConfig={{
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                  color: () => `#333`,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="95"
                absolute
                hasLegend={false}
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
                      <Text style={styles.tableCellText} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right' }]}>
                      {item.population.toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right' }]}>{item.percentage}%</Text>
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
  scrollContent: { flexGrow: 1 },

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
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: PRIMARY_COLOR,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  exportBtn: {
    backgroundColor: PRIMARY_COLOR,
    padding: 8,
    borderRadius: 20,
    position: 'absolute',
    right: 0,
  },

  dateToggleRow: {
    flexDirection: 'row',
    margin: PADDING,
    backgroundColor: '#f0f4f7',
    borderRadius: 10,
    padding: 4,
  },
  dateToggleBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  dateToggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dateToggleText: {
    color: '#666',
    fontWeight: '600',
  },
  dateToggleTextActive: {
    color: PRIMARY_COLOR,
  },

  dateSection: {
    padding: PADDING,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: SPACING,
  },
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

  chartsContainer: { padding: PADDING, paddingBottom: PADDING * 2 },
  chartContainer: {
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
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: { fontSize: 18, fontWeight: '700', color: '#2c3e50' },
  swipeIndicator: { flexDirection: 'row', alignItems: 'center' },
  swipeText: { fontSize: 12, color: '#666', marginRight: 4 },

  chartScroll: { paddingBottom: 8 },
  chart: { borderRadius: 12, overflow: 'hidden' },

  itemsTableContainer: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tableHeaderText: {
    fontWeight: '700',
    color: '#2c3e50',
    fontSize: 14,
  },
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

  centralHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: PRIMARY_COLOR,
    textAlign: 'center',
    marginVertical: 12,
  },
  subheader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    textAlign: 'center',
  },
});
