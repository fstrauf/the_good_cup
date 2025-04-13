import React, { useState, useCallback, useEffect } from 'react';
import { FlatList, View, RefreshControl, TouchableOpacity, Modal, StyleSheet, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
// import { Card, /*Text,*/ Divider } from '@rneui/themed'; // Removed import
import { getBrewSuggestions, Brew } from '../../../lib/openai';
// import type { BrewSuggestionResponse } from '../../../lib/openai'; // Import the response type
import BeanNameHeader from '../../../components/BeanNameHeader';
// --- Tailwind ---
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../../tailwind.config.js'; // Adjust path

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.colors ?? {}) as Record<string, string>; 
// --- End Tailwind ---

// Storage keys
const BREWS_STORAGE_KEY = '@GoodCup:brews';

// Helper function to format seconds into MM:SS (same as in HomeScreen)
const formatTime = (totalSeconds: number): string => {
  if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

// Helper to format date
const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

export default function BrewsScreen() {
  const params = useLocalSearchParams<{ beanName?: string }>();
  const beanNameFilter = params.beanName;
  const navigation = useNavigation();

  const [allBrews, setAllBrews] = useState<Brew[]>([]);
  const [filteredBrews, setFilteredBrews] = useState<Brew[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // const router = useRouter();
  
  // Effect to update header title
  useEffect(() => {
    if (beanNameFilter) {
      navigation.setOptions({ title: beanNameFilter });
    }
  }, [beanNameFilter, navigation]);

  // Simplified filter function
  const applyFilter = useCallback((brewsToFilter: Brew[]) => {
    console.log("[ApplyFilter] Filtering for bean:", beanNameFilter);
    let result = brewsToFilter;
    if (beanNameFilter) {
      result = result.filter(brew => brew.beanName === beanNameFilter);
    }
    result.sort((a, b) => b.timestamp - a.timestamp);
    setFilteredBrews(result);
  }, [beanNameFilter]);

  const loadBrews = useCallback(async () => {
    setRefreshing(true);
    try {
      const storedBrews = await AsyncStorage.getItem(BREWS_STORAGE_KEY);
      if (storedBrews !== null) {
        const parsedBrews: Brew[] = JSON.parse(storedBrews);
        const fixedBrews = parsedBrews.map(brew => ({ ...brew, beanName: brew.beanName || 'Unnamed Bean' }));
        
        setAllBrews(fixedBrews);

        console.log("[LoadBrews] Applying filter for:", beanNameFilter);
        applyFilter(fixedBrews);
      } else {
        setAllBrews([]);
        setFilteredBrews([]);
      }
    } catch (e) {
      console.error('Failed to load brews.', e);
      setAllBrews([]);
      setFilteredBrews([]);
    } finally {
      setRefreshing(false);
    }
  }, [beanNameFilter, applyFilter]);


  useFocusEffect(
    useCallback(() => {
      loadBrews();
    }, [loadBrews])
  );

  const handleBrewPress = (brew: Brew) => {
    // Temporarily removed suggestion functionality
    // No action when clicking on brew history items
    console.log("Brew selected:", brew.id);
  };

  const renderBrewItem = ({ item }: { item: Brew }) => (
    <TouchableOpacity onPress={() => handleBrewPress(item)} activeOpacity={0.7}>
       <View style={styles.brewCardContainer}> {/* Changed Card to View */}
         <View style={styles.brewCardHeader}>
           <Text style={styles.brewCardDate}>
             {formatDate(item.timestamp)}
           </Text>
           <Text style={styles.brewCardRating}>
             {item.rating}/10
           </Text>
         </View>
         
         <View style={styles.brewCardDivider} /> {/* Changed Divider to View */}
         
         <Text style={styles.brewCardDetail}>
           Steep time: {formatTime(item.steepTime)}
         </Text>
         
         <Text style={styles.brewCardDetail}>
           Grind: {item.grindSize || 'Not specified'}
         </Text>
         
         <Text style={styles.brewCardDetail}>
           Temp: {item.waterTemp || 'Not specified'}
         </Text>
         
         {item.useBloom && (
           <Text style={styles.brewCardDetail}>
             Bloom: {item.bloomTime || 'Yes'}
           </Text>
         )}
         
         {item.notes && (
           <>
             <View style={styles.brewCardNotesDivider} /> {/* Changed Divider to View */}
             <Text style={styles.brewCardNotesText}>
               {item.notes}
             </Text>
           </>
         )}
       </View> {/* Changed Card to View */}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea} className="dark:bg-black" edges={['top', 'left', 'right']}>
      <BeanNameHeader beanName={beanNameFilter} prefix="Brews for:" />
      <View style={styles.mainContainer} className="bg-soft-off-white dark:bg-black">
        {/* Removed Filter Dropdown Card */}

        {/* Use FlatList directly with filteredBrews */}
        <FlatList
          data={filteredBrews}
          renderItem={renderBrewItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyListComponent}>
              <Text style={styles.emptyListText}>
                {refreshing ? 'Loading...' : `No brews found for ${beanNameFilter || 'this bean'}`}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadBrews} />
          }
          contentContainerStyle={styles.flatListContentContainer}
        />
      </View>
    </SafeAreaView>
  );
}

