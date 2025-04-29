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
  LogBox,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, useLocalSearchParams, useNavigation, Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Button } from "../components/ui/button";
import { Text } from "../components/ui/text";
import { Camera, Image as LucideImage, X, ChevronLeft } from "lucide-react-native";
import { cn } from "../lib/utils";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Option } from "../components/ui/select";
import DateTimePicker from 'react-native-ui-datepicker';
import { useDefaultClassNames } from 'react-native-ui-datepicker';
import dayjs from 'dayjs';
import * as api from '../lib/api';
import { Bean } from '../lib/api';
import { useAuth } from '../lib/auth';
import { analyzeImage } from '../lib/openai';

// --- Tailwind --- 
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../tailwind.config.js';

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.extend?.colors ?? fullConfig.theme?.colors ?? {}) as Record<string, string>; 
// --- End Tailwind ---

// Create an empty partial bean matching API structure for initial state
const createEmptyPartialApiBean = (): Partial<Bean> => ({
  name: '',
  origin: '',
  roastLevel: '',
  roastedDate: null, // Use null for API compatibility
  flavorNotes: [],
  imageUrl: null, // Use null for API compatibility
  description: null, // Add description
  // id, userId, createdAt, updatedAt are handled by backend/DB
});

export default function AddEditBeanScreen() {
  // Hide the default header which is causing duplication
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <BeanEditor />
    </>
  );
}

