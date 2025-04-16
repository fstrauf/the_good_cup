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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, useNavigation } from "expo-router";
import { getBrewSuggestions, generateGenericBrewSuggestion } from "../../lib/openai";
import type { BrewSuggestionResponse, Grinder } from "../../lib/openai";
import { Button } from "../../components/ui/button";
import { Text } from "../../components/ui/text";
import { Image as LucideImage, X, Coffee, XCircle, Mountain } from "lucide-react-native";
import dayjs from 'dayjs';
import { useAuth } from "../../lib/auth";

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

// Bean interface
interface Bean {
  id: string;
  name: string;
  roastLevel: string;
  flavorNotes: string[];
  description: string;
  photo?: string; // Base64 encoded image
  timestamp: number;
  roastedDate?: number;
}

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

export default function BeansScreen() {
  const isFirstRender = useRef(true);
  const router = useRouter();
  const navigation = useNavigation();
  const [beans, setBeans] = useState<Bean[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingBean, setEditingBean] = useState<Bean | null>(null);
  const [newBean, setNewBean] = useState<Partial<Bean>>({
    name: "",
    roastLevel: "",
    flavorNotes: [],
    description: "",
    photo: undefined,
    roastedDate: undefined,
  });
  const [suggestionModalVisible, setSuggestionModalVisible] = useState(false);
  const [selectedBeanForSuggestion, setSelectedBeanForSuggestion] = useState<Bean | null>(null);
  const [beanSuggestion, setBeanSuggestion] = useState<string>("");
  const [gettingSuggestion, setGettingSuggestion] = useState(false);
  const [navigationData, setNavigationData] = useState<NavigationParams | null>(null);
  const [modalSuggestionText, setModalSuggestionText] = useState<string>("");
  const { token } = useAuth(); // Get auth token for API calls

  const loadBeans = useCallback(async () => {
    try {
      const storedBeans = await AsyncStorage.getItem(BEANS_STORAGE_KEY);
      let beansArray: Bean[] = [];
      if (storedBeans) {
        beansArray = JSON.parse(storedBeans);
        beansArray.sort((a, b) => b.timestamp - a.timestamp);
      }
      setBeans(beansArray);
    } catch (error) {
      console.error("Error loading beans:", error);
      Alert.alert("Error", "Failed to load beans.");
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      loadBeans();
    }, [loadBeans])
  );

  const deleteBean = async (id: string) => {
    Alert.alert("Confirm Delete", "Are you sure you want to delete this bean?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const updatedBeans = beans.filter((bean) => bean.id !== id);
          try {
            const sortedBeans = updatedBeans.sort((a, b) => b.timestamp - a.timestamp);
            await AsyncStorage.setItem(BEANS_STORAGE_KEY, JSON.stringify(sortedBeans));
            setBeans(sortedBeans);
          } catch (error) {
             console.error("Error saving beans after delete:", error);
             Alert.alert("Error", "Failed to save changes after deleting bean.");
          }
        },
      },
    ]);
  };

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return 'N/A';
    try {
      return dayjs(timestamp).format('MMM D, YYYY');
    } catch (e) {
      console.error("Error formatting date with dayjs:", e);
      return 'Invalid Date';
    }
  };

  const getOptimalBrewSuggestions = async (bean: Bean) => {
    setSelectedBeanForSuggestion(bean);
    console.log(`[getOptimalBrewSuggestions] Started for bean: ${bean.name}`);
    setNavigationData(null);
    setSuggestionModalVisible(true);
    setGettingSuggestion(true);
    setModalSuggestionText("");
    try {
      console.log(`[getOptimalBrewSuggestions] Getting stored brews for ${bean.name}...`);
      const storedBrews = await AsyncStorage.getItem(BREWS_STORAGE_KEY);
      console.log(`[getOptimalBrewSuggestions] Stored brews retrieved: ${!!storedBrews}`);
      let suggestionResponse: BrewSuggestionResponse | null = null;
      let hasBrewHistory = false;
      if (storedBrews) {
        console.log(`[getOptimalBrewSuggestions] Processing stored brews...`);
        const brews: Brew[] = JSON.parse(storedBrews);
        const beanBrews = brews.filter((brew) => brew.beanName === bean.name);
        if (beanBrews.length > 0) {
          console.log(
            `[getOptimalBrewSuggestions] Found ${beanBrews.length} brews for ${bean.name}. Attempting suggestion based on history.`
          );
          hasBrewHistory = true;
          const sortedBrews = beanBrews.sort((a, b) => b.rating - a.rating);
          const bestBrew = sortedBrews[0];
          const currentGrinderId = bestBrew.grinder;
          let currentGrinderName: string | undefined = undefined;
          if (currentGrinderId) {
            const storedGrinders = await AsyncStorage.getItem("@GoodCup:grinders");
            const grinders: Grinder[] = storedGrinders ? JSON.parse(storedGrinders) : [];
            currentGrinderName = grinders.find((g) => g.id === currentGrinderId)?.name;
          }
          console.log(
            `[getOptimalBrewSuggestions] Grinder context: ID=${currentGrinderId}, Name=${currentGrinderName}`
          );
          try {
            console.log(`[getOptimalBrewSuggestions] Calling getBrewSuggestions API...`);
            suggestionResponse = await getBrewSuggestions(
              bestBrew,
              sortedBrews,
              bean.name,
              currentGrinderName,
              token
            );
            console.log(
              "[getOptimalBrewSuggestions] Successfully generated suggestion from brew history:",
              suggestionResponse?.suggestionText?.substring(0, 50) + "..."
            );
          } catch (error: any) {
            console.error(
              "[getOptimalBrewSuggestions] Error getting brew suggestions from history:",
              error.message || error
            );
            let errorMessage = "Error getting brew suggestions based on history. Please try again later.";
            if (error.message?.includes("API key")) {
              errorMessage = "OpenAI API key not found or invalid. Please check your settings.";
            } else if (error.message?.includes("internet connection")) {
              errorMessage = "No internet connection detected. Please check your network and try again.";
            } else if (error.message?.includes("timeout")) {
              errorMessage = "The request to OpenAI timed out. Please try again later.";
            } else if (error.message?.includes("Unauthorized")) {
              errorMessage = "Your session has expired. Please sign in again.";
              Alert.alert("Authentication Error", "Your session has expired. Please sign in again.");
              router.replace("/login");
            }
            setBeanSuggestion(errorMessage);
          }
        }
      }
      if (!hasBrewHistory || !suggestionResponse) {
        console.log(
          `[getOptimalBrewSuggestions] No history or history suggestion failed. Attempting generic suggestion.`
        );
        try {
          // --- Determine Brew Method --- 
          let brewMethod = 'Pour Over'; // Default method
          const defaultDeviceId = await AsyncStorage.getItem(DEFAULT_BREW_DEVICE_KEY);
          if (defaultDeviceId) {
            const storedDevices = await AsyncStorage.getItem(BREW_DEVICES_STORAGE_KEY);
            const devices: BrewDevice[] = storedDevices ? JSON.parse(storedDevices) : [];
            const defaultDevice = devices.find(d => d.id === defaultDeviceId);
            if (defaultDevice) {
              brewMethod = defaultDevice.name; 
              console.log(`[getOptimalBrewSuggestions] Using default brew method: ${brewMethod}`);
            }
          } else {
             console.log(`[getOptimalBrewSuggestions] No default brew method set, using: ${brewMethod}`);
          }
          // --- End Determine Brew Method ---

          const roastLevelLabel = bean.roastLevel;
          const beanWithMethod = {
            ...bean,
            roastLevel: roastLevelLabel,
            roastedDate: bean.roastedDate || undefined,
            brewMethod: brewMethod, // Add the determined brew method
          };
          console.log(`[getOptimalBrewSuggestions] Calling generateGenericBrewSuggestion API with method: ${brewMethod}...`);
          suggestionResponse = await generateGenericBrewSuggestion(
            beanWithMethod,
            token
          );
          console.log(
            "[getOptimalBrewSuggestions] Successfully generated generic suggestion:",
            suggestionResponse?.suggestionText?.substring(0, 50) + "..."
          );
        } catch (error: any) {
          console.error("[getOptimalBrewSuggestions] Error generating generic suggestion:", error.message || error);
          let errorMessage = "Error generating suggestions. Please try again later.";
          if (error.message?.includes("API key")) {
            errorMessage = "OpenAI API key not found or invalid. Please check your settings.";
          } else if (error.message?.includes("internet connection")) {
            errorMessage = "No internet connection detected. Please check your network and try again.";
          } else if (error.message?.includes("timeout")) {
            errorMessage = "The request to OpenAI timed out. Please try again later.";
          } else if (error.message?.includes("Unauthorized")) {
            errorMessage = "Your session has expired. Please sign in again.";
            Alert.alert("Authentication Error", "Your session has expired. Please sign in again.");
            router.replace("/login");
          }
          setBeanSuggestion(errorMessage);
        }
      }
      if (suggestionResponse) {
        console.log("[getOptimalBrewSuggestions] Suggestion response obtained:", suggestionResponse);
        setModalSuggestionText(suggestionResponse.suggestionText || "No suggestion text provided.");
        setNavigationData({ bean: bean, suggestionResponse: suggestionResponse });
      } else {
        console.log("[getOptimalBrewSuggestions] No valid suggestion obtained after parsing attempts.");
        setModalSuggestionText("Could not generate or parse brewing suggestions. Please try again later.");
        setNavigationData(null);
      }
    } catch (error: any) {
      console.error("[getOptimalBrewSuggestions] Error in main try block:", error);
      let errorMessage = "An unexpected error occurred while generating suggestions. Please try again later.";
      if (error.message?.includes("API key")) {
        errorMessage = "OpenAI API key not found or invalid. Please check your settings.";
      } else if (error.message?.includes("internet connection")) {
        errorMessage = "No internet connection detected. Please check your network and try again.";
      } else if (error.message?.includes("timeout")) {
        errorMessage = "The request to OpenAI timed out. Please try again later.";
      } else if (error.message?.includes("parse")) {
        errorMessage = "Could not understand the suggestion format received. Please try again.";
      } else if (error.message?.includes("Unauthorized")) {
        errorMessage = "Your session has expired. Please sign in again.";
        Alert.alert("Authentication Error", "Your session has expired. Please sign in again.");
        router.replace("/login");
      }
      setModalSuggestionText(errorMessage);
      setNavigationData(null);
    } finally {
      console.log("[getOptimalBrewSuggestions] Executing finally block.");
      setGettingSuggestion(false);
    }
  };

  // --- Network Test --- (Keep this)
  useEffect(() => {
    const testNetwork = async () => {
      try {
        console.log("[Network Test] Attempting to fetch google.com...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const response = await fetch("https://google.com");
        console.log("[Network Test] Google fetch status:", response.status);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log("[Network Test] Attempting second fetch...");
        const response2 = await fetch("https://google.com");
        console.log("[Network Test] Second fetch status:", response2.status);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log("[Network Test] Attempting third fetch...");
        const response3 = await fetch("https://google.com");
        console.log("[Network Test] Third fetch status:", response3.status);
      } catch (error) {
        console.error("[Network Test] Error fetching google.com:", error);
      }
    };
    testNetwork();
  }, []);
  // --- End Network Test ---

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

        <ScrollView className="flex-1 px-3 pt-2">
          {beans.length === 0 ? (
            <View className="mx-0 my-4 rounded-xl p-6 items-center bg-soft-off-white border border-pale-gray">
              <Coffee size={40} color={themeColors['cool-gray-green']} />
              <Text className="text-lg font-semibold text-charcoal mt-3 mb-2">No beans added yet</Text>
              <Text className="text-sm text-cool-gray-green text-center">
                Add your first coffee bean using the 'Add Bean' button above.
              </Text>
            </View>
          ) : (
            beans.map((bean) => (
              <View
                key={bean.id}
                className="mx-0 mb-4 rounded-xl p-0 bg-soft-off-white border border-pale-gray shadow-sm overflow-hidden"
              >
                <TouchableOpacity 
                  activeOpacity={0.8} 
                  onPress={() => router.push({ pathname: "/add-edit-bean", params: { beanId: bean.id }})}
                >
                  <View className="flex-row p-4">
                    {bean.photo ? (
                      <Image
                        source={{ uri: bean.photo }}
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
                          Added: {formatDate(bean.timestamp)}
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
                          roastedDate: bean.roastedDate ? bean.roastedDate.toString() : undefined
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
                  if (navigationData?.suggestionResponse) {
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
                    router.push({ pathname: "/[beanId]/brew" as any, params: paramsToPass });
                    setNavigationData(null);
                    setModalSuggestionText("");
                  }
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
