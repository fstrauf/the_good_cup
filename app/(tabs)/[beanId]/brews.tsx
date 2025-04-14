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
import { Text as CustomText } from '../../../components/ui/text'; // Import custom Text component

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
       <View className="rounded-lg mb-3 p-4 bg-soft-off-white border border-pale-gray shadow-sm">
         <View className="flex-row justify-between mb-2">
           <CustomText className="text-sm font-medium text-cool-gray-green">
             {formatDate(item.timestamp)}
           </CustomText>
           <CustomText className="text-sm font-semibold text-charcoal">
             {item.rating}/10
           </CustomText>
         </View>
         
         <View className="h-px bg-pale-gray mb-3" />
         
         <CustomText className="text-sm text-charcoal mb-1">
           Steep time: {formatTime(item.steepTime)}
         </CustomText>
         
         <CustomText className="text-sm text-charcoal mb-1">
           Grind: {item.grindSize || 'Not specified'}
         </CustomText>
         
         <CustomText className="text-sm text-charcoal mb-1">
           Temp: {item.waterTemp || 'Not specified'}
         </CustomText>
         
         {item.useBloom && (
           <CustomText className="text-sm text-charcoal mb-1">
             Bloom: {item.bloomTime || 'Yes'}
           </CustomText>
         )}
         
         {item.notes && (
           <>
             <View className="h-px bg-pale-gray my-2" />
             <CustomText className="text-sm text-charcoal italic">
               {item.notes}
             </CustomText>
           </>
         )}
       </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-soft-off-white" edges={['top', 'left', 'right']}>
      <BeanNameHeader beanName={beanNameFilter} prefix="Brews for:" />
      <View className="flex-1 bg-soft-off-white">
        <FlatList
          data={filteredBrews}
          renderItem={renderBrewItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View className="items-center justify-center mt-16">
              <CustomText className="text-base text-cool-gray-green text-center">
                {refreshing ? 'Loading...' : `No brews found for ${beanNameFilter || 'this bean'}`}
              </CustomText>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadBrews} />
          }
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 40 }}
        />
      </View>
    </SafeAreaView>
  );
} 