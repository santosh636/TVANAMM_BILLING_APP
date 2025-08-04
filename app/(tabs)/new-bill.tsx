// frontend/app/(tabs)/new-bill.tsx

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Modal,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import {
  BluetoothEscposPrinter,
  BluetoothManager,
} from 'react-native-bluetooth-escpos-printer';
import { databaseService, MenuItem } from '../../services/DatabaseService';

// Stub out if native module is null
const BluetoothManagerSafe = BluetoothManager ?? {
  enableBluetooth: async () => {},
  scanDevices: async () => JSON.stringify({ paired: '[]' }),
  connect: async () => {},
  EVENT_CONNECTED: 'EVENT_CONNECTED',
};
const BluetoothEscposPrinterSafe = BluetoothEscposPrinter ?? {
  printerInit: async () => {},
  printText: async () => {},
};

const PADDING = 16;
const SPACING = 12;
const HEADER_TOP_MARGIN = Platform.select({ ios: 50, android: 25, default: 30 });
const INPUT_HEIGHT = 48;

export interface BillItem extends MenuItem {
  qty: number;
}

type PaymentMethod = 'Cash' | 'UPI';

export default function NewBillScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isPortrait = height > width;

  const [printerConnected, setPrinterConnected] = useState(false);
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

  useEffect(() => {
    async function initBluetooth() {
      try {
        if (Platform.OS === 'android') {
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]);
        }
        await BluetoothManagerSafe.enableBluetooth();
        const res = await BluetoothManagerSafe.scanDevices();
        const paired = JSON.parse(res.paired || '[]');
        const atpos = paired.find((d: any) =>
          d.name?.toLowerCase().includes('atpos')
        );
        if (!atpos) {
          Alert.alert('Printer Not Found', 'Pair your ATPOS printer first.');
          return;
        }
        await BluetoothManagerSafe.connect(atpos.address);
        await BluetoothEscposPrinterSafe.printerInit();
        setPrinterConnected(true);
      } catch {
        Alert.alert('Bluetooth Error', 'Could not connect to printer.');
      }
    }
    initBluetooth();
  }, []);

  const fetchMenuItems = useCallback(async () => {
    setRefreshing(true);
    try {
      await databaseService.getFranchiseId();
      const items = await databaseService.getMenuItems();
      setMenuItems(items);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        router.replace('/dashboard');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [router])
  );

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
      Alert.alert('Info', 'Add at least one item.');
      return;
    }
    setPreviewItems(billItems);
    setPreviewTotal(total);
    setShowBillModal(true);
    setBillItems([]);
    setPaymentMethod('Cash');
  };

  const finalizeBill = async () => {
    try {
      await databaseService.createGeneratedBill(
        previewTotal,
        previewItems.map(b => ({
          menu_item_id: b.id,
          item_name: b.name,
          qty: b.qty,
          price: b.price * b.qty,
          franchise_id: b.franchise_id,
        })),
        paymentMethod
      );
      setShowBillModal(false);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
  };

  const handlePrint = async () => {
    if (!printerConnected) {
      Alert.alert('Printer Not Connected');
      return;
    }
    setIsPrinting(true);
    try {
      let receipt = `         T VANAMM\n\n${new Date().toLocaleString()}\n\n`;
      receipt += `ITEM          QTY  AMOUNT\n------------------------\n`;
      previewItems.forEach(item => {
        const name = item.name.length > 16
          ? item.name.slice(0, 13) + '...'
          : item.name;
        receipt +=
          name.padEnd(16) +
          item.qty.toString().padStart(3) +
          '  ₹' +
          (item.price * item.qty).toFixed(2).padStart(7) +
          '\n';
      });
      receipt += `------------------------\nTOTAL:       ₹${previewTotal.toFixed(2).padStart(7)}\n`;
      receipt += `PAYMENT:     ${paymentMethod.padStart(7)}\n\nThank you!\n\n\n`;

      await BluetoothEscposPrinterSafe.printText(receipt, {
        encoding: 'GBK', codepage: 0, widthtimes: 1, heigthtimes: 1
      });
    } catch {
      Alert.alert('Print Error');
    } finally {
      setIsPrinting(false);
      setShowBillModal(false);
    }
  };

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
  const sections = Object.entries(byCat).map(([title, data]) => ({ title, data }));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { marginTop: HEADER_TOP_MARGIN }]}>
        <TouchableOpacity onPress={() => router.replace('/dashboard')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>NEW BILL</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={{ padding: 8, color: printerConnected ? 'green' : 'red' }}>
        Printer: {printerConnected ? '● Connected' : '● Not connected'}
      </Text>
      <View style={[styles.contentRow, isPortrait && styles.contentColumn]}>
        {/* …your menu & billing columns here… */}
      </View>
      <Modal visible={showBillModal} transparent animationType="slide" onRequestClose={() => setShowBillModal(false)}>
        {/* …your modal content here… */}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: PADDING, backgroundColor: 'rgb(0,100,55)' },
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
  categoryContainer: { flexDirection: 'row', paddingHorizontal: PADDING },
  categoryButton: {
    backgroundColor: '#e8f4f0',
    borderRadius: SPACING * 2,
    paddingHorizontal: PADDING,
    paddingVertical: SPACING / 2,
    marginRight: SPACING,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
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
  menuItemPrice: { fontSize: 18, color: 'rgb(0,100,55)', fontWeight: '600' },  // ← comma added here
  billColumn: { flex: 1, backgroundColor: '#f9f9f9', padding: PADDING },
  billHeading: { fontSize: 22, fontWeight: '700', color: 'rgb(0,100,55)', marginBottom: SPACING },
  billItemsSection: { flex: 1 },
  billItemsContainer: { paddingBottom: SPACING },
  billItemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING },
  billItemText: { flex: 2, fontSize: 16, color: '#333' },
  qtyControls: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  qtyButton: { backgroundColor: 'rgb(0,100,55)', borderRadius: SPACING, padding: 6, marginHorizontal: 6 },
  qtyText: { fontSize: 16, minWidth: 24, textAlign: 'center' },
  removeButton: { marginHorizontal: SPACING / 2 },
  billItemPrice: { flex: 1, textAlign: 'right', fontSize: 16, fontWeight: '600', color: 'rgb(0,100,55)' },
  emptyBill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyBillText: { marginTop: SPACING, fontSize: 16, color: '#666' },
  billTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: SPACING },
  billTotalLabel: { fontSize: 18, fontWeight: '700' },
  billTotalAmount: { fontSize: 18, fontWeight: '700', color: 'rgb(0,100,55)' },
  generateButton: { backgroundColor: 'rgb(0,100,55)', padding: SPACING, borderRadius: SPACING, alignItems: 'center' },
  generateButtonDisabled: { backgroundColor: '#ccc' },
  generateButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,100,55,0.2)' },
  modalContent: { backgroundColor: '#fff', padding: PADDING, borderRadius: SPACING },
  modalTitle: { fontSize: 18, fontWeight: '700', color: 'rgb(0,100,55)', marginBottom: SPACING / 2, textAlign: 'center' },
  modalSubtitle: { fontSize: 14, color: '#666', marginBottom: SPACING, textAlign: 'center' },
  billHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgb(0,100,55)',
    paddingBottom: SPACING / 2,
    marginBottom: SPACING,
  },
  billHeaderText: { flex: 1, fontWeight: '700', color: 'rgb(0,100,55)' },
  billItemsList: { paddingBottom: SPACING },
  paymentToggleContainer: { marginTop: SPACING, marginBottom: SPACING },
  paymentMethodLabel: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: SPACING / 2 },
  paymentButton: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 8,
    borderRadius: SPACING / 2,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    height: 40,
  },
  paymentButtonSelected: { backgroundColor: 'rgb(0,100,55)' },
  paymentText: { color: '#333', fontWeight: '600' },
  paymentTextSelected: { color: '#fff' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING },
  modalButton: { flex: 1, padding: SPACING, borderRadius: SPACING, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  printButton: { backgroundColor: '#333', marginRight: SPACING / 2 },
  doneButton: { backgroundColor: 'rgb(0,100,55)', marginLeft: SPACING / 2 },
  modalButtonText: { color: '#fff', marginLeft: SPACING / 2, fontWeight: '600' },
});
