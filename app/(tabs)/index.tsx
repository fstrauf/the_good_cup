import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Text as RNText,
  Platform,
  TextInput,
  FlatList,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, useNavigation } from "expo-router";
import { getBrewSuggestions, generateGenericBrewSuggestion } from "../../lib/openai";
import type { BrewSuggestionResponse, Grinder } from "../../lib/openai";
import { Button } from "../../components/ui/button";
import { Text } from "../../components/ui/text";
import { Image as LucideImage, X, Coffee, XCircle, Mountain, Trash2, Edit } from "lucide-react-native";
import dayjs from 'dayjs';
import { useAuth } from "../../lib/auth";
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

// --- Tailwind --- 
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config.js';

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.extend?.colors ?? fullConfig.theme?.colors ?? {}) as Record<string, string>; 
// --- End Tailwind ---

// Storage keys
const BEANS_STORAGE_KEY = "@GoodCup:beans";
const BREWS_STORAGE_KEY = "@GoodCup:brews";
const BREW_DEVICES_STORAGE_KEY = '@GoodCup:brewDevices';
const DEFAULT_BREW_DEVICE_KEY = '@GoodCup:defaultBrewDevice';

// Simplified Brew interface for extracting bean info
interface Brew {
  id: string;
  beanName: string;
  timestamp: number;
  rating: number;
  notes: string;
  steepTime: number;
  useBloom: boolean;
  bloomTime?: string;
  grindSize: string;
  waterTemp: string;
  brewDevice?: string;
  grinder?: string;
  roastedDate?: number;
}

// Add BrewDevice interface if not already defined
interface BrewDevice {
  id: string;
  name: string;
  type?: string; // Optional fields as needed
  notes?: string;
}

// Interface for navigation parameters
interface NavigationParams {
  bean: Bean;
  suggestionResponse: BrewSuggestionResponse;
}

// --- Helper Functions --- (Outside component)
const formatTime = (totalSeconds: number): string => {
  if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

// New sub-component for displaying suggested parameters
const SuggestedParameters: React.FC<{ response: BrewSuggestionResponse }> = ({ response }) => {
  if (!response) return null;

  // Helper to display N/A if value is null/empty
  const displayValue = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined || value === '') return 'N/A';
    return String(value);
  };

  return (
    <View className="mt-4 pt-3 border-t border-pale-gray">
      <Text className="text-base font-semibold text-charcoal mb-2">Parameters:</Text>
      <View className="flex-row mb-1.5">
        <Text className="w-28 text-sm text-cool-gray-green">Grind:</Text>
        <Text className="flex-1 text-sm text-charcoal font-medium">
          {displayValue(response.suggestedGrindSize)}
        </Text>
      </View>
      <View className="flex-row mb-1.5">
        <Text className="w-28 text-sm text-cool-gray-green">Water Temp:</Text>
        <Text className="flex-1 text-sm text-charcoal font-medium">
          {displayValue(response.suggestedWaterTemp)}
        </Text>
      </View>
      <View className="flex-row mb-1.5">
        <Text className="w-28 text-sm text-cool-gray-green">Steep Time:</Text>
        <Text className="flex-1 text-sm text-charcoal font-medium">
          {response.suggestedSteepTimeSeconds
            ? formatTime(response.suggestedSteepTimeSeconds)
            : 'N/A'}
        </Text>
      </View>
      <View className="flex-row mb-1.5">
        <Text className="w-28 text-sm text-cool-gray-green">Bloom:</Text>
        <Text className="flex-1 text-sm text-charcoal font-medium">
          {response.suggestedUseBloom ? 'Yes' : 'No'}
          {response.suggestedUseBloom && response.suggestedBloomTimeSeconds && 
            ` (${formatTime(response.suggestedBloomTimeSeconds)})`}
        </Text>
      </View>
    </View>
  );
};

// Import API functions and types
import * as api from '../../lib/api';
import { Bean } from '../../lib/api'; // Import Bean interface

