// frontend/app/(tabs)/central_menu_editor.tsx

import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { databaseService, MenuItem } from '../../services/DatabaseService';
import { supabase } from '../../services/SupabaseClient';

const PRIMARY_COLOR = '#006437';
const LIGHT_GRAY = '#f5f5f5';
const DARK_GRAY = '#333';

export default function MenuEditorScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [userFranchiseId, setUserFranchiseId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [products, setProducts] = useState<MenuItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState({ name: '', price: '', category: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        router.replace('/settings');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [router])
  );

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('franchise_id')
        .eq('id', session.user.id)
        .single();
      if (error || !profile?.franchise_id) {
        Alert.alert('Error', 'Could not load franchise info.');
      } else {
        setUserFranchiseId(profile.franchise_id);
      }
    })();
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const items = await databaseService.getMenuItems(userFranchiseId);
      setProducts(items);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to load menu items.');
    }
  }, [userFranchiseId]);

  useEffect(() => {
    if (userFranchiseId) {
      fetchProducts();
    }
  }, [userFranchiseId, fetchProducts]);

  const handleAdd = async () => {
    if (!name.trim() || !price.trim() || !category.trim()) {
      return Alert.alert('Validation', 'Please fill all fields.');
    }
    const p = parseFloat(price);
    if (isNaN(p)) {
      return Alert.alert('Validation', 'Price must be a number.');
    }
    try {
      await databaseService.addMenuItem(
        { name: name.trim(), price: p, category: category.trim(), franchise_id: userFranchiseId },
        userFranchiseId
      );
      setName('');
      setPrice('');
      setCategory('');
      setIsAdding(false);
      fetchProducts();
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not add item.');
    }
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    if (!editFields.name.trim() || !editFields.price.trim() || !editFields.category.trim()) {
      return Alert.alert('Validation', 'Please fill all fields.');
    }
    const p = parseFloat(editFields.price);
    if (isNaN(p)) {
      return Alert.alert('Validation', 'Price must be a number.');
    }
    try {
      await databaseService.updateMenuItem(
        editingId,
        { name: editFields.name.trim(), price: p, category: editFields.category.trim() },
        userFranchiseId
      );
      setEditingId(null);
      fetchProducts();
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not update item.');
    }
  };

  const deleteItem = (id: number) => {
    Alert.alert('Confirm Delete', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await databaseService.deleteMenuItem(id, userFranchiseId);
            fetchProducts();
          } catch (err) {
            console.error(err);
            Alert.alert('Error', 'Could not delete item.');
          }
        },
      },
    ]);
  };

  const openCategoryModal = () => {
    setNewCategory('');
    setCategoryModalVisible(true);
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    if (editingId !== null) {
      setEditFields(f => ({ ...f, category: newCategory.trim() }));
    } else {
      setCategory(newCategory.trim());
    }
    setCategoryModalVisible(false);
  };

  const filtered = products.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = Array.from(new Set(products.map(p => p.category)));

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={[
        styles.container,
        isTablet ? styles.fullWidth : styles.padded
      ]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/settings')} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={28} color={PRIMARY_COLOR} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Menu Editor</Text>
          <View style={{ width: 28 }} />
        </View>
        {/* Add other components here */}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    backgroundColor: LIGHT_GRAY,
    width: '100%',
  },
  padded: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  fullWidth: {
    paddingHorizontal: 0,
    paddingTop: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '600',
    color: DARK_GRAY,
    flex: 1,
    textAlign: 'center',
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    height: 56,
  },
  searchIcon: {
    marginRight: 12,
    color: '#6c757d',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: DARK_GRAY,
    fontSize: 18,
  },
  categoryContainer: {
    paddingBottom: 12,
    marginBottom: 24,
    maxHeight: 60,
  },
  categoryChip: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    elevation: 1,
  },
  categoryChipActive: {
    backgroundColor: PRIMARY_COLOR,
    borderColor: PRIMARY_COLOR,
  },
  categoryText: {
    color: '#495057',
    fontSize: 16,
    fontWeight: '500',
  },
  categoryTextActive: {
    color: 'white',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: DARK_GRAY,
    marginBottom: 20,
    marginTop: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 12,
    padding: 18,
    marginBottom: 28,
    elevation: 3,
  },
  addButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '500',
    marginLeft: 12,
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    marginBottom: 28,
    elevation: 3,
  },
  inputLabel: {
    fontSize: 18,
    color: DARK_GRAY,
    marginBottom: 10,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e9ecef',
    fontSize: 18,
  },
  categoryInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  addCategoryButton: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 10,
    padding: 12,
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  cancelButton: {
    backgroundColor: '#e9ecef',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginRight: 16,
  },
  cancelButtonText: {
    color: '#495057',
    fontWeight: '500',
    fontSize: 18,
  },
  saveButton: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 18,
  },
  itemCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemInfo: {
    flex: 1,
    marginRight: 20,
  },
  itemName: {
    fontSize: 20,
    fontWeight: '500',
    color: DARK_GRAY,
    marginBottom: 8,
  },
  itemCategory: {
    fontSize: 16,
    color: '#6c757d',
    marginBottom: 8,
  },
  itemPrice: {
    fontSize: 20,
    fontWeight: '600',
    color: PRIMARY_COLOR,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    padding: 12,
    backgroundColor: '#e9ecef',
    borderRadius: 10,
    marginRight: 12,
  },
  deleteButton: {
    padding: 12,
    backgroundColor: '#fff5f5',
    borderRadius: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    backgroundColor: 'white',
    borderRadius: 12,
    marginTop: 24,
    elevation: 2,
  },
  emptyStateText: {
    fontSize: 20,
    color: '#adb5bd',
    marginTop: 20,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 28,
    width: '60%',
    maxWidth: 500,
    minWidth: 350,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: DARK_GRAY,
    marginBottom: 24,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
  },
  modalCancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginRight: 16,
    borderRadius: 10,
    backgroundColor: '#e9ecef',
  },
  modalCancelButtonText: {
    color: DARK_GRAY,
    fontWeight: '500',
    fontSize: 18,
  },
  modalConfirmButton: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  modalConfirmButtonText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 18,
  },
  editForm: {
    flex: 1,
    width: '100%',
  },
});
