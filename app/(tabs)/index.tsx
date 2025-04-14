import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Text as RNText,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, useNavigation } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { analyzeImage, getBrewSuggestions, generateGenericBrewSuggestion, Brew as OpenAIBrew } from "../../lib/openai";
import type { BrewSuggestionResponse, Grinder } from "../../lib/openai";
import { Button } from "../../components/ui/button";
import { Text } from "../../components/ui/text";
import { Plus, Camera, Image as LucideImage, X, Coffee, XCircle, Mountain } from "lucide-react-native";
import { cn } from "../../lib/utils";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

// Storage keys
const BEANS_STORAGE_KEY = "@GoodCup:beans";
const BREWS_STORAGE_KEY = "@GoodCup:brews";

// Bean interface
interface Bean {
  id: string;
  name: string;
  roastLevel: string;
  flavorNotes: string[];
  description: string;
  photo?: string; // Base64 encoded image
  timestamp: number;
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

// Interface for navigation parameters
interface NavigationParams {
  bean: Bean;
  suggestionResponse: BrewSuggestionResponse;
}

export default function BeansScreen() {
  const isFirstRender = useRef(true);
  const router = useRouter();
  const navigation = useNavigation();
  const [beans, setBeans] = useState<Bean[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [newBean, setNewBean] = useState<Partial<Bean>>({
    name: "",
    roastLevel: "",
    flavorNotes: [],
    description: "",
    photo: undefined,
  });
  const [suggestionModalVisible, setSuggestionModalVisible] = useState(false);
  const [selectedBeanForSuggestion, setSelectedBeanForSuggestion] = useState<Bean | null>(null);
  const [beanSuggestion, setBeanSuggestion] = useState<string>("");
  const [gettingSuggestion, setGettingSuggestion] = useState(false);
  const [navigationData, setNavigationData] = useState<NavigationParams | null>(null);
  const [modalSuggestionText, setModalSuggestionText] = useState<string>("");

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
  const saveBeans = async (updatedBeans: Bean[]) => {
    try {
      await AsyncStorage.setItem(BEANS_STORAGE_KEY, JSON.stringify(updatedBeans));
      setBeans(updatedBeans);
    } catch (error) {
      console.error("Error saving beans:", error);
      Alert.alert("Error", "Failed to save beans.");
    }
  };
  const addBean = async () => {
    if (!newBean.name) {
      Alert.alert("Missing Information", "Please enter at least a name.");
      return;
    }
    setLoading(true);
    try {
      const beanToAdd: Bean = {
        id: Date.now().toString(),
        name: newBean.name,
        roastLevel: newBean.roastLevel || "unknown",
        flavorNotes: newBean.flavorNotes || [],
        description: newBean.description || "",
        photo: newBean.photo,
        timestamp: Date.now(),
      };
      const updatedBeans = [...beans, beanToAdd];
      await saveBeans(updatedBeans);
      setNewBean({ name: "", roastLevel: "", flavorNotes: [], description: "", photo: undefined });
      setShowAddForm(false);
      Alert.alert("Success", "Bean added successfully!");
    } catch (error) {
      console.error("Error adding bean:", error);
      Alert.alert("Error", "Failed to add bean.");
    }
    setLoading(false);
  };
  const deleteBean = async (id: string) => {
    Alert.alert("Confirm Delete", "Are you sure you want to delete this bean?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const updatedBeans = beans.filter((bean) => bean.id !== id);
          await saveBeans(updatedBeans);
        },
      },
    ]);
  };
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is required to take photos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          setNewBean((prev) => ({ ...prev, photo: `data:image/jpeg;base64,${asset.base64}` }));
          await analyzePhoto(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Failed to take photo. Note: Camera is not available in simulators.");
    }
  };
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Media library permission is required to select photos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          setNewBean((prev) => ({ ...prev, photo: `data:image/jpeg;base64,${asset.base64}` }));
          await analyzePhoto(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image.");
    }
  };
  const analyzePhoto = async (base64Image: string) => {
    setAnalyzing(true);
    try {
      console.log("Starting image analysis...");
      const extractedData = await analyzeImage(base64Image);
      const beanName = extractedData["Bean name"];
      const roastLevel = extractedData["Roast level"];
      const flavorNotes = extractedData["Flavor notes"];
      const description = extractedData["Description"];

      // Update form with extracted data
      // const validRoastLevel = roastLevelOptions.find(o => o.label.toLowerCase() === roastLevel?.toLowerCase())?.value; // Comment out usage

      setNewBean((prev) => ({
        ...prev,
        name: beanName || prev.name,
        // roastLevel: validRoastLevel || prev.roastLevel || 'unknown', // Comment out usage
        roastLevel: roastLevel || prev.roastLevel || "unknown", // Use extracted value directly or fallback
        flavorNotes: flavorNotes || prev.flavorNotes,
        description: description || prev.description,
      }));
      Alert.alert(
        "Analysis Complete",
        "Information extracted from the package photo. Please review and edit if needed."
      );
    } catch (error: any) {
      console.error("Error analyzing photo:", error.message || error);
      if (error.message?.includes("API key")) {
        Alert.alert("API Key Error", "OpenAI API key not found or invalid. Please check your settings.");
      } else if (error.message?.includes("internet connection")) {
        Alert.alert("Network Error", "No internet connection detected. Please check your network and try again.");
      } else if (error.message?.includes("timeout")) {
        Alert.alert("Timeout Error", "The request to OpenAI timed out. Please try again later.");
      } else {
        Alert.alert(
          "Analysis Error",
          "Failed to analyze the photo. Please try again. Error: " + (error.message || "Unknown error")
        );
      }
    }
    setAnalyzing(false);
  };
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
              currentGrinderName
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
          // Get the roast level label instead of value
          // const roastLevelLabel = roastLevelOptions.find(o => o.value === bean.roastLevel)?.label || bean.roastLevel; // Comment out usage
          const roastLevelLabel = bean.roastLevel; // Use existing value directly

          // Create a bean object with the label instead of the value
          const beanWithLabel = {
            ...bean,
            roastLevel: roastLevelLabel,
          };

          console.log(`[getOptimalBrewSuggestions] Calling generateGenericBrewSuggestion API...`);
          suggestionResponse = await generateGenericBrewSuggestion(beanWithLabel);
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
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <View className="flex-1 bg-soft-off-white">
          <View className="mx-3 mt-3 mb-2 rounded-xl p-4 bg-white border border-[#E7E7E7] shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl font-semibold text-charcoal">Coffee Beans</Text>
              <Button
                variant={showAddForm ? "outline" : "default"}
                size="sm"
                onPress={() => setShowAddForm(!showAddForm)}
                className={showAddForm ? "bg-stone-200 border-stone-300" : "bg-charcoal"}
              >
                <Plus
                  className={cn(
                    "mr-2",
                    showAddForm ? "text-charcoal" : "text-primary-foreground"
                  )}
                  size={18}
                  strokeWidth={2.5}
                />
                <Text className={showAddForm ? "text-charcoal" : "text-primary-foreground"}>
                  {showAddForm ? "Cancel" : "Add Bean"}
                </Text>
              </Button>
            </View>
          </View>
          {showAddForm ? (
            <View className="flex-1">
              <View style={{ flex: 1 }}>
                <ScrollView
                  className="px-3"
                  contentContainerStyle={{ paddingBottom: 120 }}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                >
                  <View className="bg-soft-off-white p-4 rounded-lg mb-4">
                    <Text className="text-xl font-semibold mb-4 text-center text-charcoal">Add New Bean</Text>
                    <View className="relative items-center mb-4">
                      {newBean.photo ? (
                        <Image
                          source={{ uri: newBean.photo }}
                          className="w-full h-48 rounded-lg mb-2 border border-pebble-gray"
                        />
                      ) : (
                        <View className="w-full h-48 rounded-lg bg-light-beige justify-center items-center mb-2 border border-dashed border-pebble-gray">
                          <LucideImage size={40} color="#A8B9AE" />
                          <Text className="text-cool-gray-green mt-2">No Photo</Text>
                        </View>
                      )}
                      <View className="flex-row justify-center mt-2 space-x-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onPress={takePhoto}
                          className="bg-stone-200 border-stone-300 flex-row items-center"
                        >
                          <Camera size={16} className="text-charcoal mr-1.5" strokeWidth={2} />
                          <Text className="text-charcoal text-sm">Camera</Text>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onPress={pickImage}
                          className="bg-stone-200 border-stone-300 flex-row items-center"
                        >
                          <LucideImage size={16} className="text-charcoal mr-1.5" strokeWidth={2} />
                          <Text className="text-charcoal text-sm">Gallery</Text>
                        </Button>
                      </View>
                      {analyzing && (
                        <View className="absolute top-0 left-0 right-0 bottom-0 bg-charcoal/70 rounded-lg justify-center items-center">
                          <ActivityIndicator size="large" color="#A8B9AE" />
                          <Text className="mt-3 text-soft-off-white font-medium">Analyzing photo...</Text>
                        </View>
                      )}
                    </View>
                    <View className="h-px bg-[#E7E7E7] my-4" />
                    <View className="mb-2">
                      <Text className="text-sm font-semibold text-[#A8B9AE] mb-1.5 ml-2.5">Bean Name</Text>
                      <TextInput
                        value={newBean.name}
                        onChangeText={(text: string) => setNewBean({ ...newBean, name: text })}
                        placeholder="e.g., Ethiopia Yirgacheffe"
                        style={styles.inputStyle}
                        placeholderTextColor="#A8B9AE"
                      />
                    </View>
                    <View className="mb-2 mt-4">
                      <Text className="text-sm font-semibold text-[#A8B9AE] mb-1.5 ml-2.5">Roast Level</Text>
                      <Select
                        value={newBean.roastLevel ? { value: newBean.roastLevel, label: newBean.roastLevel } : undefined}
                        onValueChange={(option) => option && setNewBean({ ...newBean, roastLevel: option.value })}
                        disabled={true}
                      >
                        <SelectTrigger className="border-[#DADADA] bg-[#FAFAF9] h-[50px]">
                          <SelectValue 
                            className="text-[#4A4A4A]" 
                            placeholder="Select roast level (Disabled)" 
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="light" label="Light">Light</SelectItem>
                            <SelectItem value="medium-light" label="Medium Light">Medium Light</SelectItem>
                            <SelectItem value="medium" label="Medium">Medium</SelectItem>
                            <SelectItem value="medium-dark" label="Medium Dark">Medium Dark</SelectItem>
                            <SelectItem value="dark" label="Dark">Dark</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </View>
                    <View className="mb-2 mt-4">
                      <Text className="text-sm font-semibold text-[#A8B9AE] mb-1.5 ml-2.5">Flavor Notes (comma separated)</Text>
                      <TextInput
                        value={newBean.flavorNotes?.join(", ")}
                        onChangeText={(text: string) =>
                          setNewBean({
                            ...newBean,
                            flavorNotes: text
                              .split(",")
                              .map((note: string) => note.trim())
                              .filter((note: string) => note),
                          })
                        }
                        placeholder="e.g., Blueberry, Chocolate, Citrus"
                        style={styles.inputStyle}
                        placeholderTextColor="#A8B9AE"
                      />
                    </View>
                    <View className="mb-2 mt-4">
                      <Text className="text-sm font-semibold text-[#A8B9AE] mb-1.5 ml-2.5">Description</Text>
                      <TextInput
                        value={newBean.description}
                        onChangeText={(text: string) => setNewBean({ ...newBean, description: text })}
                        placeholder="Additional notes about this coffee"
                        multiline
                        numberOfLines={3}
                        style={[styles.inputStyle, { minHeight: 80, textAlignVertical: "top", paddingTop: 10 }]}
                        placeholderTextColor="#A8B9AE"
                      />
                    </View>
                  </View>
                </ScrollView>
              </View>
              <View className="bg-soft-off-white py-2.5 px-4 border-t border-pale-gray shadow-lg">
                <Button
                  variant="default"
                  size="default"
                  onPress={addBean}
                  className="bg-lime-200 h-12"
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#4A4A4A" />
                  ) : (
                    <Text className="text-charcoal font-bold">Save Bean</Text>
                  )}
                </Button>
              </View>
            </View>
          ) : (
            <ScrollView className="flex-1 px-3 pt-2">
              {beans.length === 0 ? (
                <View className="mx-0 my-4 rounded-xl p-6 items-center bg-white border border-[#E7E7E7]">
                  <Coffee size={40} color="#A8B9AE" />
                  <Text className="text-lg font-semibold text-charcoal mt-3 mb-2">No beans added yet</Text>
                  <Text className="text-sm text-cool-gray-green text-center">
                    Add your first coffee bean using the 'Add Bean' button above.
                  </Text>
                </View>
              ) : (
                beans.map((bean) => (
                  <View
                    key={bean.id}
                    className="mx-0 mb-4 rounded-xl p-0 bg-white border border-[#E7E7E7] shadow-sm"
                  >
                    <View className="flex-row p-4">
                      {bean.photo ? (
                        <Image
                          source={{ uri: bean.photo }}
                          className="w-20 h-20 rounded-lg border border-pebble-gray"
                        />
                      ) : (
                        <View className="w-20 h-20 rounded-lg bg-light-beige justify-center items-center border border-dashed border-pebble-gray">
                          <Mountain size={30} color="#A8B9AE" />
                        </View>
                      )}
                      <View className="flex-1 ml-4">
                        <View className="flex-row justify-between items-start">
                          <Text className="text-lg font-semibold text-charcoal flex-shrink mr-2" numberOfLines={2}>
                            {bean.name}
                          </Text>
                          <TouchableOpacity onPress={() => deleteBean(bean.id)} className="p-1 -mt-1 -mr-1">
                            <XCircle size={22} color="#A8B9AE" />
                          </TouchableOpacity>
                        </View>
                        <View className="h-px bg-[#E7E7E7] my-2" />
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
                          <Text className="text-xs text-cool-gray-green mt-2 text-right">
                            Added: {formatDate(bean.timestamp)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View className="flex-row justify-around items-center mt-2 pt-3 pb-2 border-t border-pale-gray bg-soft-off-white/50 rounded-b-lg">
                      <TouchableOpacity
                        className="flex-1 items-center px-1 py-1"
                        onPress={() =>
                          router.push({
                            pathname: "/[beanId]/brew" as any,
                            params: { beanId: bean.id, beanName: bean.name },
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
          )}
        </View>
      </KeyboardAvoidingView>
      <Modal
        animationType="slide"
        transparent={true}
        visible={suggestionModalVisible}
        onRequestClose={() => setSuggestionModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-charcoal/60 p-5">
          <View className="w-full bg-soft-off-white rounded-2xl p-5 max-h-[80%] shadow-lg border border-pale-gray">
            <View className="flex-row justify-between items-center">
              <Text className="text-xl font-semibold text-charcoal flex-1 mr-2" numberOfLines={1}>
                {selectedBeanForSuggestion?.name || "Bean"} Suggestion
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (navigationData && navigationData.suggestionResponse) {
                    console.log("[Modal Close Button] Navigating with data:", navigationData);
                    const paramsToPass = {
                      beanId: navigationData.bean.id,
                      beanName: navigationData.bean.name,
                      suggestion: navigationData.suggestionResponse.suggestionText || "",
                      grindSize: navigationData.suggestionResponse.suggestedGrindSize || "",
                      waterTemp: navigationData.suggestionResponse.suggestedWaterTemp || "",
                      steepTime: navigationData.suggestionResponse.suggestedSteepTimeSeconds?.toString() || "",
                      useBloom: navigationData.suggestionResponse.suggestedUseBloom ? "true" : "false",
                      bloomTime: navigationData.suggestionResponse.suggestedBloomTimeSeconds?.toString() || "",
                      fromSuggestion: "true",
                    };
                    console.log("[Modal Close Button] Params being passed:", paramsToPass);
                    router.push({
                      pathname: "/[beanId]/brew" as any,
                      params: paramsToPass,
                    });
                    setNavigationData(null);
                    setSuggestionModalVisible(false);
                    setModalSuggestionText("");
                  } else {
                    console.error("[Modal Close Button] Navigation data or suggestionResponse is missing!");
                    setSuggestionModalVisible(false);
                    setModalSuggestionText("");
                  }
                }}
                className="p-1"
              >
                <X size={24} color="#A8B9AE" />
              </TouchableOpacity>
            </View>
            <View className="h-px bg-[#E7E7E7] my-3" />
            <ScrollView style={{ maxHeight: 400 }} className="mb-4">
              {gettingSuggestion ? (
                <View className="items-center justify-center py-8">
                  <ActivityIndicator size="large" color="#A8B9AE" />
                  <Text className="mt-3 text-cool-gray-green">Analyzing brewing data...</Text>
                </View>
              ) : (
                <Text className="text-base leading-relaxed text-charcoal">
                  {modalSuggestionText || "No suggestions available."}
                </Text>
              )}
            </ScrollView>
            {(() => {
              console.log("[Modal Render] Value of navigationData before button render:", navigationData);
              return null; // This console.log is just for debugging, render nothing
            })()}

            {navigationData ? (
              <Button
                variant="default"
                size="default"
                className="bg-white"
                onPress={() => {
                  // Log at the start of onPress
                  console.log("[Modal Button Press] 'Use Suggestion' button pressed.");
                  console.log("[Modal Button Press] Value of navigationData on press:", navigationData);

                  if (navigationData && navigationData.suggestionResponse) { // Check suggestionResponse exists
                    console.log("[Modal Close Button] Navigating with data:", navigationData);
                    const paramsToPass = {
                      beanId: navigationData.bean.id,
                      beanName: navigationData.bean.name,
                      suggestion: navigationData.suggestionResponse.suggestionText || "",
                      grindSize: navigationData.suggestionResponse.suggestedGrindSize || "",
                      waterTemp: navigationData.suggestionResponse.suggestedWaterTemp || "",
                      steepTime: navigationData.suggestionResponse.suggestedSteepTimeSeconds?.toString() || "",
                      useBloom: navigationData.suggestionResponse.suggestedUseBloom ? "true" : "false",
                      bloomTime: navigationData.suggestionResponse.suggestedBloomTimeSeconds?.toString() || "",
                      fromSuggestion: "true",
                    };
                    console.log("[Modal Close Button] Params being passed:", paramsToPass);
                    try {
                      router.push({
                        pathname: "/[beanId]/brew" as any,
                        params: paramsToPass,
                      });
                      console.log("[Modal Button Press] router.push executed.");
                    } catch (e) {
                      console.error("[Modal Button Press] Error during router.push:", e);
                      Alert.alert("Navigation Error", "Could not navigate to the brew screen.");
                    }
                    // Reset state AFTER navigation setup
                    setNavigationData(null);
                    setSuggestionModalVisible(false);
                    setModalSuggestionText("");
                  } else {
                    console.error("[Modal Button Press] Navigation data or suggestionResponse is missing on press!");
                    // Close modal even if data is bad
                    setSuggestionModalVisible(false);
                    setModalSuggestionText("");
                  }
                }}
              >
                <Text className="text-charcoal font-bold">Use Suggestion & Brew</Text>
              </Button>
            ) : (
              <Button
                variant="default"
                size="default"
                className="bg-white"
                onPress={() => {
                  // Log at the start of onPress for the 'Close' button
                  console.log("[Modal Button Press] 'Close' button pressed.");
                  setSuggestionModalVisible(false);
                  setNavigationData(null); // Reset just in case
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

const styles = StyleSheet.create({
  inputLabelThemed: { fontSize: 14, color: "#A8B9AE", fontWeight: "600", marginBottom: 6, marginLeft: 10 },
  inputStyle: {
    borderWidth: 1,
    borderColor: "#DADADA",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    backgroundColor: "#FAFAF9",
    color: "#4A4A4A",
    fontSize: 16,
    height: 50,
  }
});
