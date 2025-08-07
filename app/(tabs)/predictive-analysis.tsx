// frontend/app/(tabs)/predictive-analysis.tsx

import { MaterialIcons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { PieChart } from 'react-native-chart-kit'
import DateTimePickerModal from 'react-native-modal-datetime-picker'
import type { AggregatedItemTotal } from '../../services/DatabaseService'
import { databaseService } from '../../services/DatabaseService'

// Layout constants
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const PADDING = 16
const CHART_SIZE = Math.min(SCREEN_WIDTH - PADDING * 2, SCREEN_HEIGHT * 0.35)
const CM_TO_PX = 37.8
const TOP_BOTTOM_GAP = CM_TO_PX

// Color constants
const PRIMARY_COLOR = 'rgb(0, 100, 55)'
const ACCENT_COLOR = 'rgb(255, 215, 0)'
const TEXT_DARK = 'rgb(44, 62, 80)'
const TEXT_LIGHT = 'rgb(136, 136, 136)'
const CARD_BG = '#ffffff'
const BG_COLOR = 'rgb(248, 250, 248)'

interface Recommendation {
  item: string
  recommendation: string
  confidence: number
}

// Your existing recommendation strategies…
const recommendationStrategies = {
  trendingItems: (data: AggregatedItemTotal[]) => {
    const sorted = [...data].sort((a, b) => b.totalQty - a.totalQty)
    return sorted.slice(0, 3).map(item => ({
      item: item.item_name,
      recommendation: `Boost ${item.item_name} stock—trending now!`,
      confidence: Math.min(
        100,
        Math.round((item.totalQty / (sorted[0]?.totalQty || 1)) * 100)
      ),
    }))
  },
  lowStockPotential: (data: AggregatedItemTotal[]) => {
    const avg = data.reduce((sum, x) => sum + x.totalQty, 0) / data.length
    const low = data.filter(i => i.totalQty < avg * 0.7)
    return [...low]
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 2)
      .map(item => ({
        item: item.item_name,
        recommendation: `Promote ${item.item_name}—slower sales detected`,
        confidence: 60,
      }))
  },
}

const getRecommendations = (data: AggregatedItemTotal[]): Recommendation[] => {
  const all = [
    ...recommendationStrategies.trendingItems(data),
    ...recommendationStrategies.lowStockPotential(data),
  ]
  const unique = new Map<string, Recommendation>()
  all.forEach(r => {
    if (!unique.has(r.item)) unique.set(r.item, r)
  })
  return Array.from(unique.values()).sort((a, b) => b.confidence - a.confidence)
}

const generateDistinctColors = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => {
    const hue = Math.round((i * 360) / count)
    return `hsl(${hue}, 70%, 50%)`
  })

