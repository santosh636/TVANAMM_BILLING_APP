import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';

import { databaseService, MenuItem } from '../../services/DatabaseService';

const PADDING = 16;
const SPACING = 12;
const HEADER_TOP_MARGIN = Platform.select({ ios: 50, android: 25, default: 30 });
const INPUT_HEIGHT = 48;

export interface BillItem extends MenuItem {
  qty: number;
}

type PaymentMethod = 'Cash' | 'UPI';

interface SectionData {
  title: string;
  data: MenuItem[];
}

export default function NewBillScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isPortrait = height > width;

  // Bill state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showBillModal, setShowBillModal] = useState(false);
  const [previewItems, setPreviewItems] = useState<BillItem[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [isPrinting, setIsPrinting] = useState(false);

  // Fetch menu items
  const fetchMenuItems = useCallback(async () => {
    setRefreshing(true);
    try {
      await databaseService.getFranchiseId();
      const items = await databaseService.getMenuItems();
      setMenuItems(items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch menu items';
      Alert.alert('Error', msg);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);

  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        router.replace('/(tabs)/dashboard');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [router])
  );

  // Bill operations
  const addToBill = (item: MenuItem) => {
    setBillItems(prev => {
      const found = prev.find(b => b.id === item.id);
      if (found) {
        return prev.map(b =>
          b.id === item.id ? { ...b, qty: b.qty + 1 } : b
        );
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (id: number, delta: number) =>
    setBillItems(prev =>
      prev.map(b => (b.id === id ? { ...b, qty: Math.max(1, b.qty + delta) } : b))
    );

  const removeItem = (id: number) =>
    setBillItems(prev => prev.filter(b => b.id !== id));

  const total = billItems.reduce((sum, b) => sum + b.price * b.qty, 0);

  const generateBill = () => {
    if (!billItems.length) {
      Alert.alert('Info', 'Add at least one item to generate bill.');
      return;
    }
    setPreviewItems([...billItems]);
    setPreviewTotal(total);
    setShowBillModal(true);
    setBillItems([]);
    setPaymentMethod('Cash');
  };

  const handlePaymentMethodSelect = async (method: PaymentMethod) => {
    setPaymentMethod(method);
    setIsPrinting(true);

    try {
      // Save to database first
      const itemsToInsert = previewItems.map(b => ({
        menu_item_id: b.id,
        item_name: b.name,
        qty: b.qty,
        price: b.price * b.qty,
        franchise_id: b.franchise_id,
      }));

      await databaseService.createGeneratedBill(
        previewTotal,
        itemsToInsert,
        method
      );

      // Build receipt text
      const receipt = buildReceiptText(previewItems, previewTotal, method);

      // Primary: RAWBT URL scheme
      const rawbtUrl = `rawbt:${encodeURIComponent(receipt)}`;
      try {
        await Linking.openURL(rawbtUrl);
      } catch {
        // Fallback: Android intent URI
        const intentUrl =
          `intent:#Intent;action=ru.a402d.rawbt.ACTION_SEND;` +
          `package=ru.a402d.rawbtprinter;` +
          `S.text=${encodeURIComponent(receipt)};end`;
        await Linking.openURL(intentUrl);
      }
    } catch (e) {
      console.error('Printing error:', e);
      Alert.alert(
        'Printing Error',
        'Failed to print receipt. Please ensure:\n' +
        '1. RAWBT is installed\n' +
        '2. Printer is paired & powered on'
      );
    } finally {
      setIsPrinting(false);
      setShowBillModal(false);
    }
  };

  // Receipt builder
  function buildReceiptText(items: BillItem[], totalAmt: number, method: PaymentMethod) {
    const lineWidth = 32;
    const center = (t: string) => {
      if (t.length >= lineWidth) return t;
      const pad = Math.floor((lineWidth - t.length) / 2);
      return ' '.repeat(pad) + t + ' '.repeat(lineWidth - t.length - pad);
    };

    let txt = '';
    txt += center('T VANAMM') + '\n';
    txt += center(new Date().toLocaleString()) + '\n\n';
    txt += 'ITEM          QTY  AMOUNT\n';
    txt += '------------------------\n';
    items.forEach(i => {
      const name = i.name.length > 16 ? i.name.slice(0, 13) + '...' : i.name;
      txt += name.padEnd(16) +
             i.qty.toString().padStart(3) +
             '  ₹' + (i.price * i.qty).toFixed(2).padStart(7) +
             '\n';
    });
    txt += '------------------------\n';
    txt += `TOTAL:       ₹${totalAmt.toFixed(2).padStart(7)}\n`;
    txt += `PAYMENT:     ${method.padStart(7)}\n\n`;
    txt += center('Thank you visit again!') + '\n\n\n';
    return txt;
  }

  const categories = ['All', ...new Set(menuItems.map(i => i.category))];
  const filtered = menuItems.filter(
    it =>
      (selectedCategory === 'All' || it.category === selectedCategory) &&
      it.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const byCat = filtered.reduce((acc, it) => {
    (acc[it.category] ||= []).push(it);
    return acc;
  }, {} as Record<string, MenuItem[]>);
  const sections: SectionData[] = Object.entries(byCat).map(([title, data]) => ({
    title,
    data,
  }));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { marginTop: HEADER_TOP_MARGIN }]}>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/dashboard')}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>NEW BILL</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Main layout */}
      <View style={[styles.contentRow, isPortrait && styles.contentColumn]}>
        {/* Menu side */}
        <View style={[styles.menuColumn, isPortrait && styles.menuColumnPortrait]}>
          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search menu items…"
              placeholderTextColor="#888"
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
          </View>

          {/* Categories */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryBar}
            contentContainerStyle={styles.categoryContainer}
          >
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryButton,
                  selectedCategory === cat && styles.categoryButtonSelected,
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    selectedCategory === cat && styles.categoryTextSelected,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Menu items */}
          <SectionList
            sections={sections}
            keyExtractor={item => item.id.toString()}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.menuItem} onPress={() => addToBill(item)}>
                <Text style={styles.menuItemText}>{item.name}</Text>
                <Text style={styles.menuItemPrice}>₹{item.price.toFixed(2)}</Text>
              </TouchableOpacity>
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={fetchMenuItems} colors={['rgb(0,100,55)']} />
            }
            contentContainerStyle={styles.sectionListContent}
            stickySectionHeadersEnabled
          />
        </View>

        {/* Billing side */}
        <View style={styles.billColumn}>
          <Text style={styles.billHeading}>BILLING</Text>
          {billItems.length ? (
            <ScrollView style={styles.billItemsSection} contentContainerStyle={styles.billItemsContainer}>
              {billItems.map(item => (
                <View key={item.id} style={styles.billItemRow}>
                  <Text style={styles.billItemText} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity onPress={() => updateQty(item.id, -1)} style={styles.qtyButton}>
                      <Ionicons name="remove" size={25} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.qty}</Text>
                    <TouchableOpacity onPress={() => updateQty(item.id, 1)} style={styles.qtyButton}>
                      <Ionicons name="add" size={25} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeButton}>
                    <Ionicons name="trash" size={28} color="#ff4444" />
                  </TouchableOpacity>
                  <Text style={styles.billItemPrice}>₹{(item.price * item.qty).toFixed(2)}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyBill}>
              <Ionicons name="receipt-outline" size={48} color="#ccc" />
              <Text style={styles.emptyBillText}>No items added</Text>
            </View>
          )}
          <View style={styles.billTotalRow}>
            <Text style={styles.billTotalLabel}>Total:</Text>
            <Text style={styles.billTotalAmount}>₹{total.toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.generateButton, !billItems.length && styles.generateButtonDisabled]}
            onPress={generateBill}
            disabled={!billItems.length}
          >
            <Text style={styles.generateButtonText}>Generate Bill</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal */}
      <Modal visible={showBillModal} animationType="slide" transparent onRequestClose={() => setShowBillModal(false)}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { width: width * 0.8 }]}>
            <Text style={styles.modalTitle}>Bill Preview</Text>
            <Text style={styles.modalSubtitle}>{new Date().toLocaleString()}</Text>

            <View style={styles.billHeader}>
              <Text style={[styles.billHeaderText, { flex: 2 }]}>Item</Text>
              <Text style={[styles.billHeaderText, { flex: 1, textAlign: 'center' }]}>Qty</Text>
              <Text style={[styles.billHeaderText, { flex: 1, textAlign: 'right' }]}>Amount</Text>
            </View>

            <ScrollView style={styles.billItemsList}>
              {previewItems.map((it, idx) => (
                <View key={idx} style={styles.billItemRow}>
                  <Text style={[styles.billItemText, { flex: 2 }]} numberOfLines={1}>
                    {it.name}
                  </Text>
                  <Text style={[styles.billItemText, { flex: 1, textAlign: 'center' }]}>{it.qty}</Text>
                  <Text style={[styles.billItemText, { flex: 1, textAlign: 'right' }]}>
                    ₹{(it.price * it.qty).toFixed(2)}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.billTotalRow}>
              <Text style={styles.billTotalLabel}>Total:</Text>
              <Text style={styles.billTotalAmount}>₹{previewTotal.toFixed(2)}</Text>
            </View>

            <View style={styles.paymentToggleContainer}>
              <Text style={styles.paymentMethodLabel}>Payment Method:</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                <TouchableOpacity
                  onPress={() => handlePaymentMethodSelect('Cash')}
                  style={[
                    styles.paymentButton,
                    paymentMethod === 'Cash' && styles.paymentButtonSelected,
                  ]}
                  disabled={isPrinting}
                >
                  <Text style={[styles.paymentText, paymentMethod === 'Cash' && styles.paymentTextSelected]}>
                    Cash
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePaymentMethodSelect('UPI')}
                  style={[
                    styles.paymentButton,
                    paymentMethod === 'UPI' && styles.paymentButtonSelected,
                  ]}
                  disabled={isPrinting}
                >
                  <Text style={[styles.paymentText, paymentMethod === 'UPI' && styles.paymentTextSelected]}>
                    UPI
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {isPrinting && (
              <View style={{ marginTop: SPACING, alignItems: 'center' }}>
                <Text style={{ color: 'rgb(0,100,55)' }}>Processing...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: PADDING, backgroundColor: 'rgb(0,100,55)', paddingTop: 10 },
  backButton: { padding: SPACING / 2, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: SPACING },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 22, fontWeight: '700' },
  contentRow: { flex: 1, flexDirection: 'row' },
  contentColumn: { flexDirection: 'column' },
  menuColumn: { flex: 1, borderRightWidth: 1, borderRightColor: '#eee' },
  menuColumnPortrait: { flex: 2 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    margin: PADDING,
    paddingHorizontal: PADDING,
    height: INPUT_HEIGHT,
    borderRadius: SPACING,
  },
  searchInput: { flex: 1, marginLeft: SPACING },
  categoryBar: {
    marginHorizontal: PADDING,
    marginBottom: SPACING,
    backgroundColor: '#fff',
    flexShrink: 0,
    position: 'relative',
    zIndex: 1,
  },
  categoryContainer: {
    flexDirection: 'row',
    paddingVertical: SPACING / 2,
  },
  categoryButton: {
    backgroundColor: '#e8f4f0',
    borderRadius: SPACING * 2,
    paddingHorizontal: PADDING,
    paddingVertical: SPACING / 2,
    marginRight: SPACING,
    alignItems: 'center',
    justifyContent: 'center',
    height: 70,
  },
  categoryButtonSelected: { backgroundColor: 'rgb(0,100,55)' },
  categoryText: { color: 'rgb(0,100,55)', fontWeight: '600' },
  categoryTextSelected: { color: '#fff' },
  sectionListContent: { paddingHorizontal: PADDING, paddingBottom: PADDING },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: '#333', marginVertical: SPACING / 2 },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    marginVertical: SPACING / 2,
    marginHorizontal: PADDING / 2,
    backgroundColor: '#fafafa',
    borderRadius: SPACING,
    elevation: 2,
  },
  menuItemText: { fontSize: 18, color: '#333' },
  menuItemPrice: { fontSize: 18, color: 'rgb(0,100,55)', fontWeight: '600' },
  billColumn: { flex: 1, backgroundColor: '#f9f9f9', padding: PADDING },
  billHeading: { fontSize: 22, fontWeight: '700', color: 'rgb(0,100,55)', marginBottom: SPACING },
  billItemsSection: { flex: 1 },
  billItemsContainer: { paddingBottom: PADDING },
  billItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING,
    padding: SPACING,
    backgroundColor: '#fff',
    borderRadius: SPACING,
    elevation: 1,
  },
  billItemText: { flex: 2, fontSize: 16, color: '#333' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING },
  qtyButton: { backgroundColor: 'rgb(0,100,55)', borderRadius: 20, width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: 16, marginHorizontal: SPACING, minWidth: 20, textAlign: 'center' },
  removeButton: { marginHorizontal: SPACING / 2 },
  billItemPrice: { flex: 1, textAlign: 'right', fontSize: 16, fontWeight: '600', color: 'rgb(0,100,55)' },
  emptyBill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyBillText: { marginTop: SPACING, fontSize: 16, color: '#666' },
  billTotalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING, backgroundColor: '#fff', borderRadius: SPACING, marginTop: 'auto' },
  billTotalLabel: { fontSize: 18, fontWeight: '700' },
  billTotalAmount: { fontSize: 18, fontWeight: '700', color: 'rgb(0,100,55)' },
  generateButton: { backgroundColor: 'rgb(0,100,55)', padding: SPACING, borderRadius: SPACING, alignItems: 'center', marginTop: SPACING },
  generateButtonDisabled: { backgroundColor: '#ccc' },
  generateButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#fff', padding: PADDING, borderRadius: SPACING, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: 'rgb(0,100,55)', marginBottom: SPACING / 2, textAlign: 'center' },
  modalSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: SPACING },
  billHeader: { flexDirection: 'row', paddingVertical: SPACING, borderBottomWidth: 1, borderBottomColor: '#eee' },
  billHeaderText: { fontSize: 16, fontWeight: '600', color: '#333' },
  billItemsList: { maxHeight: 200, marginVertical: SPACING },
  paymentToggleContainer: { marginVertical: SPACING, alignItems: 'center' },
  paymentMethodLabel: { fontSize: 16, fontWeight: '600', marginBottom: SPACING },
  paymentButton: { paddingVertical: SPACING, paddingHorizontal: PADDING, borderRadius: SPACING, marginHorizontal: SPACING / 2, backgroundColor: '#eee' },
  paymentButtonSelected: { backgroundColor: 'rgb(0,100,55)' },
  paymentText: { fontSize: 16, color: '#333' },
  paymentTextSelected: { color: '#fff' },
});
