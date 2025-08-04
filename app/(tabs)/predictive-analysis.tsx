// frontend/app/(tabs)/predictive-analysis.tsx

import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  BackHandler,
  useWindowDimensions,
  Animated,
} from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { PieChart } from 'react-native-chart-kit';
import { useRouter, useFocusEffect } from 'expo-router';
import { databaseService } from '../../services/DatabaseService';
import type { AggregatedItemTotal } from '../../services/DatabaseService';
import { MaterialIcons, Ionicons, Feather } from '@expo/vector-icons';

// Color constants
const PRIMARY_COLOR = 'rgb(0, 100, 55)';
const PRIMARY_LIGHT = 'rgba(0, 100, 55, 0.2)';
const ACCENT_COLOR = 'rgb(255, 215, 0)';
const BG_COLOR = 'rgb(248, 250, 248)';
const CARD_BG = '#ffffff';
const TEXT_DARK = 'rgb(44, 62, 80)';
const TEXT_LIGHT = 'rgb(136, 136, 136)';

// Convert cm to pixels
const CM_TO_PX = 37.8;
const TOP_BOTTOM_GAP = CM_TO_PX * 0.5;   // ≈ 19px vertical padding on header

interface Recommendation {
  item: string;
  recommendation: string;
  confidence: number;
}

const recommendationStrategies = {
  trendingItems: (data: AggregatedItemTotal[]) => {
    const sorted = [...data].sort((a, b) => b.totalQty - a.totalQty);
    return sorted.slice(0, 3).map(item => ({
      item: item.item_name,
      recommendation: `Boost ${item.item_name} stock - trending now!`,
      confidence: Math.min(
        100,
        Math.round((item.totalQty / (sorted[0]?.totalQty || 1)) * 100)
      ),
    }));
  },
  lowStockPotential: (data: AggregatedItemTotal[]) => {
    const avg = data.reduce((sum, x) => sum + x.totalQty, 0) / data.length;
    const low = data.filter(i => i.totalQty < avg * 0.7);
    const sorted = [...low].sort((a, b) => b.totalQty - a.totalQty);
    return sorted.slice(0, 2).map(item => ({
      item: item.item_name,
      recommendation: `Promote ${item.item_name} - slower sales detected`,
      confidence: 60,
    }));
  },
};

const getRecommendations = (data: AggregatedItemTotal[]): Recommendation[] => {
  const all = [
    ...recommendationStrategies.trendingItems(data),
    ...recommendationStrategies.lowStockPotential(data),
  ];
  const map = new Map<string, Recommendation>();
  all.forEach(r => {
    if (!map.has(r.item)) map.set(r.item, r);
  });
  return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence);
};

const generateDistinctColors = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => {
    const hue = Math.round((i * 360) / count);
    return `hsl(${hue}, 70%, 50%)`;
  });