export default function PredictiveAnalysisScreen() {
  const router = useRouter()
  const today = new Date()
  const [mode, setMode] = useState<'range' | 'single'>('range')
  const [start, setStart] = useState<Date>(today)
  const [end, setEnd] = useState<Date | null>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerStage, setPickerStage] = useState<'start' | 'end' | 'single'>(
    'single'
  )
  const [pieData, setPieData] = useState<any[]>([])
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [fadeAnim] = useState(new Animated.Value(0))
  const [scaleAnim] = useState(new Animated.Value(0.95))

  // Android hardware‐back handling
  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        router.replace('/(tabs)/admin-dashboard-billing')
        return true
      }
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack)
      return () => sub.remove()
    }, [router])
  )

  // Header animation
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
    ]).start()
  }, [])

  // Load & process data
  useEffect(() => {
    ;(async () => {
      try {
        const s = new Date(start)
        s.setHours(0, 0, 0, 0)
        const base = mode === 'single' ? start : end || start
        const e = new Date(base)
        e.setHours(23, 59, 59, 999)

        const items: AggregatedItemTotal[] =
          await databaseService.getItemTotalsForDateRange(
            s.toISOString(),
            e.toISOString()
          )

        const totalQty =
          items.reduce((sum, i) => sum + i.totalQty, 0) || 1
        const colors = generateDistinctColors(items.length)
        const chartData = items
          .map((it, i) => ({
            name: it.item_name,
            population: it.totalQty,
            percentage: ((it.totalQty / totalQty) * 100).toFixed(1),
            color: colors[i],
            legendFontColor: '#333',
            legendFontSize: 12,
          }))
          .sort((a, b) => b.population - a.population)

        setPieData(chartData)
        setRecs(getRecommendations(items))
      } catch (err: any) {
        Alert.alert('Error', err.message)
      }
    })()
  }, [start, end, mode])

  const openPicker = (stage: 'start' | 'end' | 'single') => {
    setPickerStage(stage)
    setPickerVisible(true)
  }
  const onPick = (d: Date) => {
    setPickerVisible(false)
    if (pickerStage === 'single') {
      setStart(d)
      setEnd(null)
    } else if (pickerStage === 'start') {
      setStart(d)
      setEnd(null)
      setTimeout(() => openPicker('end'), 50)
    } else {
      setEnd(d)
    }
  }

  const fmtDate = () =>
    mode === 'single'
      ? start.toLocaleDateString()
      : `${start.toLocaleDateString()} → ${
          end ? end.toLocaleDateString() : '...'
        }`

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: TOP_BOTTOM_GAP,
            paddingBottom: TOP_BOTTOM_GAP,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() =>
            router.replace('/(tabs)/admin-dashboard-billing')
          }
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={PRIMARY_COLOR}
          />
        </TouchableOpacity>
        <Text style={styles.title}>Predictive Insights</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Date Controls */}
        <View style={styles.controlsSection}>
          <View style={styles.row}>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                mode === 'range' && styles.toggleBtnActive,
              ]}
              onPress={() => {
                setMode('range')
                setEnd(null)
              }}
            >
              <Text
                style={[
                  styles.toggleTxt,
                  mode === 'range' && styles.toggleTxtActive,
                ]}
              >
                Date Range
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                mode === 'single' && styles.toggleBtnActive,
              ]}
              onPress={() => {
                setMode('single')
                setEnd(null)
              }}
            >
              <Text
                style={[
                  styles.toggleTxt,
                  mode === 'single' && styles.toggleTxtActive,
                ]}
              >
                Single Day
              </Text>
            </TouchableOpacity>
          </View>

          {Platform.OS === 'web' ? (
            <View style={styles.dateInputsRow}>
              {/* HTML inputs for web */}
              <View style={styles.dateInputContainer}>
                <Text style={styles.label}>Start</Text>
                <input
                  type="date"
                  value={start.toISOString().slice(0, 10)}
                  onChange={e => setStart(new Date(e.currentTarget.value))}
                  style={styles.webInput}
                />
              </View>
              {mode === 'range' && (
                <View style={styles.dateInputContainer}>
                  <Text style={styles.label}>End</Text>
                  <input
                    type="date"
                    min={start.toISOString().slice(0, 10)}
                    value={(end || start)
                      .toISOString()
                      .slice(0, 10)}
                    onChange={e =>
                      setEnd(new Date(e.currentTarget.value))
                    }
                    style={styles.webInput}
                  />
                </View>
              )}
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() =>
                  openPicker(mode === 'single' ? 'single' : 'start')
                }
              >
                <MaterialIcons
                  name="date-range"
                  size={20}
                  color={PRIMARY_COLOR}
                />
                <Text style={styles.dateText}>{fmtDate()}</Text>
              </TouchableOpacity>
              <DateTimePickerModal
                isVisible={pickerVisible}
                mode="date"
                display={
                  Platform.OS === 'ios' ? 'inline' : 'default'
                }
                onConfirm={onPick}
                onCancel={() => setPickerVisible(false)}
                accentColor={PRIMARY_COLOR}
                buttonTextColorIOS={PRIMARY_COLOR}
              />
            </>
          )}
        </View>

        {/* Sales Composition */}
        <View style={styles.section}>
          <Text style={styles.subheader}>Sales Composition</Text>
          {pieData.length > 0 ? (
            <View style={styles.chartCard}>
              <PieChart
                data={pieData}
                width={CHART_SIZE}
                height={220}
                chartConfig={{
                  backgroundColor: 'transparent',
                  backgroundGradientFrom: 'transparent',
                  backgroundGradientTo: 'transparent',
                  color: () => TEXT_DARK,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute
                hasLegend={false}
                center={[CHART_SIZE / 4, 0]}
              />
              <View style={styles.tableContainer}>
                <View style={styles.tableHeader}>
                  <Text
                    style={[styles.tableHeaderText, { flex: 2 }]}
                  >
                    Item
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderText,
                      { flex: 1, textAlign: 'right' },
                    ]}
                  >
                    Qty
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderText,
                      { flex: 1, textAlign: 'right' },
                    ]}
                  >
                    %
                  </Text>
                </View>
                {pieData.map((row, i) => (
                  <View key={i} style={styles.tableRow}>
                    <View
                      style={[
                        styles.tableCell,
                        {
                          flex: 2,
                          flexDirection: 'row',
                          alignItems: 'center',
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.colorIndicator,
                          { backgroundColor: row.color },
                        ]}
                      />
                      <Text
                        style={styles.tableCellText}
                        numberOfLines={1}
                      >
                        {row.name}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.tableCellText,
                        { flex: 1, textAlign: 'right' },
                      ]}
                    >
                      {row.population}
                    </Text>
                    <Text
                      style={[
                        styles.tableCellText,
                        { flex: 1, textAlign: 'right' },
                      ]}
                    >
                      {row.percentage}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons
                name="pie-chart"
                size={40}
                color="#ccc"
              />
              <Text style={styles.emptyText}>
                No sales data available
              </Text>
            </View>
          )}
        </View>

        {/* Recommendations */}
        <View style={styles.section}>
          <Text style={styles.subheader}>Recommendations</Text>
          {recs.length > 0 ? (
            recs.map((r, i) => (
              <View
                key={i}
                style={[
                  styles.recItem,
                  i === 0 && styles.topRecItem,
                ]}
              >
                <MaterialIcons
                  name={i === 0 ? 'star' : 'lightbulb-outline'}
                  size={22}
                  color={i === 0 ? ACCENT_COLOR : PRIMARY_COLOR}
                  style={styles.recIconContainer}
                />
                <View style={styles.recContent}>
                  <Text style={styles.recItemName}>{r.item}</Text>
                  <Text style={styles.recText}>
                    {r.recommendation}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons
                name="lightbulb"
                size={40}
                color="#ccc"
              />
              <Text style={styles.emptyText}>
                No recommendations yet
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG_COLOR },
  scrollContainer: { paddingBottom: 20 },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: CARD_BG,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  backButton: { position: 'absolute', left: 16, zIndex: 1 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: PRIMARY_COLOR,
    letterSpacing: 0.5,
  },
  controlsSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  row: { flexDirection: 'row', marginBottom: 12 },
  toggleBtn: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
    borderRadius: 8,
    marginRight: 6,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: PRIMARY_COLOR },
  toggleTxt: {
    color: PRIMARY_COLOR,
    fontWeight: '600',
    fontSize: 14,
  },
  toggleTxtActive: { color: '#fff' },
  dateInputsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dateInputContainer: { flex: 1, marginHorizontal: 4 },
  label: {
    marginBottom: 4,
    fontWeight: '600',
    color: TEXT_DARK,
  },
  webInput: {
    width: '100%',
    padding: 8,
    borderRadius: 6,
    borderColor: '#ccc', // React Native Web inlines this
    fontSize: 16,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  dateText: {
    marginLeft: 8,
    color: TEXT_DARK,
    fontWeight: '500',
    fontSize: 14,
  },
  section: { paddingHorizontal: 16, marginTop: 16 },
  subheader: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_DARK,
    marginBottom: 12,
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
  },
  tableContainer: { marginTop: 16 },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 8,
  },
  tableHeaderText: {
    fontWeight: '700',
    color: TEXT_DARK,
    fontSize: 14,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  tableCell: { paddingHorizontal: 4 },
  tableCellText: { color: TEXT_DARK, fontSize: 13 },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  recItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    backgroundColor: '#f8fff8',
    borderRadius: 10,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: PRIMARY_COLOR,
  },
  topRecItem: {
    borderLeftColor: ACCENT_COLOR,
    backgroundColor: '#f8fcf0',
  },
  recIconContainer: { marginRight: 10 },
  recContent: { flex: 1 },
  recItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: PRIMARY_COLOR,
    marginBottom: 4,
  },
  recText: { fontSize: 13, color: TEXT_DARK, lineHeight: 18 },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  emptyText: {
    marginTop: 10,
    color: TEXT_LIGHT,
    fontSize: 14,
    textAlign: 'center',
  },
})
