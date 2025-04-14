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
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router"; // Added useLocalSearchParams
import * as ImagePicker from "expo-image-picker";
import { analyzeImage, Brew as OpenAIBrew } from "../lib/openai"; // Corrected path
import { Button } from "../components/ui/button"; // Corrected path
import { Text } from "../components/ui/text"; // Corrected path
import { Camera, Image as LucideImage, X, ChevronLeft } from "lucide-react-native"; // Added ChevronLeft
import { cn } from "../lib/utils"; // Corrected path
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"; // Corrected path
import DateTimePicker from 'react-native-ui-datepicker';
import { useDefaultClassNames } from 'react-native-ui-datepicker';
import dayjs from 'dayjs';
import { useAuth } from "../lib/auth";

// --- Tailwind --- 
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../tailwind.config.js'; // Corrected path

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.extend?.colors ?? fullConfig.theme?.colors ?? {}) as Record<string, string>; 
// --- End Tailwind ---

// Storage keys
const BEANS_STORAGE_KEY = "@GoodCup:beans";

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


export default function AddEditBeanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ beanId?: string }>();
  const beanId = params.beanId; // Get beanId from route params
  const isEditing = !!beanId;
  const { token } = useAuth(); // Get auth token for API calls

  const [beans, setBeans] = useState<Bean[]>([]); // Need original beans list to update
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  // editingBean state is replaced by checking if beanId exists
  const [newBean, setNewBean] = useState<Partial<Bean>>({
    name: "",
    roastLevel: "",
    flavorNotes: [],
    description: "",
    photo: undefined,
    roastedDate: undefined,
  });
  const [isDatePickerOpen, setDatePickerOpen] = useState(false);
  const defaultClassNames = useDefaultClassNames();

  // Fetch all beans on load to easily find the one to edit or to update the list
  const loadAllBeans = useCallback(async () => {
    try {
      const storedBeans = await AsyncStorage.getItem(BEANS_STORAGE_KEY);
      const beansArray: Bean[] = storedBeans ? JSON.parse(storedBeans) : [];
      setBeans(beansArray);

      // If editing, find the bean and populate the form
      if (isEditing && beanId) {
        const beanToEdit = beansArray.find(b => b.id === beanId);
        if (beanToEdit) {
          setNewBean({
            name: beanToEdit.name,
            roastLevel: beanToEdit.roastLevel,
            flavorNotes: beanToEdit.flavorNotes,
            description: beanToEdit.description,
            photo: beanToEdit.photo,
            roastedDate: beanToEdit.roastedDate,
          });
        } else {
          Alert.alert("Error", "Bean not found. Returning to list.");
          router.back();
        }
      }
    } catch (error) {
      console.error("Error loading beans:", error);
      Alert.alert("Error", "Failed to load beans.");
    }
  }, [beanId, isEditing]);

  // Load beans when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Wrap async call in a non-async function
      const loadData = async () => {
          await loadAllBeans();
      };
      loadData();
      // Optional: Return cleanup function if needed
      return () => {}; 
    }, [loadAllBeans]) // Dependency remains the same
  );


  // Save the entire list of beans (used by add/update)
  const saveBeans = async (updatedBeans: Bean[]) => {
    try {
      const sortedBeans = updatedBeans.sort((a, b) => b.timestamp - a.timestamp);
      await AsyncStorage.setItem(BEANS_STORAGE_KEY, JSON.stringify(sortedBeans));
      // No need to setBeans state here as we navigate back
    } catch (error) {
      console.error("Error saving beans:", error);
      Alert.alert("Error", "Failed to save beans.");
      throw error; // Re-throw error to stop navigation if save fails
    }
  };

  // Add Bean Logic (modified slightly)
  const addBean = async () => {
    if (!newBean.name) {
      Alert.alert("Missing Information", "Please enter at least a name.");
      return;
    }
    setLoading(true);
    try {
      const beanToAdd: Bean = {
        id: Date.now().toString(),
        name: newBean.name!, 
        roastLevel: newBean.roastLevel || "unknown",
        flavorNotes: newBean.flavorNotes || [],
        description: newBean.description || "",
        photo: newBean.photo,
        timestamp: Date.now(), 
        roastedDate: newBean.roastedDate,
      };
      const updatedBeans = [...beans, beanToAdd];
      await saveBeans(updatedBeans); 
      Alert.alert("Success", "Bean added successfully!");
      router.back(); // Navigate back to the list screen
    } catch (error) {
      console.error("Error adding bean:", error);
      // Error already shown in saveBeans if it fails there
    }
    setLoading(false);
  };

  // Update Bean Logic (modified slightly)
  const updateBean = async () => {
    if (!beanId) return; 
    if (!newBean.name) {
      Alert.alert("Missing Information", "Please enter at least a name.");
      return;
    }

    setLoading(true);
    try {
      const updatedBeans = beans.map(bean => {
        if (bean.id === beanId) {
          return {
            ...bean, 
            name: newBean.name!,
            roastLevel: newBean.roastLevel || 'unknown',
            flavorNotes: newBean.flavorNotes || [],
            description: newBean.description || '',
            photo: newBean.photo,
            roastedDate: newBean.roastedDate,
          };
        }
        return bean; 
      });

      await saveBeans(updatedBeans); 
      Alert.alert("Success", "Bean updated successfully!");
      router.back(); // Navigate back
    } catch (error) {
      console.error("Error updating bean:", error);
      // Error already shown in saveBeans if it fails there
    }
    setLoading(false);
  };

  // Date Formatting
  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return 'N/A';
    try {
      return dayjs(timestamp).format('MMM D, YYYY');
    } catch (e) {
      console.error("Error formatting date with dayjs:", e);
      return 'Invalid Date';
    }
  };

  // Image Picking/Analysis Functions (copied directly)
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
    try {
      setAnalyzing(true);
      console.log("Analyzing photo...");
      // Pass the auth token to the analyzeImage function
      const extractedData = await analyzeImage(base64Image, token);
      console.log("Extracted data:", extractedData);
      const { beanName, roastLevel, flavorNotes, description } = extractedData;
      
      setNewBean((prev) => ({
        ...prev,
        name: beanName && beanName !== "Unknown" ? beanName : prev.name,
        roastLevel: roastLevel && roastLevel !== "Unknown" ? roastLevel : prev.roastLevel,
        flavorNotes: flavorNotes && flavorNotes.length > 0 ? flavorNotes : prev.flavorNotes,
        description: description && description !== "Unknown" ? description : prev.description,
      }));
      
      Alert.alert("Analysis Complete", "Bean information extracted from the photo!");
    } catch (error) {
      console.error("Error analyzing image:", error);
      Alert.alert("Analysis Error", "Could not analyze the image. Please try again or enter details manually.");
    } finally {
      setAnalyzing(false);
    }
  };


  // Form JSX
  return (
    <SafeAreaView className="flex-1 bg-soft-off-white" edges={["top", "left", "right"]}>
        {/* Custom Header */}
        <View className="flex-row items-center justify-between px-3 py-2.5 border-b border-pale-gray">
            <TouchableOpacity onPress={() => router.back()} className="p-2">
                <ChevronLeft size={24} color={themeColors['charcoal']} />
            </TouchableOpacity>
            <Text className="text-xl font-semibold text-charcoal">{isEditing ? 'Edit Bean' : 'Add New Bean'}</Text>
            <View className="w-10" /> {/* Spacer to balance title */}
        </View>

        {/* Use KeyboardAvoidingView here */}
        <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0} // Adjust offset if needed
        >
          <View className="flex-1"> {/* Container for ScrollView + Button */}
            <ScrollView
              className="px-3 pt-4" // Add top padding
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* Removed outer p-4, mb-4 from here */}
              {/* Photo Section */}
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
                    className="bg-light-beige border-pebble-gray flex-row items-center"
                  >
                    <Camera size={16} className="text-charcoal mr-1.5" strokeWidth={2} />
                    <Text className="text-charcoal text-sm">Camera</Text>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={pickImage}
                    className="bg-light-beige border-pebble-gray flex-row items-center"
                  >
                    <LucideImage size={16} className="text-charcoal mr-1.5" strokeWidth={2} />
                    <Text className="text-charcoal text-sm">Gallery</Text>
                  </Button>
                </View>
                {analyzing && (
                  <View className="absolute top-0 left-0 right-0 bottom-0 bg-charcoal/70 rounded-lg justify-center items-center">
                    <ActivityIndicator size="large" color="#D4E2D4" />
                    <Text className="mt-3 text-soft-off-white font-medium">Analyzing photo...</Text>
                  </View>
                )}
              </View>
              <View className="h-px bg-pale-gray my-4" />

              {/* Bean Name Input */}
              <View className="mb-2">
                <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Bean Name *</Text>
                <TextInput
                  value={newBean.name}
                  onChangeText={(text: string) => setNewBean({ ...newBean, name: text })}
                  placeholder="e.g., Ethiopia Yirgacheffe"
                  style={styles.inputStyle}
                  placeholderTextColor={themeColors['cool-gray-green']}
                />
              </View>

              {/* Roast Level Select */}
              <View className="mb-2 mt-4">
                <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Roast Level</Text>
                <Select
                  value={newBean.roastLevel ? { value: newBean.roastLevel, label: newBean.roastLevel } : undefined}
                  onValueChange={(option: { value: string; label: string } | undefined) => 
                    option && setNewBean({ ...newBean, roastLevel: option.value })
                  }
                >
                  <SelectTrigger className="border-pebble-gray bg-soft-off-white h-[50px]">
                    <SelectValue
                      className="text-charcoal"
                      placeholder="Select roast level"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="light" label="Light" />
                      <SelectItem value="medium-light" label="Medium Light" />
                      <SelectItem value="medium" label="Medium" />
                      <SelectItem value="medium-dark" label="Medium Dark" />
                      <SelectItem value="dark" label="Dark" />
                      <SelectItem value="unknown" label="Unknown" />
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>

              {/* Roasted Date Input */}
              <View className="mb-2 mt-4">
                <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Roasted Date</Text>
                <TouchableOpacity
                  onPress={() => setDatePickerOpen(true)}
                  className="border border-pebble-gray rounded-lg bg-soft-off-white h-[50px] justify-center px-2.5"
                  activeOpacity={0.7}
                >
                  <Text className={cn("text-base", newBean.roastedDate ? "text-charcoal" : "text-cool-gray-green")}>
                    {newBean.roastedDate ? formatDate(newBean.roastedDate) : "Select Roasted Date (Optional)"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Flavor Notes Input */}
              <View className="mb-2 mt-4">
                <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Flavor Notes (comma separated)</Text>
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
                  placeholderTextColor={themeColors['cool-gray-green']}
                />
              </View>

              {/* Description Input */}
              <View className="mb-2 mt-4">
                <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Description</Text>
                <TextInput
                  value={newBean.description}
                  onChangeText={(text: string) => setNewBean({ ...newBean, description: text })}
                  placeholder="Additional notes about this coffee"
                  multiline
                  numberOfLines={3}
                  style={[styles.inputStyle, { minHeight: 80, textAlignVertical: "top", paddingTop: 10 }]}
                  placeholderTextColor={themeColors['cool-gray-green']}
                />
              </View>
            </ScrollView>

            {/* Button container */}
            <View className="bg-soft-off-white py-2.5 px-4 border-t border-pale-gray shadow-lg">
              <Button
                variant="default"
                size="default"
                onPress={isEditing ? updateBean : addBean} // Use isEditing flag
                className="bg-muted-sage-green h-12"
                disabled={loading || !newBean.name}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold">{isEditing ? 'Save Changes' : 'Save Bean'}</Text>
                )}
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>

      {/* Date Picker Modal (using react-native-ui-datepicker) */}
      <Modal
        transparent={true}
        animationType="slide"
        visible={isDatePickerOpen}
        onRequestClose={() => setDatePickerOpen(false)}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          className="bg-black/30"
          onPress={() => setDatePickerOpen(false)}
          activeOpacity={1}
        />
        <View className="flex-1 justify-center items-center px-4">
          <View className="bg-soft-off-white rounded-xl shadow-xl w-full overflow-hidden">
            <View className="p-3 border-b border-pale-gray bg-light-beige/50 flex-row justify-between items-center">
              <Text className="text-lg font-semibold text-charcoal">Select Roasted Date</Text>
              <TouchableOpacity onPress={() => setDatePickerOpen(false)} className="p-1">
                <X size={20} color={themeColors['cool-gray-green']}/>
              </TouchableOpacity>
            </View>
            <View className="p-2">
              <DateTimePicker
                mode="single"
                date={newBean.roastedDate ? dayjs(newBean.roastedDate) : dayjs()}
                onChange={(params) => {
                  if (params.date) {
                    const selectedDate = dayjs(params.date);
                    if (selectedDate.isValid()) {
                      setNewBean(prev => ({ ...prev, roastedDate: selectedDate.valueOf() }));
                    } else {
                      console.warn("Invalid date selected from picker");
                    }
                  } else {
                    console.log("DateTimePicker onChange called without a date.");
                  }
                }}
                maxDate={dayjs()}
                classNames={{
                  ...defaultClassNames,
                  selected: `bg-muted-sage-green ${defaultClassNames.selected}`,
                  selected_label: `text-white ${defaultClassNames.selected_label}`
                }}
              />
            </View>
            <View className="px-4 pb-4 pt-2 border-t border-pale-gray">
              <Button onPress={() => setDatePickerOpen(false)} className="bg-muted-sage-green">
                <Text className="text-white font-bold">Done</Text>
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  inputStyle: {
    borderWidth: 1,
    borderColor: themeColors['pebble-gray'],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    backgroundColor: themeColors['soft-off-white'],
    color: themeColors['charcoal'],
    fontSize: 16,
    height: 50,
  }
}); 