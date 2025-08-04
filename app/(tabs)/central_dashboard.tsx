// app/central-dashboard.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  BackHandler,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY_COLOR = 'rgb(0, 100, 55)';
const PRIMARY_LIGHT = 'rgba(0, 100, 55, 0.2)';
const PRIMARY_LIGHTER = 'rgba(0, 100, 55, 0.1)';
const WHITE = '#FFFFFF';
const CARD_BG = '#FFFFFF';
const TEXT_DARK = '#1A2E22';

type ValidIonicons = 'analytics' | 'trending-up' | 'bar-chart' | 'settings' | 'chevron-forward';

export default function CentralDashboard() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isLandscape = width > height;

  // Layout calculations
  const H_PAD = isTablet ? 24 : 16;
  const V_PAD = isTablet ? 24 : 16;
  const CARD_GAP = isTablet ? 20 : 16;
  const HEADER_HEIGHT = isTablet ? 80 : 60;

  // Determine layout based on device and orientation
  let cardWidth: number;
  let cardHeight: number;
  let numColumns = 1;
  let useScrollView = true;
  let gridDirection: 'row' | 'column' = 'column';
  let gridWrap: 'wrap' | 'nowrap' | undefined = 'nowrap';

  if (isTablet) {
    if (isLandscape) {
      numColumns = 2;
      cardWidth = (width - H_PAD * 2 - CARD_GAP * (numColumns - 1)) / numColumns;
      cardHeight = (height - HEADER_HEIGHT - V_PAD * 2 - CARD_GAP) / 2;
      gridDirection = 'row';
      gridWrap = 'wrap';
      useScrollView = false;
    } else {
      cardWidth = width - H_PAD * 2;
      cardHeight = cardWidth * 0.6;
      gridDirection = 'column';
      gridWrap = 'nowrap';
      useScrollView = true;
    }
  } else {
    cardWidth = width - H_PAD * 2;
    cardHeight = cardWidth * 0.6;
    gridDirection = 'column';
    gridWrap = 'nowrap';
    useScrollView = true;
  }

  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        BackHandler.exitApp();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [])
  );

  const cards = [
    { 
      icon: 'analytics' as ValidIonicons, 
      title: 'Predictive Analysis', 
      route: '/central_predictive_analysis',
    },
    { 
      icon: 'trending-up' as ValidIonicons, 
      title: 'Sales Overview', 
      route: '/central_sales_overview',
    },
    { 
      icon: 'bar-chart' as ValidIonicons, 
      title: 'Franchise Sales', 
      route: '/central_franchise_overview',
    },
    { 
      icon: 'settings' as ValidIonicons, 
      title: 'Settings', 
      route: '/central_settings',
    },
  ];

  const renderCard = (card: typeof cards[0], index: number) => (
    <TouchableOpacity
      key={index}
      style={[
        styles.card,
        {
          width: cardWidth,
          height: cardHeight,
          marginBottom: CARD_GAP,
        }
      ]}
      onPress={() => router.push(card.route as any)}
      activeOpacity={0.9}
    >
      <View style={styles.cardContent}>
        <View style={styles.iconContainer}>
          <Ionicons name={card.icon} size={isTablet ? 40 : 32} color={PRIMARY_COLOR} />
        </View>
        <Text style={styles.cardTitle}>{card.title}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardActionText}>View Details</Text>
          <Ionicons name="chevron-forward" size={20} color={PRIMARY_COLOR} />
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingHorizontal: H_PAD }]}>
      <StatusBar backgroundColor={WHITE} barStyle="dark-content" />
      
      <View style={[styles.headerContainer, { 
        height: HEADER_HEIGHT,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
      }]}>
        <Text style={styles.header} numberOfLines={1} adjustsFontSizeToFit>
          Central Dashboard
        </Text>
      </View>

      {useScrollView ? (
        <ScrollView 
          contentContainerStyle={[
            styles.scrollContainer, 
            { 
              paddingTop: V_PAD,
              paddingBottom: V_PAD * 2 
            }
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[
            styles.grid, 
            { 
              flexDirection: gridDirection,
              flexWrap: gridWrap,
              gap: CARD_GAP,
            }
          ]}>
            {cards.map(renderCard)}
          </View>
        </ScrollView>
      ) : (
        <View style={[
          styles.scrollContainer, 
          { 
            paddingTop: V_PAD,
            paddingBottom: V_PAD 
          }
        ]}>
          <View style={[
            styles.grid, 
            { 
              flexDirection: gridDirection,
              flexWrap: gridWrap,
              gap: CARD_GAP,
            }
          ]}>
            {cards.map(renderCard)}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WHITE,
  },
  headerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
      marginTop: 25, // Add this line instead of paddingTop if preferred

  },
  header: {
    fontSize: 110,
    paddingTop: 5,
    fontWeight: '700',
    color: PRIMARY_COLOR, // Changed to green
    textAlign: 'center',
    width: '100%',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  grid: {
    width: '100%',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  card: {
    borderRadius: 12,
    backgroundColor: CARD_BG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: PRIMARY_COLOR,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: PRIMARY_LIGHTER,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT_DARK,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardActionText: {
    fontSize: 14,
    color: PRIMARY_COLOR,
    fontWeight: '600',
  },
});