export default function PredictiveAnalysisScreen() {
  const router = useRouter();
  const today = new Date();
  const [mode, setMode] = useState<'range' | 'single'>('range');
  const [start, setStart] = useState<Date>(today);
  const [end, setEnd] = useState<Date | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerStage, setPickerStage] = useState<'start' | 'end' | 'single'>('single');
  const [pieData, setPieData] = useState<any[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.95));

  const { width } = useWindowDimensions();
  const chartDimensions = {
    width: Math.min(width - 80, 200),
    height: Math.min(width - 80, 200),
  };

  // Animate header in
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Fetch aggregated item totals and build chart + recs
  useEffect(() => {
    const load = async () => {
      try {
        // start of day
        const s = new Date(start);
        s.setHours(0, 0, 0, 0);
        // end of chosen day/range
        const base = mode === 'single' ? start : end || start;
        const e = new Date(base);
        e.setHours(23, 59, 59, 999);

        const sIso = s.toISOString();
        const eIso = e.toISOString();

        // Pull pre-aggregated data from service
        const items: AggregatedItemTotal[] =
          await databaseService.getItemTotalsForDateRange(sIso, eIso);

        // Build pie chart payload
        const totalQty = items.reduce((sum, i) => sum + i.totalQty, 0) || 1;
        const colors = generateDistinctColors(items.length);
        const pie = items
          .map((it, i) => ({
            name: it.item_name,
            population: it.totalQty,
            percentage: ((it.totalQty / totalQty) * 100).toFixed(1),
            color: colors[i],
            legendFontColor: '#333',
            legendFontSize: 12,
          }))
          .sort((a, b) => b.population - a.population);
        setPieData(pie);

        // Build recommendations
        setRecs(getRecommendations(items));
      } catch (err: any) {
        Alert.alert('Error', err.message);
      }
    };
    load();
  }, [start, end, mode]);

  // Handle Android back to dashboard
  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        router.replace('/(tabs)/admin-dashboard-billing');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [router])
  );

  const openPicker = (stage: 'start' | 'end' | 'single') => {
    setPickerStage(stage);
    setPickerVisible(true);
  };

  const onPick = (d: Date) => {
    setPickerVisible(false);
    if (pickerStage === 'single') {
      setStart(d);
      setEnd(null);
    } else if (pickerStage === 'start') {
      setStart(d);
      setEnd(null);
      setTimeout(() => openPicker('end'), 50);
    } else {
      setEnd(d);
    }
  };

  // Format display date
  const fmtDate = () => {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    if (mode === 'single') {
      return start.toLocaleDateString('en-US', opts);
    } else {
      const startStr = start.toLocaleDateString('en-US', opts);
      const endStr = end ? end.toLocaleDateString('en-US', opts) : '...';
      return `${startStr} → ${endStr}`;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Animated Header */}
      <Animated.View
        style={[
          styles.header,
          {
            paddingTop: TOP_BOTTOM_GAP,
            paddingBottom: TOP_BOTTOM_GAP,
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/admin-dashboard-billing')}>
            <Ionicons name="arrow-back" size={24} color={PRIMARY_COLOR} />
          </TouchableOpacity>
          <Text style={styles.title}>Predictive Insights</Text>
          <Feather name="bar-chart-2" size={24} color={PRIMARY_COLOR} />
        </View>
      </Animated.View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Date Selector */}
        <Animated.View
          style={[
            styles.dateCard,
            {
              opacity: fadeAnim,
              transform: [
                {
                  translateY: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'range' && styles.toggleBtnActive]}
              onPress={() => {
                setMode('range');
                setEnd(null);
              }}
            >
              <Text style={[styles.toggleTxt, mode === 'range' && styles.toggleTxtActive]}>
                Range
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'single' && styles.toggleBtnActive]}
              onPress={() => {
                setMode('single');
                setEnd(null);
              }}
            >
              <Text style={[styles.toggleTxt, mode === 'single' && styles.toggleTxtActive]}>
                Single Day
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.dateInput}
            onPress={() => openPicker(mode === 'single' ? 'single' : 'start')}
          >
            <MaterialIcons name="date-range" size={20} color={PRIMARY_COLOR} />
            <Text style={styles.dateText}>{fmtDate()}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={TEXT_LIGHT} />
          </TouchableOpacity>
        </Animated.View>

        {/* Sales Composition */}
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="pie-chart-outline" size={20} color={PRIMARY_COLOR} />
            <Text style={styles.cardTitle}>Sales Composition</Text>
            <TouchableOpacity>
              <Feather name="info" size={18} color={TEXT_LIGHT} />
            </TouchableOpacity>
          </View>

          {pieData.length > 0 ? (
            <View style={{ alignItems: 'center', width: '100%' }}>
              <View style={styles.chartContainer}>
                <View
                  style={[
                    styles.chartWrapper,
                    {
                      width: chartDimensions.width,
                      height: chartDimensions.height,
                      alignSelf: 'center',
                    },
                  ]}
                >
                  <PieChart
                    data={pieData}
                    width={chartDimensions.width}
                    height={chartDimensions.height}
                    chartConfig={{
                      backgroundColor: 'transparent',
                      backgroundGradientFrom: 'transparent',
                      backgroundGradientTo: 'transparent',
                      color: () => TEXT_DARK,
                    }}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft="50"
                    absolute
                    hasLegend={false}
                  />
                </View>
              </View>

              <View style={styles.tableContainer}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 2, textAlign: 'left' }]}>
                    Item
                  </Text>
                  <Text style={styles.tableHeaderText}>Quantity</Text>
                  <Text style={styles.tableHeaderText}>%</Text>
                </View>
                {pieData.map((row, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.tableRow,
                      idx % 2 === 0 && { backgroundColor: 'rgba(0, 100, 55, 0.03)' },
                    ]}
                  >
                    <View style={styles.itemNameCell}>
                      <View style={[styles.colorIndicator, { backgroundColor: row.color }]} />
                      <Text
                        style={styles.itemNameText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {row.name}
                      </Text>
                    </View>
                    <Text style={styles.tableCellText}>{row.population}</Text>
                    <Text style={styles.tableCellText}>{row.percentage}%</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="pie-chart" size={40} color="#ccc" />
              <Text style={styles.emptyText}>No sales data available</Text>
            </View>
          )}
        </Animated.View>

        {/* Recommendations */}
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="bulb-outline" size={20} color={ACCENT_COLOR} />
            <Text style={styles.cardTitle}>Smart Recommendations</Text>
            <TouchableOpacity>
              <Feather name="filter" size={18} color={TEXT_LIGHT} />
            </TouchableOpacity>
          </View>

          {recs.length > 0 ? (
            <View style={styles.recsContainer}>
              {recs.map((r, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.recItem, i === 0 && styles.topRecItem]}
                  activeOpacity={0.8}
                >
                  <View style={styles.recIconContainer}>
                    {i === 0 ? (
                      <Ionicons name="trophy" size={20} color={ACCENT_COLOR} />
                    ) : (
                      <Ionicons name="trending-up" size={20} color={PRIMARY_COLOR} />
                    )}
                  </View>
                  <View style={styles.recContent}>
                    <Text style={styles.recTitle}>{r.item}</Text>
                    <Text style={styles.recText}>{r.recommendation}</Text>
                    <View style={styles.confidenceBar}>
                      <View
                        style={[
                          styles.confidenceFill,
                          {
                            width: `${r.confidence}%`,
                            backgroundColor: i === 0 ? ACCENT_COLOR : PRIMARY_COLOR,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.confidenceText}>{r.confidence}% confidence</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={40} color="#ccc" />
              <Text style={styles.emptyText}>No recommendations yet</Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Date Picker */}
      <DateTimePickerModal
        isVisible={pickerVisible}
        mode="date"
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
        onConfirm={onPick}
        onCancel={() => setPickerVisible(false)}
        accentColor={PRIMARY_COLOR}
        buttonTextColorIOS={PRIMARY_COLOR}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },
  header: {
    marginTop: 35,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: PRIMARY_COLOR,
    letterSpacing: 0.5,
  },
  container: {
    padding: 16,
    paddingBottom: 30,
  },
  dateCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT_DARK,
    marginLeft: 8,
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: PRIMARY_LIGHT,
    borderRadius: 12,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: CARD_BG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleTxt: {
    color: TEXT_DARK,
    fontWeight: '600',
    fontSize: 14,
  },
  toggleTxtActive: {
    color: PRIMARY_COLOR,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
  },
  dateText: {
    marginLeft: 8,
    color: TEXT_DARK,
    flex: 1,
    fontWeight: '500',
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    width: '100%',
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    alignSelf: 'center',
  },
  tableContainer: {
    width: '100%',
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: PRIMARY_LIGHT,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tableHeaderText: {
    flex: 1,
    fontWeight: '600',
    color: TEXT_DARK,
    fontSize: 14,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  itemNameCell: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  itemNameText: {
    flex: 1,
    color: TEXT_DARK,
    fontSize: 14,
  },
  tableCellText: {
    flex: 1,
    textAlign: 'center',
    color: TEXT_DARK,
    fontSize: 14,
  },
  recsContainer: {
    marginTop: 8,
  },
  recItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0, 100, 55, 0.03)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: PRIMARY_COLOR,
  },
  topRecItem: {
    borderLeftColor: ACCENT_COLOR,
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
  },
  recIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 100, 55, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recContent: {
    flex: 1,
  },
  recTitle: {
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 4,
    color: TEXT_DARK,
  },
  recText: {
    fontSize: 13,
    color: TEXT_LIGHT,
    lineHeight: 18,
    marginBottom: 8,
  },
  confidenceBar: {
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 2,
  },
  confidenceText: {
    fontSize: 11,
    color: TEXT_LIGHT,
    fontWeight: '500',
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.03)',
    marginVertical: 12,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: TEXT_LIGHT,
  },
});
