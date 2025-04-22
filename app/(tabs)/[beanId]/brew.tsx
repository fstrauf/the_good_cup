import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ScrollView,
  Platform,
  Alert,
  View,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  TextInput,
  Switch as RNSwitch,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import Slider from "@react-native-community/slider";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useRouter } from "expo-router";
import BeanNameHeader from "../../../components/BeanNameHeader";
import { Button } from "../../../components/ui/button";
import { Text } from "../../../components/ui/text";
import { X } from "lucide-react-native";

// --- Tailwind ---
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../../tailwind.config.js"; // Adjust path

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.colors ?? {}) as Record<string, string>;
// --- End Tailwind ---

const BREWS_STORAGE_KEY = "@GoodCup:brews";
const BREW_DEVICES_STORAGE_KEY = "@GoodCup:brewDevices";
const GRINDERS_STORAGE_KEY = "@GoodCup:grinders";
const DEFAULT_BREW_DEVICE_KEY = "@GoodCup:defaultBrewDevice";
const DEFAULT_GRINDER_KEY = "@GoodCup:defaultGrinder";

interface DropdownItem {
  label: string;
  value: string;
}

interface BrewDevice {
  id: string;
  name: string;
}

interface Grinder {
  id: string;
  name: string;
}

interface Brew {
  id: string;
  timestamp: number;
  beanName: string;
  steepTime: number;
  useBloom: boolean;
  bloomTime?: string;
  grindSize: string;
  waterTemp: string;
  rating: number;
  notes: string;
  brewDevice?: string;
  grinder?: string;
  roastedDate: number;
}

interface StoredBean {
  id: string;
  name: string;
  roaster: string;
  origin?: string;
  process?: string;
  roastLevel?: string;
  flavorNotes?: string[];
  description?: string;
  // Other bean properties not needed for this context
}

const formatTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

// Helper function to parse slider input
const parseSliderInput = (text: string, min: number, max: number): number => {
  const num = parseInt(text, 10);
  if (isNaN(num)) return min; // Default to min if not a number
  return Math.max(min, Math.min(max, num)); // Clamp between min and max
};