function BeanEditor() {
  const router = useRouter();
  const params = useLocalSearchParams<{ beanData?: string }>();
  const navigation = useNavigation();
  const { token } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [bean, setBean] = useState<Partial<Bean>>(createEmptyPartialApiBean());
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isDatePickerOpen, setDatePickerOpen] = useState(false);
  const defaultClassNames = useDefaultClassNames();
  const [analysisResults, setAnalysisResults] = useState<any | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (params.beanData) {
      try {
        const existingBean = JSON.parse(params.beanData) as Bean;
        setBean({
          id: existingBean.id,
          name: existingBean.name || '',
          origin: existingBean.origin || '',
          roastLevel: existingBean.roastLevel || '',
          roastedDate: existingBean.roastedDate || null,
          flavorNotes: existingBean.flavorNotes || [],
          imageUrl: existingBean.imageUrl || null,
          description: existingBean.description || null, // Load description
        });
        setIsEditing(true);
        console.log("Editing bean:", existingBean.id);
      } catch (e) {
        console.error("Failed to parse beanData param:", e);
        Alert.alert("Error", "Could not load bean data for editing.");
        router.back();
      }
    } else {
      setBean(createEmptyPartialApiBean());
      setIsEditing(false);
    }
  }, [params.beanData]);

  const handleSaveBean = async () => {
    if (!bean.name) {
      Alert.alert("Missing Information", "Please enter at least a name.");
      return;
    }
    setLoading(true);
    setErrorText(null);

    const beanDataToSave: Partial<Omit<Bean, 'id' | 'userId' | 'createdAt' | 'updatedAt'> | Omit<Bean, 'userId' | 'createdAt' | 'updatedAt'>> = {
      name: bean.name,
      origin: bean.origin || null,
      roastLevel: bean.roastLevel || null,
      roastedDate: bean.roastedDate || null,
      flavorNotes: bean.flavorNotes && bean.flavorNotes.length > 0 ? bean.flavorNotes.map(f => f.trim()).filter(f => f) : null,
      imageUrl: bean.imageUrl || null,
      description: bean.description || null, // Save description
    };

    try {
      if (isEditing && bean.id) {
        console.log("Updating bean via API:", bean.id, beanDataToSave);
        await api.updateBean(bean.id, beanDataToSave);
        Alert.alert("Success", "Bean updated successfully!");
      } else {
        console.log("Adding new bean via API:", beanDataToSave);
        await api.addBean(beanDataToSave);
        Alert.alert("Success", "Bean added successfully!");
      }
      router.back();
    } catch (error: any) {
      console.error(`API Error ${isEditing ? 'updating' : 'adding'} bean:`, error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setErrorText(`Failed to save bean: ${message}`);
      Alert.alert("Error", `Failed to save bean: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is required."); return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [4, 3], quality: 0.7, base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          await analyzePhoto(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch (error) { console.error("Error taking photo:", error); Alert.alert("Error", "Could not take photo."); }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Media library permission is required."); return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [4, 3], quality: 0.7, base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          await analyzePhoto(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch (error) { console.error("Error picking image:", error); Alert.alert("Error", "Failed to pick image."); }
  };

  const analyzePhoto = async (base64Image: string) => {
    if (!base64Image) return;
    setAnalyzing(true);
    setErrorText(null);
    setAnalysisResults(null);
    try {
      if (!token) {
        setErrorText("Authentication required. Please sign in.");
        Alert.alert("Authentication Error", "You need to be signed in to analyze images.");
        setAnalyzing(false);
        return;
      }

      console.log("Calling analyzeImage API...");
      const results = await analyzeImage(base64Image, token);

      console.log("Analysis Results from API:", results);
      setAnalysisResults(results);

      setBean(prev => ({
          ...prev,
          name: results.beanName || prev.name,
          origin: results.origin || prev.origin,
          roastLevel: results.roastLevel || prev.roastLevel,
          roastedDate: results.roastedDate && dayjs(results.roastedDate).isValid() ? dayjs(results.roastedDate).toISOString() : prev.roastedDate,
          flavorNotes: results.flavorNotes || prev.flavorNotes,
          description: results.description || prev.description,
      }));
      Alert.alert("Analysis Complete", "Bean details populated. Please review.");

    } catch (err: any) {
      console.error("Error analyzing image:", err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setErrorText(`Analysis failed: ${message}`);
      Alert.alert("Analysis Error", `Failed to analyze image: ${message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleInputChange = (field: keyof Bean, value: any) => {
    if (field === 'flavorNotes' && typeof value === 'string') {
        value = value.split(',').map(note => note.trim()).filter(note => note);
    }
    setBean(prev => ({ ...prev, [field]: value }));
  };

  const onDateChange = (date: Date | undefined) => {
    setDatePickerOpen(false);
    if (date) {
        console.log("Selected date object:", date);
        handleInputChange('roastedDate', dayjs(date).toISOString());
    } else {
        console.log("Date cleared");
        handleInputChange('roastedDate', null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-soft-off-white" edges={["top", "left", "right"]}>
        <View className="flex-row items-center justify-between px-3 py-2.5 border-b border-pale-gray">
            <TouchableOpacity onPress={() => router.back()} className="p-2">
                <ChevronLeft size={24} color={themeColors['charcoal']} />
            </TouchableOpacity>
            <Text className="text-xl font-semibold text-charcoal">{isEditing ? 'Edit Bean' : 'Add New Bean'}</Text>
            <View className="w-10" /> {/* Spacer to balance title */}
        </View>

        <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0} // Adjust offset if needed
        >
          <View className="flex-1"> {/* Container for ScrollView + Button - From Old Version */}
            <ScrollView
              className="px-3 pt-4" // Add top padding - From Old Version
              contentContainerStyle={{ paddingBottom: 20 }} // From Old Version
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              <View className="relative items-center mb-4">
                {bean.imageUrl ? (
                  <Image
                    source={{ uri: bean.imageUrl }} // Use bean.imageUrl
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
                    disabled={analyzing} // Disable while analyzing
                    className="bg-light-beige border-pebble-gray flex-row items-center"
                  >
                    <Camera size={16} className="text-charcoal mr-1.5" strokeWidth={2} />
                    <Text className="text-charcoal text-sm">Camera</Text>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={pickImage}
                    disabled={analyzing} // Disable while analyzing
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

              <View className="mb-2">
                <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Bean Name *</Text>
                <TextInput
                  value={bean.name} // Use bean.name
                  onChangeText={(text: string) => handleInputChange('name', text)}
                  placeholder="e.g., Ethiopia Yirgacheffe"
                  style={styles.inputStyle}
                  placeholderTextColor={themeColors['cool-gray-green']}
                />
              </View>

               <View className="mb-2 mt-4">
                <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Origin</Text>
                <TextInput
                  value={bean.origin || ''} // Use bean.origin
                  onChangeText={(text: string) => handleInputChange('origin', text)}
                  placeholder="Origin (e.g., Ethiopia, Colombia)"
                  style={styles.inputStyle}
                  placeholderTextColor={themeColors['cool-gray-green']}
                />
              </View>

              <View className="mb-2 mt-4">
                <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Roast Level</Text>
                <Select
                  value={bean.roastLevel ? { value: bean.roastLevel, label: bean.roastLevel } : undefined} // Use bean.roastLevel
                  onValueChange={(option: Option | undefined) =>
                    handleInputChange('roastLevel', option?.value ?? null) // Update bean.roastLevel
                  }
                >
                   <SelectTrigger className="border-pebble-gray bg-soft-off-white h-[50px] w-full">
                     <SelectValue
                       className="text-charcoal text-base placeholder:text-cool-gray-green placeholder:text-base"
                       placeholder="Select roast level"
                     />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectGroup>
                        {/* Values from previous Select - ensure they match potential API values */}
                       <SelectItem value="Light" label="Light" />
                       <SelectItem value="Medium-Light" label="Medium-Light" />
                       <SelectItem value="Medium" label="Medium" />
                       <SelectItem value="Medium-Dark" label="Medium-Dark" />
                       <SelectItem value="Dark" label="Dark" />
                       <SelectItem value="Unknown" label="Unknown" />
                     </SelectGroup>
                   </SelectContent>
                 </Select>
               </View>

               <View className="mb-2 mt-4">
                 <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Roasted Date</Text>
                 <TouchableOpacity
                   onPress={() => setDatePickerOpen(true)}
                   className="border border-pebble-gray rounded-lg bg-soft-off-white h-[50px] justify-center px-2.5"
                   activeOpacity={0.7}
                 >
                    {/* Display formatted date from bean.roastedDate (ISO string) */}
                   <Text className={cn("text-base", bean.roastedDate ? "text-charcoal" : "text-cool-gray-green")}>
                     {bean.roastedDate ? dayjs(bean.roastedDate).format('MMM D, YYYY') : "Select Roasted Date (Optional)"}
                   </Text>
                    {/* Add clear button if needed (optional enhancement) */}
                    {/* {bean.roastedDate && (
                       <TouchableOpacity onPress={() => handleInputChange('roastedDate', null)} className="absolute right-2 p-1">
                           <X size={16} color={themeColors['cool-gray-green']} />
                       </TouchableOpacity>
                   )} */}
                 </TouchableOpacity>
               </View>

               <View className="mb-2 mt-4">
                 <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Flavor Notes (comma separated)</Text>
                 <TextInput
                   value={bean.flavorNotes?.join(", ") || ''} // Use bean.flavorNotes
                   onChangeText={(text: string) => handleInputChange('flavorNotes', text)}
                   placeholder="e.g., Blueberry, Chocolate, Citrus"
                   style={styles.inputStyle}
                   placeholderTextColor={themeColors['cool-gray-green']}
                 />
               </View>

               {/* Description Input - Added */}
               <View className="mb-2 mt-4">
                 <Text className="text-sm font-semibold text-cool-gray-green mb-1.5 ml-1">Description</Text>
                 <TextInput
                   value={bean.description || ''} // Use bean.description
                   onChangeText={(text: string) => handleInputChange('description', text)}
                   placeholder="Additional notes about this coffee"
                   multiline
                   numberOfLines={3} // Suggests a minimum height
                   style={[styles.inputStyle, { minHeight: 80, textAlignVertical: "top", paddingTop: 10 }]} // Apply base style + multiline adjustments
                   placeholderTextColor={themeColors['cool-gray-green']}
                 />
               </View>

              {/* Error Text Display */}
              {errorText && (
                  <Text className="text-red-500 text-sm text-center my-3">{errorText}</Text>
              )}

             </ScrollView>

             <View className="bg-soft-off-white py-2.5 px-4 border-t border-pale-gray shadow-lg">
               <Button
                 variant="default"
                 size="default"
                 onPress={handleSaveBean} // Use new save handler
                 className="bg-muted-sage-green h-12"
                 disabled={loading || analyzing || !bean.name} // Use new loading/analyzing states
               >
                 {loading ? (
                   <ActivityIndicator color="#FFFFFF" />
                 ) : (
                   <Text className="text-white font-bold text-lg">{isEditing ? 'Update Bean' : 'Add Bean'}</Text> // Adjusted text size
                 )}
               </Button>
             </View>
           </View>
         </KeyboardAvoidingView>

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
                  // Use bean.roastedDate (ISO string) converted to Date, or undefined
                 date={bean.roastedDate ? dayjs(bean.roastedDate).toDate() : undefined}
                 onChange={(params) => {
                    // Use the existing onDateChange handler
                   onDateChange(params.date as Date | undefined);
                 }}
                 maxDate={dayjs().toDate()} // Set maxDate to today
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