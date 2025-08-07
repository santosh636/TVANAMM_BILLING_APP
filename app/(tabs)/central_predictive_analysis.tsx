import { MaterialIcons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
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
} from 'react-native'
import { PieChart } from 'react-native-chart-kit'
import DateTimePickerModal from 'react-native-modal-datetime-picker'
import type { FullBillRow, ItemTotal } from '../../services/DatabaseService'
import { databaseService } from '../../services/DatabaseService'

// Constants
const CM_TO_PX = 37.8
const TOP_BOTTOM_GAP = CM_TO_PX
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const PADDING = 16
const CHART_SIZE = Math.min(SCREEN_WIDTH - PADDING * 2, SCREEN_HEIGHT * 0.35)

// Types
interface EnhancedItemTotal extends ItemTotal {
  totalPrice: number
  dayOfWeek: number
  isWeekend: boolean
  timeOfDay: 'morning' | 'afternoon' | 'evening'
}
interface Recommendation {
  item: string
  recommendation: string
  confidence: number
}

// Recommendation Strategies
const recommendationStrategies = {
  trendingItems: (data: EnhancedItemTotal[]) => {
    const sorted = [...data].sort((a, b) => b.totalQty - a.totalQty)
    return sorted.slice(0, 3).map(item => ({
      item: item.item_name,
      recommendation: `Sales of ${item.item_name} are rising—consider restocking soon.`,
      confidence: Math.min(
        100,
        Math.round((item.totalQty / (sorted[0]?.totalQty || 1)) * 100)
      ),
    }))
  },
  weekendItems: (data: EnhancedItemTotal[]) => {
    const weekend = data.filter(i => i.isWeekend)
    const sorted = [...weekend].sort((a, b) => b.totalQty - a.totalQty)
    return sorted.slice(0, 2).map(item => ({
      item: item.item_name,
      recommendation: `${item.item_name} sells well on weekends—feature it in weekend specials.`,
      confidence: 75,
    }))
  },
  timeBased: (data: EnhancedItemTotal[]) => {
    const morning = data.filter(i => i.timeOfDay === 'morning')
    if (!morning.length) return []
    const top = [...morning].sort((a, b) => b.totalQty - a.totalQty)[0]
    return [
      {
        item: top.item_name,
        recommendation: `Highlight ${top.item_name} in breakfast combos for morning customers.`,
        confidence: 65,
      },
    ]
  },
  lowStockPotential: (data: EnhancedItemTotal[]) => {
    const avg = data.reduce((sum, x) => sum + x.totalQty, 0) / data.length
    const low = data.filter(i => i.totalQty < avg * 0.7)
    const sorted = [...low].sort((a, b) => b.totalPrice - a.totalPrice)
    return sorted.slice(0, 2).map(item => ({
      item: item.item_name,
      recommendation: `${item.item_name} has high revenue potential—consider promotional pricing.`,
      confidence: 60,
    }))
  },
}

// Helpers
const generateDistinctColors = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => {
    const hue = Math.round((i * 360) / count)
    return `hsl(${hue}, 70%, 50%)`
  })

const enhanceItemData = (items: ItemTotal[]): EnhancedItemTotal[] =>
  items.map(item => {
    const date = new Date(item.date)
    const hours = date.getHours()
    return {
      ...item,
      date,
      totalPrice: item.unitPrice * item.totalQty,
      dayOfWeek: date.getDay(),
      isWeekend: [0, 6].includes(date.getDay()),
      timeOfDay: hours < 11 ? 'morning' : hours < 16 ? 'afternoon' : 'evening',
    }
  })

const getRecommendations = (data: EnhancedItemTotal[]): Recommendation[] => {
  const allRecs = [
    ...recommendationStrategies.trendingItems(data),
    ...recommendationStrategies.weekendItems(data),
    ...recommendationStrategies.timeBased(data),
    ...recommendationStrategies.lowStockPotential(data),
  ]
  const unique = new Map<string, Recommendation>()
  allRecs.forEach(r => {
    if (!unique.has(r.item)) unique.set(r.item, r)
  })
  return Array.from(unique.values()).sort((a, b) => b.confidence - a.confidence)
}