const HomeScreenComponent = () => {
  const params = useLocalSearchParams<{
    beanName?: string;
    suggestion?: string;
    grindSize?: string;
    waterTemp?: string;
    steepTime?: string;
    useBloom?: string;
    bloomTime?: string;
    fromSuggestion?: string;
    roastedDate?: string;
  }>();
  const [beanName, setBeanName] = useState<string | null>(null);
  const [steepTimeSeconds, setSteepTimeSeconds] = useState(180);
  const [useBloom, setUseBloom] = useState(false);
  const [bloomTime, setBloomTime] = useState("");
  const [grindSize, setGrindSize] = useState("");
  const [waterTemp, setWaterTemp] = useState("");
  const [rating, setRating] = useState(5);
  const [notes, setNotes] = useState("");
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [brewDevices, setBrewDevices] = useState<BrewDevice[]>([]);
  const [grinders, setGrinders] = useState<Grinder[]>([]);
  const [selectedBrewDevice, setSelectedBrewDevice] = useState<string>("");
  const [selectedGrinder, setSelectedGrinder] = useState<string>("");
  const [suggestion, setSuggestion] = useState<string>("");

  // New state for suggestion modal
  const [suggestionModalVisible, setSuggestionModalVisible] = useState(false);

  // Add new state variable near the top
  const [suggestionApplied, setSuggestionApplied] = useState(false);

  // Add a ref to store the timeout ID
  const modalTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const router = useRouter();
  const navigation = useNavigation();

  useEffect(() => {
    console.log("[brew.tsx Effect] Received route params:", JSON.stringify(params));

    // Always set bean name if available
    if (params.beanName) {
      setBeanName(params.beanName);
      console.log("[Effect] Bean name set from route params:", params.beanName);
    } else {
      console.warn("[Effect] No beanName found in route params.");
    }

    // Clear any existing modal timeout
    if (modalTimeoutRef.current) {
      clearTimeout(modalTimeoutRef.current);
      modalTimeoutRef.current = null;
    }

    // Check if this navigation is from a suggestion
    if (params.fromSuggestion === "true" && !suggestionApplied) {
      console.log("[Effect] Processing suggestion parameters (first time)...");

      // Mark suggestion as applied FIRST to prevent re-application
      setSuggestionApplied(true);

      // Apply suggestion parameters
      if (params.suggestion) {
        setSuggestion(params.suggestion);
      }
      if (params.grindSize) {
        console.log(`[Effect] Setting grindSize state with: ${params.grindSize}`);
        setGrindSize(params.grindSize);
      }
      if (params.waterTemp) {
        console.log(`[Effect] Setting waterTemp state with: ${params.waterTemp}`);
        setWaterTemp(params.waterTemp);
      }
      if (params.steepTime) {
        const time = parseInt(params.steepTime);
        if (!isNaN(time)) {
          console.log(`[Effect] Setting steepTimeSeconds state with: ${time}`);
          setSteepTimeSeconds(time);
        }
      }
      if (params.useBloom === "true") {
        console.log(`[Effect] Setting useBloom state to true`);
        setUseBloom(true);
        if (params.bloomTime) {
           const bloomSec = parseInt(params.bloomTime);
           if(!isNaN(bloomSec)) {
              const formattedBloom = formatTime(bloomSec);
              console.log(`[Effect] Setting bloomTime state with: ${formattedBloom}`);
              setBloomTime(formattedBloom);
           } else {
              console.log(`[Effect] Setting bloomTime state with raw value: ${params.bloomTime}`);
              setBloomTime(params.bloomTime); // Use raw string if not numeric seconds
           }
        }
      } else {
         console.log(`[Effect] Setting useBloom state to false`);
         setUseBloom(false); 
         setBloomTime("");
      }

      // Schedule the modal to open after applying params
      modalTimeoutRef.current = setTimeout(() => {
        setSuggestionModalVisible(true);
        modalTimeoutRef.current = null; // Clear ref after execution
      }, 100);
      console.log("[Effect] Suggestion parameters applied and modal scheduled.");

    } else if (params.fromSuggestion !== "true") {
       console.log("[Effect] Not a navigation from suggestion or suggestion already applied.");
       // Reset suggestionApplied flag and ensure modal is closed if navigating normally
       if (suggestionApplied) setSuggestionApplied(false); // Reset only if it was true
       if (suggestionModalVisible) setSuggestionModalVisible(false); // Ensure modal is closed
    }

    // Cleanup function remains the same
    return () => {
      if (modalTimeoutRef.current) {
        clearTimeout(modalTimeoutRef.current);
        modalTimeoutRef.current = null;
        console.log("[Effect Cleanup] Cleared modal timeout.");
      }
    };

  }, [params]); // Keep dependency array as [params]

  // Effect to update header title
  useEffect(() => {
    if (beanName) {
      navigation.setOptions({ title: beanName });
    } else {
      navigation.setOptions({ title: "New Brew" });
    }
  }, [beanName, navigation]);

  useEffect(() => {
    loadEquipment();
  }, []);

  // Add effect to monitor useBloom state changes
  useEffect(() => {
    console.log("[useEffect] useBloom state changed to:", useBloom);
  }, [useBloom]);

  const loadEquipment = async () => {
    try {
      console.log("[LoadEquipment] Fetching data from AsyncStorage...");
      const storedDevicesRaw = await AsyncStorage.getItem(BREW_DEVICES_STORAGE_KEY);
      const storedGrindersRaw = await AsyncStorage.getItem(GRINDERS_STORAGE_KEY);
      const defaultDeviceId = await AsyncStorage.getItem(DEFAULT_BREW_DEVICE_KEY);
      const defaultGrinderId = await AsyncStorage.getItem(DEFAULT_GRINDER_KEY);

      console.log("[LoadEquipment] Raw storedDevices:", storedDevicesRaw);
      console.log("[LoadEquipment] Raw storedGrinders:", storedGrindersRaw);
      console.log("[LoadEquipment] Default Device ID:", defaultDeviceId);
      console.log("[LoadEquipment] Default Grinder ID:", defaultGrinderId);

      let devices: BrewDevice[] = [];
      let grinders: Grinder[] = [];

      if (storedDevicesRaw) {
        try {
          devices = JSON.parse(storedDevicesRaw);
          console.log("[LoadEquipment] Parsed devices:", devices);
        } catch (parseError) {
          console.error("[LoadEquipment] Error parsing devices JSON:", parseError);
        }
      } else {
        console.log("[LoadEquipment] No stored devices found.");
      }

      if (storedGrindersRaw) {
        try {
          grinders = JSON.parse(storedGrindersRaw);
          console.log("[LoadEquipment] Parsed grinders:", grinders);
        } catch (parseError) {
          console.error("[LoadEquipment] Error parsing grinders JSON:", parseError);
        }
      } else {
        console.log("[LoadEquipment] No stored grinders found.");
      }

      // Use functional updates for state setters to ensure logging happens after update
      setBrewDevices((prevDevices) => {
        console.log("[LoadEquipment] Setting brewDevices state with:", devices);
        return devices;
      });
      setGrinders((prevGrinders) => {
        console.log("[LoadEquipment] Setting grinders state with:", grinders);
        return grinders;
      });

      // Set default selections if available AND if the default device/grinder still exists
      if (defaultDeviceId) {
        console.log(`[LoadEquipment] Found default Device ID in storage: ${defaultDeviceId}`);
        if (devices.some(d => d.id === defaultDeviceId)) {
          console.log("[LoadEquipment] Default device found in loaded list. Setting state...");
          setSelectedBrewDevice(defaultDeviceId);
        } else {
          console.warn("[LoadEquipment] Saved default brew device ID not found in current device list.");
        }
      } else {
        console.log("[LoadEquipment] No default brew device ID found in storage.");
      }
      
      if (defaultGrinderId) {
        console.log(`[LoadEquipment] Found default Grinder ID in storage: ${defaultGrinderId}`);
        if (grinders.some(g => g.id === defaultGrinderId)) {
          console.log("[LoadEquipment] Default grinder found in loaded list. Setting state...");
          setSelectedGrinder(defaultGrinderId);
        } else {
          console.warn("[LoadEquipment] Saved default grinder ID not found in current grinder list.");
        }
      } else {
        console.log("[LoadEquipment] No default grinder ID found in storage.");
      }
    } catch (error) {
      console.error("[LoadEquipment] Error loading equipment:", error);
    }

    // Before the return statement, add logs for the state values
    console.log("[Render] Final selectedBrewDevice state:", selectedBrewDevice);
    console.log("[Render] Final selectedGrinder state:", selectedGrinder);
  };

  // Add useEffect to log state changes accurately
  useEffect(() => {
    console.log("[State Update] brewDevices state updated:", brewDevices);
  }, [brewDevices]);

  useEffect(() => {
    console.log("[State Update] grinders state updated:", grinders);
  }, [grinders]);

  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  const handleSaveBrew = async () => {
    console.log("[handleSaveBrew] Current beanName state before save:", beanName);
    if (!beanName || !grindSize || !waterTemp) {
      Alert.alert("Missing Info", "Please fill in Grind Size, and Water Temp (Bean should be pre-selected).");
      return;
    }

    const roastedDateTimestamp = params.roastedDate ? parseInt(params.roastedDate) : Date.now();

    const newBrew: Brew = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      beanName: beanName,
      steepTime: steepTimeSeconds,
      useBloom,
      bloomTime: useBloom ? bloomTime : undefined,
      grindSize,
      waterTemp,
      rating,
      notes,
      brewDevice: selectedBrewDevice || undefined,
      grinder: selectedGrinder || undefined,
      roastedDate: roastedDateTimestamp,
    };
    console.log("[handleSaveBrew] Saving newBrew object:", newBrew);

    try {
      const storedBrews = await AsyncStorage.getItem(BREWS_STORAGE_KEY);
      const existingBrews: Brew[] = storedBrews ? JSON.parse(storedBrews) : [];
      const updatedBrews = [...existingBrews, newBrew];
      await AsyncStorage.setItem(BREWS_STORAGE_KEY, JSON.stringify(updatedBrews));

      setSteepTimeSeconds(180);
      setUseBloom(false);
      setBloomTime("");
      setGrindSize("");
      setWaterTemp("");
      setRating(5);
      setNotes("");
      Alert.alert("Success", `Brew saved for ${beanName}!`, [
        {
          text: "OK",
          onPress: () => {
            // Navigate back to the beans list
            router.replace("/");
          },
        },
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error("[handleSaveBrew] Failed to save brew.", e);
      Alert.alert("Error", "Could not save the brew.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // Handle slider changes
  const onSliderChange = (value: number, type: "time" | "rating") => {
    if (type === "time") {
      setSteepTimeSeconds(value);
    } else {
      setRating(value);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [timerInterval]);

  // Format brew devices and grinders for dropdown
  const brewDeviceOptions: DropdownItem[] = brewDevices.map((device) => ({
    label: device.name,
    value: device.id,
  }));

  const grinderOptions: DropdownItem[] = grinders.map((grinder) => ({
    label: grinder.name,
    value: grinder.id,
  }));

  console.log("[Render] Brew Device Options:", brewDeviceOptions);
  console.log("[Render] Grinder Options:", grinderOptions);
  console.log("[Render] Current waterTemp state:", waterTemp);
  console.log("[Render] Current useBloom state:", useBloom);

  if (!beanName) {
    return (
      <SafeAreaView className="flex-1 bg-soft-off-white justify-center items-center">
        <ActivityIndicator size="large" color={themeColors["cool-gray-green"]} />
        <Text className="text-cool-gray-green mt-2">Loading bean...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-soft-off-white" edges={["top", "left", "right"]}>
      <ScrollView
        className="flex-1 px-3"
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-soft-off-white rounded-xl border border-pale-gray mb-6 mx-0 shadow-cool-gray-green/10 shadow-md elevation-2">
          {/* Use the reusable component */}
          <BeanNameHeader beanName={beanName} prefix="Brewing:" />

          <View className="px-4 pb-2">
            <Text className="text-lg font-semibold text-charcoal mb-3">Brew Parameters</Text>

            <View className="mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-base font-medium text-charcoal">Steep Time</Text>
                <Text className="text-base font-semibold text-cool-gray-green">
                  {formatTime(timerActive ? timerSeconds : steepTimeSeconds)}
                </Text>
              </View>
              <Slider
                value={steepTimeSeconds}
                onValueChange={(value) => onSliderChange(value, "time")}
                minimumValue={30}
                maximumValue={300}
                step={5}
                minimumTrackTintColor={themeColors["cool-gray-green"]}
                maximumTrackTintColor={themeColors["pale-gray"]}
                thumbTintColor={themeColors["cool-gray-green"]}
                style={{ height: 40 }}
                tapToSeek={true}
              />
            </View>

            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-base font-medium text-charcoal">Use Bloom?</Text>
              <RNSwitch
                value={useBloom}
                onValueChange={(value) => {
                  console.log("[RNSwitch] useBloom value being set to:", value);
                  setUseBloom(value);
                }}
                trackColor={{ false: themeColors["pale-gray"], true: themeColors["cool-gray-green"] }}
                thumbColor={themeColors["soft-off-white"]}
                ios_backgroundColor={themeColors["pale-gray"]}
              />
            </View>

            {useBloom && (
              <View className="mb-4">
                <Text className="text-base font-medium text-charcoal mb-2">Bloom Time (e.g., 0:30)</Text>
                <TextInput
                  style={styles.textInput}
                  value={bloomTime}
                  onChangeText={setBloomTime}
                  placeholder="Minutes:Seconds"
                  placeholderTextColor={themeColors["cool-gray-green"]}
                  keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric"}
                />
              </View>
            )}

            {/* Debug button for bloom toggle */}
            <TouchableOpacity 
              onPress={() => {
                console.log("[Debug Button] Toggling useBloom from:", useBloom, "to:", !useBloom);
                setUseBloom(!useBloom);
              }}
              style={{ 
                backgroundColor: themeColors["pale-gray"],
                padding: 5,
                borderRadius: 5,
                marginBottom: 10
              }}
            >
              <Text style={{ color: themeColors["charcoal"], textAlign: 'center' }}>
                Debug: Toggle Bloom ({useBloom ? "ON" : "OFF"})
              </Text>
            </TouchableOpacity>

            <View className="mb-4">
              <Text className="text-base font-medium text-charcoal mb-2">Grind Size</Text>
              <TextInput
                style={styles.textInput}
                value={grindSize}
                onChangeText={setGrindSize}
                placeholder="Medium-Fine, 18 clicks, etc."
                placeholderTextColor={themeColors["cool-gray-green"]}
              />
            </View>

            <View className="mb-4">
              <Text className="text-base font-medium text-charcoal mb-2">Water Temperature</Text>
              <TextInput
                style={styles.textInput}
                value={waterTemp}
                onChangeText={setWaterTemp}
                placeholder="96°C or 205°F"
                placeholderTextColor={themeColors["cool-gray-green"]}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View className="h-px bg-pale-gray my-4" />

          <View className="px-4 pb-2">
            <Text className="text-lg font-semibold text-charcoal mb-3">Rating & Notes</Text>
            <View className="mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-base font-medium text-charcoal">Rating</Text>
                <Text className="text-base font-semibold text-cool-gray-green">{rating}/10</Text>
              </View>
              <Slider
                value={rating}
                onValueChange={(value) => onSliderChange(value, "rating")}
                minimumValue={1}
                maximumValue={10}
                step={1}
                minimumTrackTintColor={themeColors["cool-gray-green"]}
                maximumTrackTintColor={themeColors["pale-gray"]}
                thumbTintColor={themeColors["cool-gray-green"]}
                style={{ height: 40 }}
                tapToSeek={true}
              />
            </View>

            <View className="mb-4">
              <Text className="text-base font-medium text-charcoal mb-2">Notes</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Tasting notes, observations, etc."
                placeholderTextColor={themeColors["cool-gray-green"]}
                multiline
                numberOfLines={4}
              />
            </View>
          </View>

          <View className="px-4 pb-2">
            <Text className="text-base font-medium text-charcoal mb-2">Brew Device</Text>
            {brewDeviceOptions.length > 0 ? (
              <Select
                value={
                  brewDevices.find((d) => d.id === selectedBrewDevice)
                    ? {
                        value: selectedBrewDevice,
                        label: brewDevices.find((d) => d.id === selectedBrewDevice)?.name || "",
                      }
                    : undefined
                }
                onValueChange={(option) => option && setSelectedBrewDevice(option.value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue className="text-charcoal" placeholder="Select brew device" />
                </SelectTrigger>
                <SelectContent insets={contentInsets} className="w-full">
                  <SelectGroup>
                    {brewDeviceOptions.map((device) => (
                      <SelectItem key={device.value} value={device.value} label={device.label} />
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Text className="text-xs text-cool-gray-green ml-2 mt-1">Add brew devices in Settings</Text>
            )}
          </View>

          <View className="mb-4 px-4">
            <Text className="text-base font-medium text-charcoal mb-2">Grinder</Text>
            {grinderOptions.length > 0 ? (
              <Select
                value={
                  grinders.find((g) => g.id === selectedGrinder)
                    ? { value: selectedGrinder, label: grinders.find((g) => g.id === selectedGrinder)?.name || "" }
                    : undefined
                }
                onValueChange={(option) => option && setSelectedGrinder(option.value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue className="text-foreground text-sm native:text-lg" placeholder="Select grinder" />
                </SelectTrigger>
                <SelectContent insets={contentInsets} className="w-full">
                  <SelectGroup>
                    {grinderOptions.map((grinder) => (
                      <SelectItem
                        key={grinder.value}
                        value={grinder.value}
                        label={grinder.label}
                      />
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Text className="text-xs text-cool-gray-green ml-2 mt-1">Add grinders in Settings</Text>
            )}
          </View>

          <View className="h-px bg-pale-gray my-4" />

          <View className="px-4 pt-4 pb-4">
            <Button onPress={handleSaveBrew} disabled={!beanName} className="bg-muted-sage-green rounded-lg h-12">
              <Text className="text-charcoal font-bold">Save Brew</Text>
            </Button>
          </View>
        </View>
      </ScrollView>

      {/* Suggestion Modal */}
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
                Brewing Suggestion for {beanName}
              </Text>
              <TouchableOpacity onPress={() => setSuggestionModalVisible(false)} className="p-1">
                <X size={24} color="#A8B9AE" />
              </TouchableOpacity>
            </View>

            <View className="h-px bg-[#E7E7E7] my-3" />

            <ScrollView style={{ maxHeight: 400 }} className="mb-4">
              <Text className="text-base leading-relaxed text-charcoal">
                {suggestion || "No suggestions available."}
              </Text>
            </ScrollView>

            <Text className="text-sm text-cool-gray-green mb-3 italic">
              Suggested brewing parameters have been pre-filled in the form below. Feel free to adjust them.
            </Text>

            <Button
              variant="default"
              size="default"
              onPress={() => setSuggestionModalVisible(false)}
              className="bg-muted-sage-green rounded-lg py-2.5"
            >
              <Text className="text-charcoal font-bold">Close and Brew</Text>
            </Button>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// StyleSheet for components that need more complex styling than classes alone
const styles = StyleSheet.create({
  textInput: {
    borderWidth: 1,
    borderColor: themeColors["pebble-gray"],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    backgroundColor: themeColors["soft-off-white"],
    color: themeColors["charcoal"],
    fontSize: 14,
    minHeight: 44,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
    paddingTop: Platform.OS === "ios" ? 12 : 8,
  },
  divider: {
    height: 1,
    backgroundColor: themeColors["pale-gray"],
    marginVertical: 16,
  },
  sliderInput: {
    borderWidth: 1,
    borderColor: themeColors["pebble-gray"],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    backgroundColor: themeColors["soft-off-white"],
    color: themeColors["charcoal"],
    fontSize: 14,
    textAlign: "center",
    minHeight: 44,
  },
});

export default HomeScreenComponent;
