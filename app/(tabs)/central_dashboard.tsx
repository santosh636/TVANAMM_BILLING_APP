// app/central-dashboard.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React from 'react';
import {
  BackHandler,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

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

  // Layout calculations (unchanged)
  const H_PAD = isTablet ? 24 : 16;
  const V_PAD = isTablet ? 24 : 16;
  const CARD_GAP = isTablet ? 20 : 16;
  const HEADER_HEIGHT = isTablet ? 80 : 60;

  // Layout logic (unchanged)
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
      description: 'Forecast future trends and performance metrics',
    },
    { 
      icon: 'trending-up' as ValidIonicons, 
      title: 'Sales Overview', 
      route: '/central_sales_overview',
      description: 'View comprehensive sales data and insights',
    },
    { 
      icon: 'bar-chart' as ValidIonicons, 
      title: 'Franchise Sales', 
      route: '/central_franchise_overview',
      description: 'Monitor individual franchise performance',
    },
    { 
      icon: 'settings' as ValidIonicons, 
      title: 'Settings', 
      route: '/central_settings',
      description: 'Configure application preferences',
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
        <View style={styles.textContainer}>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardDescription}>{card.description}</Text>
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.actionButton}>
            <Text style={styles.cardActionText}>Explore</Text>
            <Ionicons name="chevron-forward" size={18} color={WHITE} />
          </View>
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
          CENTRAL DASHBOARD
        </Text>
        <View style={styles.headerDivider} />
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
    marginTop: 25,
  },
  header: {
    fontSize: 36,
    fontWeight: '800',
    color: PRIMARY_COLOR,
    textAlign: 'center',
    width: '100%',
    marginBottom: 8,
    letterSpacing: 1,
  },
  headerDivider: {
    height: 4,
    width: '40%',
    backgroundColor: PRIMARY_LIGHT,
    borderRadius: 2,
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
    borderRadius: 16,
    backgroundColor: CARD_BG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    padding: 24,
    borderTopWidth: 4,
    borderTopColor: PRIMARY_COLOR,
    overflow: 'hidden',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: PRIMARY_LIGHTER,
  },
  textContainer: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_DARK,
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cardActionText: {
    fontSize: 14,
    color: WHITE,
    fontWeight: '600',
    marginRight: 8,
  },
});