export default function PredictiveAnalysisScreen() {
  const router = useRouter()
  const today = new Date()
  const [mode, setMode] = useState<'range' | 'single'>('range')
  const [start, setStart] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [end, setEnd] = useState<Date | null>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerStage, setPickerStage] = useState<'start' | 'end' | 'single'>('single')
  const [pieData, setPieData] = useState<any[]>([])
  const [recs, setRecs] = useState<Recommendation[]>([])

  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        router.replace('/(tabs)/central_dashboard')
        return true
      }
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack)
      return () => sub.remove()
    }, [router])
  )

  const openPicker = (stage: 'start' | 'end' | 'single') => {
    setPickerStage(stage)
    setPickerVisible(true)
  }

  const onPick = (d: Date) => {
    setPickerVisible(false)
    const normalizedDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    
    if (pickerStage === 'single') {
      setStart(normalizedDate)
      setEnd(null)
    } else if (pickerStage === 'start') {
      setStart(normalizedDate)
      // Automatically open end date picker after selecting start date
      setTimeout(() => openPicker('end'), 50)
    } else {
      // Ensure end date is not before start date
      if (normalizedDate < start) {
        Alert.alert('Invalid Date', 'End date cannot be before start date')
        setTimeout(() => openPicker('end'), 50)
        return
      }
      setEnd(normalizedDate)
    }
  }

  // Web-specific date input handler
  const handleWebDateChange = (e: React.ChangeEvent<HTMLInputElement>, stage: 'start' | 'end' | 'single') => {
    const date = new Date(e.target.value)
    if (isNaN(date.getTime())) return
    
    if (stage === 'single') {
      setStart(date)
      setEnd(null)
    } else if (stage === 'start') {
      setStart(date)
    } else {
      if (date < start) {
        Alert.alert('Invalid Date', 'End date cannot be before start date')
        return
      }
      setEnd(date)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const s = new Date(start)
        s.setHours(0, 0, 0, 0)
        
        const base = mode === 'single' ? start : end || start
        const e = new Date(base)
        e.setHours(23, 59, 59, 999)
        
        const sIso = s.toISOString()
        const eIso = e.toISOString()

        const all: FullBillRow[] = await databaseService.getAllBillingData()
        const bills = all.filter(b => b.created_at >= sIso && b.created_at <= eIso)
        const raw = bills.flatMap(b =>
          b.items.map(i => ({
            date: b.created_at,
            item_name: i.item_name || '',
            totalQty: i.qty,
            unitPrice: i.price,
          }))
        )
        const enhanced = enhanceItemData(raw)

        const byName: Record<string, EnhancedItemTotal> = {}
        enhanced.forEach(it => {
          if (!byName[it.item_name]) byName[it.item_name] = { ...it }
          else {
            byName[it.item_name].totalQty += it.totalQty
            byName[it.item_name].totalPrice += it.totalPrice
          }
        })
        const aggregated = Object.values(byName)

        const sortedAgg = aggregated.sort((a, b) => b.totalQty - a.totalQty)
        const total = sortedAgg.reduce((sum, it) => sum + it.totalQty, 0) || 1
        const sliceColors = generateDistinctColors(sortedAgg.length)
        const chartData = sortedAgg.map((it, i) => ({
          name: it.item_name,
          population: it.totalQty,
          percentage: ((it.totalQty / total) * 100).toFixed(1),
          color: sliceColors[i],
          legendFontColor: '#333',
          legendFontSize: 12,
        }))
        setPieData(chartData)
        setRecs(getRecommendations(sortedAgg))
      } catch (err: any) {
        Alert.alert('Error', err.message)
      }
    }
    load()
  }, [start, end, mode])

  const fmtDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const renderDateDisplay = () => {
    if (mode === 'single') {
      return fmtDate(start)
    }
    return `${fmtDate(start)} → ${end ? fmtDate(end) : '...'}`
  }

  const renderDateInputs = () => {
    if (Platform.OS === 'web') {
      return (
        <View style={s.webDateInputsContainer}>
          {mode === 'range' ? (
            <>
              <View style={s.webDateInputWrapper}>
                <Text style={s.webDateLabel}>Start Date</Text>
                <input
                  type="date"
                  value={start.toISOString().split('T')[0]}
                  onChange={(e) => handleWebDateChange(e, 'start')}
                  style={s.webDateInput}
                  max={end ? end.toISOString().split('T')[0] : undefined}
                />
              </View>
              <View style={s.webDateInputWrapper}>
                <Text style={s.webDateLabel}>End Date</Text>
                <input
                  type="date"
                  value={end ? end.toISOString().split('T')[0] : ''}
                  onChange={(e) => handleWebDateChange(e, 'end')}
                  style={s.webDateInput}
                  min={start.toISOString().split('T')[0]}
                />
              </View>
            </>
          ) : (
            <View style={s.webDateInputWrapper}>
              <Text style={s.webDateLabel}>Date</Text>
              <input
                type="date"
                value={start.toISOString().split('T')[0]}
                onChange={(e) => handleWebDateChange(e, 'single')}
                style={s.webDateInput}
              />
            </View>
          )}
        </View>
      )
    }

    // Mobile/native date picker
    return (
      <TouchableOpacity 
        style={s.dateInput} 
        onPress={() => openPicker(mode === 'single' ? 'single' : 'start')}
      >
        <MaterialIcons name="date-range" size={20} color="#006400" />
        <Text style={s.dateText}>{renderDateDisplay()}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={s.safeArea}>
      {/* Header with back button and title aligned */}
      <View style={[s.header, { 
        paddingTop: TOP_BOTTOM_GAP, 
        paddingBottom: TOP_BOTTOM_GAP,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: PADDING
      }]}>
        <TouchableOpacity 
          style={s.backButton}
          onPress={() => router.replace('/(tabs)/central_dashboard')}
        >
          <MaterialIcons name="arrow-back" size={24} color="#006400" />
        </TouchableOpacity>
        <Text style={s.title}>Predictive Analysis</Text>
      </View>
      
      <ScrollView contentContainerStyle={s.scrollContainer}>
        {/* Date Controls */}
        <View style={s.controlsSection}>
          <View style={s.row}>
            <TouchableOpacity
              style={[s.toggleBtn, mode === 'range' && s.toggleBtnActive]}
              onPress={() => { setMode('range'); setEnd(null) }}
            >
              <Text style={[s.toggleTxt, mode === 'range' && s.toggleTxtActive]}>Date Range</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, mode === 'single' && s.toggleBtnActive]}
              onPress={() => { setMode('single'); setEnd(null) }}
            >
              <Text style={[s.toggleTxt, mode === 'single' && s.toggleTxtActive]}>Single Day</Text>
            </TouchableOpacity>
          </View>
          
          {renderDateInputs()}
          
          <DateTimePickerModal
            isVisible={pickerVisible}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onConfirm={onPick}
            onCancel={() => setPickerVisible(false)}
            minimumDate={pickerStage === 'end' ? start : undefined}
          />
        </View>

        {/* Sales Composition */}
        <View style={s.section}>
          <Text style={s.subheader}>Sales Composition</Text>
          {pieData.length > 0 ? (
            <View style={s.chartCard}>
              <PieChart
                data={pieData}
                width={CHART_SIZE}
                height={220}
                chartConfig={{
                  backgroundColor: 'transparent',
                  backgroundGradientFrom: 'transparent',
                  backgroundGradientTo: 'transparent',
                  color: () => '#000',
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute
                hasLegend={false}
                center={[CHART_SIZE / 4, 0]}
              />
              <View style={s.tableContainer}>
                <View style={s.tableHeader}>
                  <Text style={[s.tableHeaderText, { flex: 2 }]}>Item</Text>
                  <Text style={[s.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Qty</Text>
                  <Text style={[s.tableHeaderText, { flex: 1, textAlign: 'right' }]}>%</Text>
                </View>
                {pieData.map((row, i) => (
                  <View key={i} style={s.tableRow}>
                    <View style={[s.tableCell, { flex: 2, flexDirection: 'row', alignItems: 'center' }]}>
                      <View style={[s.colorIndicator, { backgroundColor: row.color }]} />
                      <Text style={s.tableCellText} numberOfLines={1}>{row.name}</Text>
                    </View>
                    <Text style={[s.tableCellText, { flex: 1, textAlign: 'right' }]}>{row.population}</Text>
                    <Text style={[s.tableCellText, { flex: 1, textAlign: 'right' }]}>{row.percentage}%</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={s.emptyState}>
              <MaterialIcons name="pie-chart" size={40} color="#ccc" />
              <Text style={s.emptyText}>No sales data available</Text>
            </View>
          )}
        </View>

        {/* Recommendations */}
        <View style={s.section}>
          <Text style={s.subheader}>Recommendations</Text>
          {recs.length > 0 ? recs.map((r, i) => (
            <View key={i} style={[s.recItem, i === 0 && s.topRecItem]}>
              <MaterialIcons
                name={i === 0 ? 'star' : 'lightbulb-outline'}
                size={22}
                color={i === 0 ? '#FFD700' : '#006400'}
                style={s.recIconContainer}
              />
              <View style={s.recContent}>
                <Text style={s.recItemName}>{r.item}</Text>
                <Text style={s.recText}>{r.recommendation}</Text>
              </View>
            </View>
          )) : (
            <View style={s.emptyState}>
              <MaterialIcons name="lightbulb" size={40} color="#ccc" />
              <Text style={s.emptyText}>No recommendations yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  scrollContainer: { paddingBottom: 20 },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f8faf8',
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#006400',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 24,
  },
  controlsSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  section: { paddingHorizontal: 16, marginTop: 16 },
  row: { flexDirection: 'row', marginBottom: 12, justifyContent: 'space-between' },
  toggleBtn: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#006400',
    borderRadius: 8,
    marginRight: 6,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: '#006400' },
  toggleTxt: { textAlign: 'center', color: '#006400', fontWeight: '600', fontSize: 14 },
  toggleTxtActive: { color: '#fff' },
  dateInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  dateText: { marginLeft: 8, color: '#333', fontWeight: '500', fontSize: 14 },
  subheader: { fontSize: 18, fontWeight: '700', color: '#2c3e50', marginBottom: 12 },
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
  tableHeaderText: { fontWeight: '700', color: '#2c3e50', fontSize: 14 },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  tableCell: { paddingHorizontal: 4 },
  tableCellText: { color: '#444', fontSize: 13 },
  colorIndicator: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  recItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    backgroundColor: '#f8fff8',
    borderRadius: 10,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  topRecItem: { borderLeftColor: '#FFD700', backgroundColor: '#f8fcf0' },
  recIconContainer: { marginRight: 10 },
  recContent: { flex: 1 },
  recItemName: { fontSize: 15, fontWeight: '700', color: '#006400', marginBottom: 4 },
  recText: { fontSize: 13, color: '#444', lineHeight: 18 },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    marginTop: 10,
  },
  emptyText: { marginTop: 10, color: '#888', fontSize: 14, textAlign: 'center' },
  webDateInputsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  webDateInputWrapper: {
    flex: 1,
  },
  webDateLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  webDateInput: {
    width: '100%',
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
})
