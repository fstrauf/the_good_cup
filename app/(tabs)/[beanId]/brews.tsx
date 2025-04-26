import React, { useState, useCallback, useEffect } from 'react';
import { FlatList, View, RefreshControl, TouchableOpacity, Share, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
// import { Card, /*Text,*/ Divider } from '@rneui/themed'; // Removed import
import { Brew } from '../../../lib/openai';
// import type { BrewSuggestionResponse } from '../../../lib/openai'; // Import the response type
import BeanNameHeader from '../../../components/BeanNameHeader';
import dayjs from 'dayjs'; // Import dayjs
import { Text as CustomText } from '../../../components/ui/text'; // Import custom Text component
import { Share as ShareIcon } from 'lucide-react-native'; // Import ShareIcon
import resolveConfig from 'tailwindcss/resolveConfig'; // Import resolveConfig
import tailwindConfig from '../../../tailwind.config.js'; // Import tailwindConfig

// --- Tailwind ---
const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.colors ?? {}) as Record<string, string>;
// --- End Tailwind ---

// Storage keys
const BREWS_STORAGE_KEY = '@GoodCup:brews';

// Helper function to calculate age in days
const calculateAgeDays = (roastTimestamp?: number, brewTimestamp?: number): number | null => {
  if (!roastTimestamp || !brewTimestamp) return null;
  const roastDate = dayjs(roastTimestamp);
  const brewDate = dayjs(brewTimestamp);
  if (!roastDate.isValid() || !brewDate.isValid()) return null;
  return brewDate.diff(roastDate, 'day');
};

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

  // --- Share Functionality ---
  const handleSharePress = async (item: Brew) => {
    const roastAge = calculateAgeDays(item.roastedDate, item.timestamp);
    const formattedSteepTime = formatTime(item.steepTime);

    // Use template literals for the message
    const shareMessage = `Shared from The Good Cup app:

☕ Bean: ${item.beanName || 'Unknown Bean'}
${roastAge !== null ? `   Age at Brew: ${roastAge} day${roastAge === 1 ? '' : 's'} old\n` : ''}
⚙️ Brew Details:
${item.grindSize ? `   Grind: ${item.grindSize}\n` : ''}${item.waterTemp ? `   Water: ${item.waterTemp}°C\n` : ''}   Time: ${formattedSteepTime}
   Rating: ${item.rating}/10
${item.notes ? `   Notes: ${item.notes}\n` : ''}`;
    // Optional: Add app link
    // shareMessage += `\nGet The Good Cup: [Your App Link]`;

    try {
      const result = await Share.share({
        message: shareMessage.trim(), // Trim potential extra whitespace
      });
      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          // shared with activity type of result.activityType
          console.log(`Shared via ${result.activityType}`);
        } else {
          // shared
          console.log('Shared successfully');
        }
      } else if (result.action === Share.dismissedAction) {
        // dismissed
        console.log('Share dismissed');
      }
    } catch (error: any) {
      Alert.alert('Error', `Failed to share brew: ${error.message}`);
    }
  };
  // --- End Share Functionality ---

  const renderBrewItem = ({ item }: { item: Brew }) => {
    // Calculate roast age
    const roastAge = calculateAgeDays(item.roastedDate, item.timestamp);

    return (
      <View className="rounded-lg mb-3 p-4 bg-soft-off-white border border-pale-gray shadow-sm">
        <View className="flex-row justify-between mb-2 items-center">
          <View className="flex-row items-center flex-shrink mr-2"> 
             <CustomText className="text-sm font-medium text-cool-gray-green">
               {formatDate(item.timestamp)}
             </CustomText>
             {roastAge !== null && (
               <CustomText className="text-xs font-medium text-cool-gray-green ml-1.5">
                 {`(${roastAge} day${roastAge === 1 ? '' : 's'} old)`}
               </CustomText>
             )}
           </View>
           <View className="flex-row items-center">
             <CustomText className="text-sm font-semibold text-charcoal mr-3">
               {item.rating}/10
             </CustomText>
             <TouchableOpacity 
                onPress={() => handleSharePress(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="p-1"
             >
               <ShareIcon size={20} color={themeColors['cool-gray-green']} />
             </TouchableOpacity>
           </View>
        </View>

        <View className="h-px bg-pale-gray mb-3" />

        {item.roastedDate && (
          <CustomText className="text-xs text-cool-gray-green mb-2">
              Roasted: {formatDate(item.roastedDate)}
          </CustomText>
        )}

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
    );
  };

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