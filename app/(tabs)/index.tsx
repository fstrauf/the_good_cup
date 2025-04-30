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
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, useNavigation } from "expo-router";
import { Button } from "../../components/ui/button";
import { Text } from "../../components/ui/text";
import { Image as LucideImage, X, Coffee, XCircle, Mountain } from "lucide-react-native";
import dayjs from 'dayjs';
import { useAuth } from "../../lib/auth";
import * as api from '../../lib/api';
import { Bean, Grinder, BrewDevice } from "../../lib/api";

// --- Tailwind --- 
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config.js';

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.extend?.colors ?? fullConfig.theme?.colors ?? {}) as Record<string, string>; 
// --- End Tailwind ---

interface NavigationParams {
  bean: Bean;
  suggestionResponse: any;
}

// --- Helper Functions --- (Outside component)
const formatTime = (totalSeconds: number): string => {
  if (!totalSeconds || isNaN(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

// New sub-component for displaying suggested parameters
const SuggestedParameters: React.FC<{ response: any }> = ({ response }) => {
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

export default function BeansScreen() {
  const isFirstRender = useRef(true);
  const router = useRouter();
  const navigation = useNavigation();
  const [beans, setBeans] = useState<Bean[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [suggestionModalVisible, setSuggestionModalVisible] = useState(false);
  const [selectedBeanForSuggestion, setSelectedBeanForSuggestion] = useState<Bean | null>(null);
  const [gettingSuggestion, setGettingSuggestion] = useState(false);
  const [navigationData, setNavigationData] = useState<NavigationParams | null>(null);
  const [modalSuggestionText, setModalSuggestionText] = useState<string>("");
  const { token } = useAuth();

  const loadBeans = useCallback(async (isRefreshing = false) => {
    if (!isRefreshing) {
      setLoading(true);
    }
    setError(null);
    console.log("[loadBeans] Fetching beans from API...");
    try {
      const fetchedBeans = await api.getBeans();
      fetchedBeans.sort((a, b) => 
        (b.createdAt && a.createdAt) ? dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf() : 0
      );
      setBeans(fetchedBeans);
      console.log(`[loadBeans] Successfully fetched ${fetchedBeans.length} beans.`);
    } catch (e: any) {
      console.error("Error loading beans from API:", e);
      const message = e instanceof Error ? e.message : "An unknown error occurred";
      setError(`Failed to load beans: ${message}`);
      setBeans([]);
    } finally {
       if (!isRefreshing) {
      setLoading(false);
       }
    }
  }, []);

  const onRefresh = useCallback(() => {
    console.log("Pull-to-refresh triggered");
    setRefreshing(true);
    loadBeans(true).finally(() => setRefreshing(false));
  }, [loadBeans]);

  useFocusEffect(
    useCallback(() => {
      console.log("[FocusEffect] Loading beans from API...");
      loadBeans();
    }, [loadBeans])
  );

  const deleteBean = async (id: string) => {
    Alert.alert("Confirm Delete", "Are you sure you want to delete this bean? This action cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
          console.log(`[deleteBean] Attempting to delete bean with ID: ${id}`);
          const originalBeans = [...beans]; 
          setBeans(prevBeans => prevBeans.filter((bean) => bean.id !== id));

          try {
            await api.deleteBean(id); 
            console.log(`[deleteBean] API delete successful for ID: ${id}`);
          } catch (error: any) { 
            console.error("[deleteBean] API Error deleting bean:", error);
            Alert.alert("Error", `Failed to delete bean: ${error.message || 'Unknown error'}`);
            setBeans(originalBeans);
            }
          },
        },
    ]);
  };

  const formatDate = (isoDateString?: string | null): string => {
    if (!isoDateString) return 'N/A';
    try {
      return dayjs(isoDateString).format('MMM D, YYYY');
    } catch (e) {
      console.error("Error formatting date with dayjs:", e);
      return 'Invalid Date';
    }
  };

  const fetchSuggestions = async (bean: Bean, userComment?: string) => {
    console.log(`[fetchSuggestions] Started for bean: ${bean.name}, Comment: ${userComment || 'None'}`);
    setSuggestionModalVisible(true);
    setGettingSuggestion(true);
    setNavigationData(null);
    setModalSuggestionText("");

    try {
      console.log(`[fetchSuggestions] Needs API implementation for brew history & settings.`);
      let suggestionResponse: any | null = null; 
      let hasBrewHistory = false;

      // Placeholder: Logic to check API for brew history for 'bean.id' would go here
      // Example: const brewHistory = await api.getBrewsForBean(bean.id);
      // if (brewHistory && brewHistory.length > 0) { hasBrewHistory = true; ... }

      if (hasBrewHistory) {
        console.log(`[fetchSuggestions] History found (needs API). Generating history-based suggestion (placeholder)...`);
        // Placeholder: Fetch grinder name from API if needed
        // Example: const grinder = await api.getGrinderById(bestBrew.grinderId);
        try {
          // Placeholder: Call history-based suggestion API
          // suggestionResponse = await api.getBrewSuggestion(...); 
          suggestionResponse = { suggestionText: "History suggestion placeholder.", suggestedGrindSize: "Medium-Fine", suggestedWaterTemp: "95C", suggestedSteepTimeSeconds: 190, suggestedUseBloom: true, suggestedBloomTimeSeconds: 35 }; // Placeholder
          console.log("[fetchSuggestions] Generated history suggestion (placeholder).");
        } catch (error: any) {
           console.error("[fetchSuggestions] Error getting history suggestion:", error);
           setModalSuggestionText(`Error: ${error.message || 'Could not get suggestion'}`);
           setNavigationData(null);
        }
      } else {
        console.log(`[fetchSuggestions] No history found or API check skipped. Generating generic suggestion (placeholder)...`);
        try {
          // Placeholder: Fetch default brew device name from API user settings
          // Example: const settings = await api.getUserSettings(); 
          // Example: const device = await api.getBrewDeviceById(settings.defaultBrewDeviceId);
          let brewMethod = 'Pour Over'; // Default if no setting/device found
          // if (device) brewMethod = device.name;

          const beanWithMethod = { ...bean, brewMethod };
           // Placeholder: Call generic suggestion API
          // suggestionResponse = await api.generateGenericBrewSuggestion(beanWithMethod, token);
          suggestionResponse = { suggestionText: "Generic suggestion placeholder.", suggestedGrindSize: "Medium", suggestedWaterTemp: "94C", suggestedSteepTimeSeconds: 180, suggestedUseBloom: true, suggestedBloomTimeSeconds: 30 }; // Placeholder
          console.log("[fetchSuggestions] Generated generic suggestion (placeholder).");
        } catch (error: any) {
           console.error("[fetchSuggestions] Error getting generic suggestion:", error);
           setModalSuggestionText(`Error: ${error.message || 'Could not get suggestion'}`);
           setNavigationData(null);
        }
      }

      if (suggestionResponse) {
        setModalSuggestionText(suggestionResponse.suggestionText || "No suggestion text provided.");
        setNavigationData({ bean: bean, suggestionResponse: suggestionResponse as any }); 
      } else if (!modalSuggestionText) {
        setModalSuggestionText("Could not generate brewing suggestions.");
        setNavigationData(null);
      }
    } catch (error: any) {
      console.error("[fetchSuggestions] Error in main try block:", error);
      setModalSuggestionText(`An unexpected error occurred: ${error.message || 'Unknown error'}`);
      setNavigationData(null);
    } finally {
      setGettingSuggestion(false);
    }
  };

  const getOptimalBrewSuggestions = async (bean: Bean) => {
    setSelectedBeanForSuggestion(bean);

    Alert.prompt(
      'Add Comment?',
      'Optional: Add any specific requests or context for the suggestion (e.g., "make it less bitter", "want brighter flavors").',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            console.log('Suggestion cancelled by user.');
            setSelectedBeanForSuggestion(null);
          },
        },
        {
          text: 'Get Suggestion',
          onPress: (comment) => {
            if (selectedBeanForSuggestion) {
              fetchSuggestions(selectedBeanForSuggestion, comment);
            } else {
              console.error("No bean selected when trying to fetch suggestions.");
              Alert.alert("Error", "Could not get suggestions. Please try again.");
            }
          },
        },
      ],
      Platform.OS === 'ios' ? 'plain-text' : undefined
    );
  };
  
  return (
    <SafeAreaView className="flex-1 bg-soft-off-white" edges={["top", "left", "right"]}>
      <View className="flex-1 bg-soft-off-white">
        <View className="mx-3 mt-3 mb-2 rounded-xl p-4 bg-soft-off-white border border-pale-gray shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-semibold text-charcoal">Coffee Beans</Text>
          <Button 
              variant="default"
            size="sm" 
              onPress={() => router.push("/add-edit-bean")}
              className={"bg-muted-sage-green"}
          >
              <Text className={"text-white font-medium"}>
                Add Bean
              </Text>
          </Button>
          </View>
        </View>

        {loading && !refreshing && (
          <View className="absolute inset-0 bg-soft-off-white/70 justify-center items-center z-10">
            <ActivityIndicator size="large" color={themeColors['cool-gray-green']} />
          </View>
        )}

        {error && !loading && (
          <View className="bg-red-100 border border-red-300 p-3 rounded-md my-4 mx-3">
                <Text className="text-red-700 text-center">{error}</Text>
            <Button variant="outline" size="sm" onPress={() => loadBeans()} className="mt-2 self-center bg-white border-red-300">
              <Text className="text-red-700">Retry</Text>
            </Button>
            </View>
        )}

        <ScrollView 
          className="flex-1 px-3 pt-2 pb-24" 
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors['cool-gray-green']} />
          }
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {!loading && !error && beans.length === 0 ? (
            <View className="flex-1 justify-center items-center mx-0 my-4 rounded-xl p-6 bg-soft-off-white border border-pale-gray">
              <Coffee size={40} color={themeColors['cool-gray-green']} />
              <Text className="text-lg font-semibold text-charcoal mt-3 mb-2">No beans added yet</Text>
              <Text className="text-sm text-cool-gray-green text-center">
                Add your first coffee bean using the 'Add Bean' button above.
              </Text>
            </View>
          ) : (
            !loading && !error && beans.map((bean) => (
              <View
                key={bean.id}
                className="mx-0 mb-4 rounded-xl p-0 bg-soft-off-white border border-pale-gray shadow-sm overflow-hidden"
              >
                <TouchableOpacity 
                  activeOpacity={0.8} 
                  onPress={() => router.push({ pathname: "/add-edit-bean", params: { beanId: bean.id }})}
                >
                  <View className="flex-row p-4">
                    {bean.imageUrl ? (
                      <Image
                        source={{ uri: bean.imageUrl }}
                        className="w-20 h-20 rounded-lg border border-pebble-gray"
                      />
                    ) : (
                      <View className="w-20 h-20 rounded-lg bg-light-beige justify-center items-center border border-dashed border-pebble-gray">
                        <Mountain size={30} color={themeColors['cool-gray-green']} />
                      </View>
                    )}
                    <View className="flex-1 ml-4">
                      <View className="flex-row justify-between items-start">
                        <Text className="text-lg font-semibold text-charcoal flex-shrink mr-2" numberOfLines={2}>
                          {bean.name}
                        </Text>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); deleteBean(bean.id); }} className="p-1 -mt-1 -mr-1">
                          <XCircle size={22} color={themeColors['cool-gray-green']} />
                        </TouchableOpacity>
                      </View>
                      <View className="h-px bg-pale-gray my-2" />
                      <View className="flex-1">
                        <Text className="text-sm text-charcoal mb-0.5">
                          Roast: <Text className="font-medium">{bean.roastLevel || "Unknown"}</Text>
                        </Text>
                        {bean.flavorNotes && bean.flavorNotes.length > 0 && (
                          <View className="mt-1.5">
                            <Text className="text-sm text-charcoal mb-1">Flavor Notes:</Text>
                            <View className="flex-row flex-wrap">
                              {bean.flavorNotes.map((note: string, index: number) => (
                                <View
                                  key={index}
                                  className="bg-mist-blue/50 px-2 py-0.5 rounded-full mr-1.5 mb-1.5 border border-mist-blue"
                                >
                                  <Text className="text-xs text-charcoal">{note.trim()}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}
                        {bean.description && (
                          <Text className="text-sm text-charcoal/80 mt-2 italic" numberOfLines={2}>
                            {bean.description}
                          </Text>
                        )}
                        {bean.roastedDate && (
                          <Text className="text-sm text-charcoal/80 mt-1.5">
                            Roasted: <Text className="font-medium">{formatDate(bean.roastedDate)}</Text>
                          </Text>
                        )}
                        <Text className="text-xs text-cool-gray-green mt-2 text-right">
                          Added: {formatDate(bean.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
                <View className="flex-row justify-around items-center mt-2 pt-3 pb-2 border-t border-pale-gray bg-light-beige/50">
                  <TouchableOpacity
                    className="flex-1 items-center px-1 py-1"
                    onPress={() =>
                      router.push({
                        pathname: "/[beanId]/brew" as any,
                        params: { 
                          beanId: bean.id, 
                          beanName: bean.name,
                          roastedDate: bean.roastedDate ? bean.roastedDate : undefined 
                        },
                      })
                    }
                  >
                    <Image source={require("../../assets/images/brew.png")} style={{ width: 52, height: 52 }} />
                    <Text className="text-xs text-center text-cool-gray-green mt-1 font-medium">Brew</Text>
                  </TouchableOpacity>
                  <View className="h-full w-px bg-pale-gray" />
                  <TouchableOpacity
                    className="flex-1 items-center px-1 py-1"
                    onPress={() =>
                      router.push({
                        pathname: "/[beanId]/brews" as any,
                        params: { beanId: bean.id, beanName: bean.name },
                      })
                    }
                  >
                    <Image source={require("../../assets/images/past_brews.png")} style={{ width: 52, height: 52 }} />
                    <Text className="text-xs text-center text-cool-gray-green mt-1 font-medium">History</Text>
                  </TouchableOpacity>
                  <View className="h-full w-px bg-pale-gray" />
                  <TouchableOpacity
                    className="flex-1 items-center px-1 py-1"
                    onPress={() => getOptimalBrewSuggestions(bean)}
                  >
                    <Image source={require("../../assets/images/suggest_brew.png")} style={{ width: 52, height: 52 }} />
                    <Text className="text-xs text-center text-cool-gray-green mt-1 font-medium">Suggest</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <View className="h-5" />
        </ScrollView>
      </View>
      <Modal
        animationType="slide"
        transparent={true}
        visible={suggestionModalVisible}
        onRequestClose={() => setSuggestionModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-charcoal/60 p-5">
          <View className="w-full bg-soft-off-white rounded-2xl p-5 max-h-[85%] shadow-lg border border-pale-gray">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xl font-semibold text-charcoal flex-1 mr-2" numberOfLines={1}>
                {selectedBeanForSuggestion?.name || "Bean"} Suggestion
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setNavigationData(null);
                  setModalSuggestionText("");
                  setSuggestionModalVisible(false);
                }}
                className="p-1"
              >
                <X size={24} color={themeColors['cool-gray-green']} />
              </TouchableOpacity>
            </View>
            
            <View className="h-px bg-pale-gray my-3" />

            <ScrollView style={{ maxHeight: 450 }} className="mb-4">
              {gettingSuggestion ? (
                <View className="items-center justify-center py-8">
                  <ActivityIndicator size="large" color={themeColors['cool-gray-green']} />
                  <Text className="mt-3 text-cool-gray-green">Analyzing brewing data...</Text>
                </View>
              ) : (
                <View>
                  <Text className="text-base leading-relaxed text-charcoal">
                    {modalSuggestionText || "No suggestions available."}
                  </Text>
                  {!gettingSuggestion && navigationData?.suggestionResponse && (
                    <SuggestedParameters response={navigationData.suggestionResponse} />
                  )}
                </View>
              )}
            </ScrollView>

            {navigationData ? (
              <Button
                variant="default"
                size="default"
                className="bg-muted-sage-green"
                onPress={() => {
                  const { suggestionResponse, bean } = navigationData;
                  const paramsToPass = {
                      beanId: bean.id,
                      beanName: bean.name,
                      suggestion: suggestionResponse.suggestionText || "",
                      grindSize: suggestionResponse.suggestedGrindSize || "",
                      waterTemp: suggestionResponse.suggestedWaterTemp || "",
                      steepTime: suggestionResponse.suggestedSteepTimeSeconds?.toString() || "",
                      useBloom: suggestionResponse.suggestedUseBloom ? "true" : "false",
                      bloomTime: suggestionResponse.suggestedBloomTimeSeconds?.toString() || "",
                      fromSuggestion: "true",
                      roastedDate: bean.roastedDate ? bean.roastedDate.toString() : undefined
                  };
                  try {
                    router.push({ pathname: "/[beanId]/brew" as any, params: paramsToPass });
                  } catch (e) {
                    console.error("[Modal Button Press] Error during router.push:", e);
                    Alert.alert("Navigation Error", "Could not navigate to the brew screen.");
                  }
                  setNavigationData(null);
                  setSuggestionModalVisible(false);
                  setModalSuggestionText("");
                }}
              >
                <Text className="text-charcoal font-bold">Use Suggestion & Brew</Text>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="default"
                className="bg-soft-off-white border-cool-gray-green"
                onPress={() => {
                  setSuggestionModalVisible(false);
                  setNavigationData(null);
                  setModalSuggestionText("");
                }}
                disabled={gettingSuggestion}
              >
                <Text className="text-charcoal font-bold">Close</Text>
              </Button>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}