export default function BeansScreen() {
  const insets = useSafeAreaInsets();
  console.log('Bottom Inset:', insets.bottom);
  const isFirstRender = useRef(true);
  const router = useRouter();
  const navigation = useNavigation();
  const [beans, setBeans] = useState<Bean[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingBean, setEditingBean] = useState<Bean | null>(null);
  const [newBean, setNewBean] = useState<Partial<Bean>>({
    name: "",
    roastLevel: "",
    flavorNotes: [],
    roastedDate: undefined,
    roaster: "",
    origin: "", 
    process: "",
    imageUrl: undefined
  });
  const [suggestionModalVisible, setSuggestionModalVisible] = useState(false);
  const [selectedBeanForSuggestion, setSelectedBeanForSuggestion] = useState<Bean | null>(null);
  const [beanSuggestion, setBeanSuggestion] = useState<string>("");
  const [gettingSuggestion, setGettingSuggestion] = useState(false);
  const [navigationData, setNavigationData] = useState<NavigationParams | null>(null);
  const [modalSuggestionText, setModalSuggestionText] = useState<string>("");
  const { token } = useAuth(); // Get auth token for API calls

  // <<< New State >>>
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [suggestionComment, setSuggestionComment] = useState("");
  // <<< End New State >>>

  const loadBeans = useCallback(async (isRefreshing = false) => {
    if (!isRefreshing) setLoading(true);
    setRefreshing(isRefreshing);
    setError(null);
    try {
      const fetchedBeans = await api.getBeans(); // Use imported api
      setBeans(fetchedBeans);
    } catch (e: any) {
      console.error('Failed to load beans from API:', e);
      setError(`Failed to load beans: ${e.message || 'Unknown error'}`);
      setBeans([]); // Clear beans on error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBeans();
    }, [loadBeans])
  );

  const onRefresh = useCallback(() => {
    loadBeans(true); // Pass true to indicate refresh
  }, [loadBeans]);

  const handleAddBean = () => {
    router.push('/add-edit-bean'); // Navigate to add/edit screen
  };

  const handleEditBean = (bean: Bean) => {
    router.push({ pathname: '/add-edit-bean', params: { beanData: JSON.stringify(bean) } });
  };

  const handleBeanPress = (bean: Bean) => {
    router.push({ pathname: '/[beanId]/brews', params: { beanName: bean.name, beanId: bean.id } });
  };

  const handleDeleteBean = async (id: string, name: string) => {
    Alert.alert(
      `Delete ${name}?`,
      "Are you sure you want to delete this bean and all its associated brews? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true); // Show loading state
            setError(null);
            try {
              await api.deleteBean(id); // Use imported api
              setBeans(prevBeans => prevBeans.filter(bean => bean.id !== id)); // Update state optimistically
              Alert.alert('Success', `Bean "${name}" deleted successfully.`);
            } catch (e: any) {
              console.error('Failed to delete bean:', e);
              setError(`Failed to delete bean: ${e.message || 'Unknown error'}`);
              Alert.alert('Error', `Failed to delete bean: ${e.message || 'Unknown error'}`);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Calculate days since roast date (using imported Bean type)
  const calculateDaysSinceRoast = (roastDate: string | null | undefined): string | null => {
    if (!roastDate) return null;
    try {
        const roastDayjs = dayjs(roastDate);
        if (!roastDayjs.isValid()) return null;
        const days = dayjs().diff(roastDayjs, 'day');
        if (days < 0) return 'Roast date in future?'; 
        if (days === 0) return 'Roasted today';
        if (days === 1) return 'Roasted yesterday';
        return `Roasted ${days} days ago`;
    } catch (e) {
        console.error("Error calculating days since roast:", e, "Input:", roastDate);
        return null; 
    }
  };

  // Render item for FlatList (uses imported Bean type)
  const renderBeanItem = ({ item }: { item: Bean }) => {
    const daysSinceRoast = calculateDaysSinceRoast(item.roastedDate);
    
    return (
      <TouchableOpacity 
        onPress={() => handleBeanPress(item)} 
        className="bg-white rounded-lg p-4 mb-3 shadow-sm border border-pale-gray flex-row justify-between items-center"
        activeOpacity={0.7}
        disabled={loading} // Disable interaction while loading
      >
        <View className="flex-1 mr-3">
          <Text className="text-lg font-semibold text-charcoal mb-1">{item.name}</Text>
          {item.roaster && <Text className="text-sm text-cool-gray-green">by {item.roaster}</Text>}
          {item.origin && <Text className="text-sm text-cool-gray-green">from {item.origin}</Text>}
          {daysSinceRoast && <Text className="text-xs text-stone-500 mt-1.5 italic">{daysSinceRoast}</Text>}
        </View>
        <View className="flex-col justify-between items-end h-full">
            <TouchableOpacity 
                onPress={(e) => { e.stopPropagation(); handleEditBean(item); }}
                className="p-1 mb-2" // Add spacing
                hitSlop={{ top: 10, bottom: 5, left: 10, right: 10 }}
                disabled={loading}
            >
                <Edit size={20} color={themeColors['cool-gray-green']} />
            </TouchableOpacity>
            <TouchableOpacity 
                onPress={(e) => { e.stopPropagation(); handleDeleteBean(item.id, item.name); }}
                className="p-1" 
                hitSlop={{ top: 5, bottom: 10, left: 10, right: 10 }}
                disabled={loading}
            >
                <Trash2 size={20} color={themeColors['cool-gray-green']} />
            </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView className="flex-1 bg-soft-off-white justify-center items-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={themeColors['cool-gray-green']} />
        <Text className="mt-2 text-cool-gray-green">Loading Beans...</Text>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView className="flex-1 bg-soft-off-white" edges={['top', 'left', 'right']}>
      <View className="flex-1 px-4 pt-4 bg-soft-off-white">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-2xl font-semibold text-charcoal">My Beans</Text>
          <Button 
            size="sm" 
            onPress={handleAddBean} 
            className="bg-muted-sage-green"
            disabled={loading} // Disable if loading
          >
            <Text className="text-white font-semibold">Add Bean</Text>
          </Button>
        </View>

        {error && (
            <View className="bg-red-100 border border-red-300 p-3 rounded-md mb-4">
                <Text className="text-red-700 text-center">{error}</Text>
            </View>
        )}

        <FlatList
          data={beans}
          renderItem={renderBeanItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors['cool-gray-green']} />
          }
          ListEmptyComponent={
            !loading && !refreshing && beans.length === 0 ? (
              <View className="flex-1 justify-center items-center mt-10">
                <Text className="text-cool-gray-green text-center">No beans added yet. Tap 'Add Bean' to start!</Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      </View>
    </SafeAreaView>
  );
}