// StyleSheet for better organization
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeColors['soft-off-white']
  },
  mainContainer: {
    flex: 1
  },
  brewCardContainer: {
    borderRadius: 10, 
    marginBottom: 12,
    padding: 16,
    elevation: 1,
    shadowColor: themeColors['charcoal'],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2, 
    backgroundColor: themeColors['soft-off-white']
  },
  brewCardHeader: {
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 8 
  },
  brewCardDate: {
    fontSize: 14, 
    fontWeight: '500', 
    color: themeColors['cool-gray-green']
  },
  brewCardRating: {
    fontSize: 14, 
    fontWeight: '600', 
    color: themeColors['charcoal']
  },
  brewCardDivider: {
    height: 1, // Added height
    marginBottom: 12, 
    backgroundColor: themeColors['pale-gray']
  },
  brewCardDetail: {
    fontSize: 14, 
    color: themeColors['charcoal'],
    marginBottom: 4 
  },
  brewCardNotesDivider: {
    height: 1, // Added height
    marginVertical: 8, 
    backgroundColor: themeColors['pale-gray']
  },
  brewCardNotesText: {
    fontSize: 14, 
    color: themeColors['charcoal'],
    fontStyle: 'italic' 
  },
  emptyListComponent: {
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 64 
  },
  emptyListText: {
    fontSize: 16, 
    color: themeColors['cool-gray-green'],
    textAlign: 'center' 
  },
  flatListContentContainer: {
    paddingHorizontal: 12, 
    paddingTop: 12,
    paddingBottom: 40 
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  modalContent: {
    width: '90%',
    backgroundColor: themeColors['soft-off-white'],
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: themeColors['charcoal'],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalTitle: {
    fontSize: 20, 
    fontWeight: '600', 
    marginBottom: 8,
    color: themeColors['charcoal']
  },
  modalDate: {
    fontSize: 14, 
    color: themeColors['cool-gray-green'],
    marginBottom: 4 
  },
  modalDivider: {
    marginVertical: 12, 
    backgroundColor: themeColors['pale-gray']
  },
  modalSuggestionContainer: {
    // flex: 1 // Removed flex: 1 to allow content to determine height
  },
  modalSuggestionTitle: {
    fontSize: 16, 
    fontWeight: '600', 
    marginBottom: 8,
    color: themeColors['charcoal']
  },
  modalLoadingContainer: {
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 20 
  },
  modalLoadingText: {
    marginTop: 12, 
    color: themeColors['cool-gray-green']
  },
  modalSuggestionScroll: {
    maxHeight: 300 
  },
  modalSuggestionText: {
    fontSize: 14, 
    lineHeight: 20, 
    color: themeColors['charcoal']
  },
  modalCloseButton: {
    borderRadius: 8,
    backgroundColor: themeColors['pale-gray']
  },
  modalCloseButtonTitle: {
     color: themeColors['charcoal']
  }
}); 