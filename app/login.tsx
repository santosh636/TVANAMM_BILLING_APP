// LoginScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { databaseService } from '../services/DatabaseService';
import { supabase } from '../services/SupabaseClient';

const PRIMARY_COLOR = '#006437';
const LIGHT_ACCENT = '#e6f2ed';

export default function LoginScreen() {
  const router = useRouter();
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));

  useEffect(() => {
    ScreenOrientation.unlockAsync();

    const dimensionHandler = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });

    return () => {
      dimensionHandler.remove();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    };
  }, []);

  const [userType, setUserType] = useState<'store' | 'admin'>('store');
  const [storeId, setStoreId] = useState('');
  const [franchiseId, setFranchiseId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isLandscape = dimensions.width > dimensions.height;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.rpc('ping');
      if (error) throw error;
      console.log('✅ Supabase is online');
    } catch (err) {
      console.error('❌ Supabase refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      let loginEmail: string;

      if (userType === 'store') {
        if (!storeId.trim() || !password) {
          throw new Error('Store ID & password required');
        }
        const raw = storeId.trim().toUpperCase();
        const frId = raw.startsWith('FR-') ? raw : `FR-${raw}`;
        loginEmail = `store.${frId.toLowerCase()}@yourdomain.com`;

        const { error: loginError } =
          await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (loginError) throw new Error('Invalid login credentials');

        router.replace('/(tabs)/dashboard');
        return;
      }

      if (!franchiseId.trim() || !email.trim() || !password) {
        throw new Error('Franchise ID, Email & password required');
      }
      const raw = franchiseId.trim().toUpperCase();
      const frId = raw.startsWith('FR-') ? raw : `FR-${raw}`;
      const [local, domain] = email.trim().split('@');
      if (!local || !domain) throw new Error('Invalid email format');
      loginEmail = `${local}+${frId}@${domain}`;

      const { error: loginError } =
        await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (loginError) throw new Error('Invalid login credentials');

      const { franchise_id, dashboardRoute } = await databaseService.getFranchiseId();
      console.log(
        'DEBUG admin login → franchise_id:',
        franchise_id,
        'route:',
        dashboardRoute
      );

      if (dashboardRoute === '/(tabs)/central_dashboard') {
        router.replace('/(tabs)/central_dashboard');
      } else {
        router.replace('/(tabs)/admin-dashboard-billing');
      }
    } catch (err: any) {
      console.error('Login Error:', err);
      Alert.alert('Login Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? (isLandscape ? 0 : 60) : 0}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isLandscape && styles.landscapeScrollContent]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[PRIMARY_COLOR]}
            tintColor={PRIMARY_COLOR}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, isLandscape && styles.landscapeHeader]}>
          <Image
            source={require('../assets/images/t-vanamm-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
            onLayout={() => {}}
          />
          <Text style={styles.title}>T VANAMM BILLING</Text>
        </View>

        <View style={[styles.card, isLandscape && styles.landscapeCard]}>
          <View style={styles.toggleContainer}>
            <Pressable
              style={[styles.toggleButton, userType === 'store' && styles.activeToggle]}
              onPress={() => setUserType('store')}
            >
              <Text
                style={[styles.toggleText, userType === 'store' && styles.activeToggleText]}
              >
                Store Login
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, userType === 'admin' && styles.activeToggle]}
              onPress={() => setUserType('admin')}
            >
              <Text
                style={[styles.toggleText, userType === 'admin' && styles.activeToggleText]}
              >
                Admin Login
              </Text>
            </Pressable>
          </View>

          <View style={styles.inputContainer}>
            {userType === 'store' ? (
              <>
                <Text style={styles.inputLabel}>Store ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your Store ID"
                  placeholderTextColor="#888"
                  value={storeId}
                  onChangeText={setStoreId}
                  autoCapitalize="characters"
                />
              </>
            ) : (
              <>
                <Text style={styles.inputLabel}>Franchise ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter Franchise ID"
                  placeholderTextColor="#888"
                  value={franchiseId}
                  onChangeText={setFranchiseId}
                  autoCapitalize="characters"
                />
                <Text style={[styles.inputLabel, { marginTop: 20 }]}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your Email"
                  placeholderTextColor="#888"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </>
            )}

            <Text style={[styles.inputLabel, { marginTop: 20 }]}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Enter Password"
                placeholderTextColor="#888"
                secureTextEntry={!passwordVisible}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setPasswordVisible(!passwordVisible)}
              >
                <Ionicons
                  name={passwordVisible ? 'eye-off' : 'eye'}
                  size={20}
                  color="#777"
                />
              </TouchableOpacity>
            </View>
          </View>

          <Pressable
            style={[styles.loginButton, loading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8FAFC', 
    paddingHorizontal: 24 
  },
  scrollContent: {
    flexGrow: 1,
  },
  landscapeScrollContent: {
    paddingTop: 20,
  },
  header: { 
    alignItems: 'center', 
    paddingTop: 100, 
    paddingBottom: 30 
  },
  landscapeHeader: {
    paddingTop: 40,
    paddingBottom: 20,
  },
  logoImage: { 
    width: 150, 
    height: 80, 
    marginBottom: 16 
  },
  title: { 
    fontSize: 24, 
    fontWeight: '700', 
    color: PRIMARY_COLOR, 
    letterSpacing: 0.5 
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  landscapeCard: {
    marginHorizontal: '10%',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: LIGHT_ACCENT,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  toggleButton: { 
    flex: 1, 
    paddingVertical: 12, 
    borderRadius: 8, 
    alignItems: 'center' 
  },
  activeToggle: {
    backgroundColor: 'white',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  toggleText: { 
    fontSize: 15, 
    fontWeight: '500', 
    color: '#5c5c5c' 
  },
  activeToggleText: { 
    color: PRIMARY_COLOR, 
    fontWeight: '700' 
  },
  inputContainer: { 
    marginBottom: 24 
  },
  inputLabel: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#404040', 
    marginBottom: 8 
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 16,
    fontSize: 16,
    color: '#333',
  },
  passwordContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    position: 'relative' 
  },
  eyeIcon: { 
    position: 'absolute', 
    right: 16 
  },
  loginButton: {
    backgroundColor: PRIMARY_COLOR,
    padding: 16,
    borderRadius: 10,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  disabledButton: { 
    opacity: 0.7 
  },
  loginButtonText: { 
    color: 'white', 
    fontSize: 16, 
    fontWeight: '700', 
    letterSpacing: 0.5 
  },
  footer: { 
    paddingBottom: 30, 
    alignItems: 'center' 
  },
});
