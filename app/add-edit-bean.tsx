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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import DateTimePicker from 'react-native-ui-datepicker';
import { useDefaultClassNames } from 'react-native-ui-datepicker';
import dayjs from 'dayjs';
import * as api from '../lib/api';
import { Bean } from '../lib/api';

// --- Tailwind --- 
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../tailwind.config.js';

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.extend?.colors ?? fullConfig.theme?.colors ?? {}) as Record<string, string>; 
// --- End Tailwind ---

// Create an empty partial bean for initial state
const createEmptyPartialBean = (): Partial<Bean> => ({
  name: '',
  roaster: '',
  origin: '',
  process: '',
  roastLevel: '',
  roastedDate: null,
  flavorNotes: [],
  imageUrl: undefined,
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

  const [isEditing, setIsEditing] = useState(false);
  const [bean, setBean] = useState<Partial<Bean>>(createEmptyPartialBean());
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isDatePickerOpen, setDatePickerOpen] = useState(false);
  const defaultClassNames = useDefaultClassNames();
  const [analysisResults, setAnalysisResults] = useState<any | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Populate form if editing
  useEffect(() => {
    if (params.beanData) {
      try {
        const existingBean = JSON.parse(params.beanData) as Bean;
        setBean({
          id: existingBean.id, // Keep ID for updates
          name: existingBean.name,
          roaster: existingBean.roaster,
          origin: existingBean.origin,
          process: existingBean.process,
          roastLevel: existingBean.roastLevel,
          // Ensure roastedDate is compatible with DatePicker (needs Date object or undefined)
          roastedDate: existingBean.roastedDate ? dayjs(existingBean.roastedDate).toDate() : undefined, 
          flavorNotes: existingBean.flavorNotes,
          imageUrl: existingBean.imageUrl,
        });
        setIsEditing(true);
        console.log("Editing bean:", existingBean.id);
      } catch (e) {
        console.error("Failed to parse beanData param:", e);
        Alert.alert("Error", "Could not load bean data for editing.");
        router.back();
      }
    }
  }, [params.beanData]);

  // Set navigation title based on mode
  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Edit Bean' : 'Add New Bean',
      headerLeft: () => (
          <TouchableOpacity onPress={() => router.back()} className="ml-4">
              <ChevronLeft size={24} color={themeColors['cool-gray-green']} />
          </TouchableOpacity>
      ),
      headerTitleAlign: 'center',
    });
  }, [navigation, isEditing, router, themeColors]);

  // Unified Save/Update Bean Logic
  const handleSaveBean = async () => {
    if (!bean.name) {
      Alert.alert("Missing Information", "Please enter at least a name.");
      return;
    }
    setLoading(true);
    setErrorText(null);

    // Prepare data for API (exclude fields not needed for create/update)
    const beanDataToSave: Partial<Omit<Bean, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> = {
      name: bean.name,
      roaster: bean.roaster || null,
      origin: bean.origin || null,
      process: bean.process || null,
      roastLevel: bean.roastLevel || null,
      // Convert Date back to ISO string or null for API
      roastedDate: bean.roastedDate ? dayjs(bean.roastedDate).toISOString() : null,
      flavorNotes: bean.flavorNotes && bean.flavorNotes.length > 0 ? bean.flavorNotes.map(f => f.trim()).filter(f => f) : null,
      // We are not saving the image URL via this form for now
      // imageUrl: bean.imageUrl || null, 
    };

    try {
      if (isEditing && bean.id) {
        console.log("Updating bean:", bean.id, beanDataToSave);
        await api.updateBean(bean.id, beanDataToSave);
        Alert.alert("Success", "Bean updated successfully!");
      } else {
        console.log("Adding new bean:", beanDataToSave);
        await api.addBean(beanDataToSave);
        Alert.alert("Success", "Bean added successfully!");
      }
      router.back(); // Navigate back after success
    } catch (error: any) {
      console.error(`Error ${isEditing ? 'updating' : 'adding'} bean:`, error);
      setErrorText(`Failed to save bean: ${error.message || 'Unknown error'}`);
      Alert.alert("Error", `Failed to save bean: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Image Picking/Analysis Functions --- 
  // NOTE: analyzePhoto currently sets base64 to `newBean.photo`, but the DB uses `imageUrl` (text).
  // We need to decide how to handle images: 
  // 1. Upload elsewhere and store URL?
  // 2. Skip image saving from this form for now?
  // For now, analysis will populate fields, but the image itself won't be saved via addBean/updateBean.
  
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is required to take photos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, // Use constant
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          // We can set the base64 temporarily for display if needed, but won't save it directly
          // setBean((prev) => ({ ...prev, imageUrl: `data:image/jpeg;base64,${asset.base64}` })); 
          await analyzePhoto(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Could not take photo.");
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
          // We can set the base64 temporarily for display if needed, but won't save it directly
          // setBean((prev) => ({ ...prev, imageUrl: `data:image/jpeg;base64,${asset.base64}` })); 
          await analyzePhoto(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const analyzePhoto = async (base64Image: string) => {
    if (!base64Image) return;
    setAnalyzing(true);
    setErrorText(null);
    setAnalysisResults(null);
    try {
      // Assuming analyzeImage function is updated/available to call backend
      // We might need to move analyzeImage to lib/api.ts as well
      // For now, assuming it makes the call and returns parsed data
      
      // --- Placeholder for API Call --- 
      // Replace with actual call to backend /analyze-image endpoint
      // const results = await api.analyzeBeanImage(base64Image.split(',')[1]); 
      // console.log("Analysis Results:", results);
      // setAnalysisResults(results);
      // setNewBean(prev => ({ ...prev, ...results }));
      console.warn("analyzePhoto API call is not implemented yet. Populating with dummy data.");
      // Dummy data for testing UI population
      const dummyResults = {
          beanName: "Dummy Bean",
          country: "Dummy Origin",
          process: "Dummy Process",
          roastLevel: "Medium",
          flavorNotes: ["Dummy Note 1", "Dummy Note 2"]
      };
      setAnalysisResults(dummyResults);
      setBean(prev => ({
          ...prev,
          name: dummyResults.beanName || prev.name,
          origin: dummyResults.country || prev.origin,
          process: dummyResults.process || prev.process,
          roastLevel: dummyResults.roastLevel || prev.roastLevel,
          flavorNotes: dummyResults.flavorNotes || prev.flavorNotes,
      }));
      Alert.alert("Analysis Complete", "Bean details populated. Please review.");
      // --- End Placeholder ---

    } catch (err: any) {
      console.error("Error analyzing image:", err);
      setErrorText(`Analysis failed: ${err.message || 'Unknown error'}`);
      Alert.alert("Analysis Error", `Failed to analyze image: ${err.message || 'Unknown error'}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeBean = async (base64Image: string) => {
    if (!base64Image) return;
    setAnalyzing(true);
    setErrorText(null);
    setAnalysisResults(null);
    try {
      // Assuming analyzeImage function is updated/available to call backend
      // We might need to move analyzeImage to lib/api.ts as well
      // For now, assuming it makes the call and returns parsed data
      
      // --- Placeholder for API Call --- 
      // Replace with actual call to backend /analyze-image endpoint
      // const results = await api.analyzeBeanImage(base64Image.split(',')[1]); 
      // console.log("Analysis Results:", results);
      // setAnalysisResults(results);
      // setNewBean(prev => ({ ...prev, ...results }));
      console.warn("analyzeBean API call is not implemented yet. Populating with dummy data.");
      // Dummy data for testing UI population
      const dummyResults = {
          beanName: "Dummy Bean",
          country: "Dummy Origin",
          process: "Dummy Process",
          roastLevel: "Medium",
          flavorNotes: ["Dummy Note 1", "Dummy Note 2"]
      };
      setAnalysisResults(dummyResults);
      setBean(prev => ({
          ...prev,
          name: dummyResults.beanName || prev.name,
          origin: dummyResults.country || prev.origin,
          process: dummyResults.process || prev.process,
          roastLevel: dummyResults.roastLevel || prev.roastLevel,
          flavorNotes: dummyResults.flavorNotes || prev.flavorNotes,
      }));
      Alert.alert("Analysis Complete", "Bean details populated. Please review.");
      // --- End Placeholder ---

    } catch (err: any) {
      console.error("Error analyzing image:", err);
      setErrorText(`Analysis failed: ${err.message || 'Unknown error'}`);
      Alert.alert("Analysis Error", `Failed to analyze image: ${err.message || 'Unknown error'}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // --- Form Field Handlers ---
  const handleInputChange = (field: keyof Bean, value: any) => {
    // Special handling for flavorNotes if needed (e.g., splitting string)
    if (field === 'flavorNotes' && typeof value === 'string') {
        value = value.split(',').map(note => note.trim()).filter(note => note);
    }
    setBean(prev => ({ ...prev, [field]: value }));
  };

  // Date picker handler
  const onDateChange = (date: Date | undefined) => {
    if (date) {
        console.log("Selected date:", date);
        handleInputChange('roastedDate', date);
    } else {
        console.log("Date cleared");
        handleInputChange('roastedDate', null);
    }
    setDatePickerOpen(false);
  };
  
  // --- JSX ---
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} className="flex-1 bg-soft-off-white">
    {/* Header is now configured via useEffect -> navigation.setOptions */}
    {/* <View className="flex-row items-center p-3 border-b border-pale-gray bg-white">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
            <ChevronLeft size={24} color={themeColors['cool-gray-green']} />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-semibold text-charcoal">
            {isEditing ? 'Edit Bean' : 'Add New Bean'}
        </Text>
        <View className="w-6" /> 
    </View> */} 

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0} // Adjust offset if needed
      >
        <ScrollView 
            className="flex-1 px-4 pt-4" 
            contentContainerClassName="pb-10"
            keyboardShouldPersistTaps="handled"
        >
            {/* Image Section */}
            <View className="items-center mb-5">
                <TouchableOpacity 
                    onPress={pickImage} 
                    className={cn(
                        "w-40 h-40 rounded-full bg-light-beige border-2 border-dashed border-pebble-gray justify-center items-center mb-3",
                        bean.imageUrl && "border-solid border-muted-sage-green"
                    )}
                >
                    {bean.imageUrl ? (
                        <Image source={{ uri: bean.imageUrl }} className="w-full h-full rounded-full" />
                    ) : (
                        <LucideImage size={40} color={themeColors['cool-gray-green']} />
                    )}
                     {analyzing && (
                        <View style={StyleSheet.absoluteFill} className="bg-black/50 rounded-full justify-center items-center">
                            <ActivityIndicator size="large" color="#FFF" />
                        </View>
                    )} 
                </TouchableOpacity>
                <View className="flex-row space-x-4">
                    <Button variant="outline" size="sm" onPress={pickImage} disabled={analyzing} className="bg-white border-pebble-gray">
                        <LucideImage size={16} color={themeColors['charcoal']} className="mr-1.5"/>
                        <Text>Choose</Text>
                    </Button>
                    <Button variant="outline" size="sm" onPress={takePhoto} disabled={analyzing} className="bg-white border-pebble-gray">
                        <Camera size={16} color={themeColors['charcoal']} className="mr-1.5"/>
                        <Text>Take Photo</Text>
                    </Button>
                </View>
                 {analysisResults && (
                    <Text className="text-xs text-green-600 mt-2 text-center">Analysis complete. Fields populated.</Text>
                )} 
            </View>

            {/* Form Fields */}
             <View className="space-y-4 mb-6">
                <View>
                    <Text className="text-sm font-medium text-charcoal/80 mb-1.5 ml-1">Name*</Text>
                    <TextInput
                        value={bean.name}
                        onChangeText={(value) => handleInputChange('name', value)}
                        placeholder="Enter bean name (e.g., Sweet Bloom Hometown Blend)"
                        className="bg-white border border-cool-gray-light rounded-lg px-4 py-3 text-base text-charcoal placeholder:text-cool-gray-green focus:border-muted-sage-green focus:ring-1 focus:ring-muted-sage-green"
                    />
                </View>
                
                <View>
                    <Text className="text-sm font-medium text-charcoal/80 mb-1.5 ml-1">Roaster</Text>
                    <TextInput
                        value={bean.roaster || ''} // Handle null
                        onChangeText={(value) => handleInputChange('roaster', value)}
                        placeholder="Roaster Name (e.g., Sweet Bloom Coffee Roasters)"
                        className="bg-white border border-cool-gray-light rounded-lg px-4 py-3 text-base text-charcoal placeholder:text-cool-gray-green focus:border-muted-sage-green focus:ring-1 focus:ring-muted-sage-green"
                    />
                </View>
                
                 <View>
                    <Text className="text-sm font-medium text-charcoal/80 mb-1.5 ml-1">Origin</Text>
                    <TextInput
                        value={bean.origin || ''} // Handle null
                        onChangeText={(value) => handleInputChange('origin', value)}
                        placeholder="Origin (e.g., Ethiopia, Colombia)"
                        className="bg-white border border-cool-gray-light rounded-lg px-4 py-3 text-base text-charcoal placeholder:text-cool-gray-green focus:border-muted-sage-green focus:ring-1 focus:ring-muted-sage-green"
                    />
                </View>
                
                 <View>
                    <Text className="text-sm font-medium text-charcoal/80 mb-1.5 ml-1">Process</Text>
                    <TextInput
                        value={bean.process || ''} // Handle null
                        onChangeText={(value) => handleInputChange('process', value)}
                        placeholder="Processing Method (e.g., Washed, Natural)"
                        className="bg-white border border-cool-gray-light rounded-lg px-4 py-3 text-base text-charcoal placeholder:text-cool-gray-green focus:border-muted-sage-green focus:ring-1 focus:ring-muted-sage-green"
                    />
                </View>

                {/* Roast Level Select */}
                <View>
                   <Text className="text-sm font-medium text-charcoal/80 mb-1.5 ml-1">Roast Level</Text>
                   <Select 
                        selectedValue={bean.roastLevel || ''} 
                        onValueChange={(value) => handleInputChange('roastLevel', value)}
                   >
                        <SelectTrigger className="w-full bg-white border border-cool-gray-light rounded-lg px-4 py-3 text-base focus:border-muted-sage-green focus:ring-1 focus:ring-muted-sage-green">
                             <SelectValue 
                                className="text-charcoal placeholder:text-cool-gray-green"
                                placeholder="Select roast level" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem label="Light" value="Light">Light</SelectItem>
                                <SelectItem label="Medium-Light" value="Medium-Light">Medium-Light</SelectItem>
                                <SelectItem label="Medium" value="Medium">Medium</SelectItem>
                                <SelectItem label="Medium-Dark" value="Medium-Dark">Medium-Dark</SelectItem>
                                <SelectItem label="Dark" value="Dark">Dark</SelectItem>
                                <SelectItem label="Unknown" value="Unknown">Unknown</SelectItem>
                            </SelectGroup>
                        </SelectContent>
                   </Select>
                </View>

                {/* Roasted Date Picker */}
                <View>
                    <Text className="text-sm font-medium text-charcoal/80 mb-1.5 ml-1">Roasted Date</Text>
                    <TouchableOpacity 
                        onPress={() => setDatePickerOpen(true)} 
                        className="bg-white border border-cool-gray-light rounded-lg px-4 py-3 text-base flex-row justify-between items-center"
                    >
                        <Text className={cn(bean.roastedDate ? "text-charcoal" : "text-cool-gray-green")}>
                             {bean.roastedDate ? dayjs(bean.roastedDate).format('MMM D, YYYY') : 'Select roasted date'}
                        </Text>
                        {bean.roastedDate && (
                            <TouchableOpacity onPress={() => handleInputChange('roastedDate', null)} className="p-1">
                                <X size={16} color={themeColors['cool-gray-green']} />
                            </TouchableOpacity>
                        )}
                    </TouchableOpacity>
                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={isDatePickerOpen}
                        onRequestClose={() => setDatePickerOpen(false)}
                    >
                        <View className="flex-1 justify-end bg-black/50">
                            <View className="bg-white rounded-t-lg p-4">
                                <DateTimePicker
                                    mode="single"
                                    date={bean.roastedDate instanceof Date ? bean.roastedDate : undefined} // Pass Date object
                                    onChange={(params) => onDateChange(params.date as Date | undefined)}
                                    selectedItemColor={themeColors['muted-sage-green']}
                                    headerContainerStyle={{ backgroundColor: themeColors['soft-off-white']}}
                                    headerTextStyle={{ color: themeColors['charcoal'], fontWeight: '600'}}
                                    weekDaysTextStyle={{ color: themeColors['charcoal'], fontWeight: '500'}}
                                    calendarTextStyle={{ color: themeColors['charcoal']}}
                                    todayTextStyle={{ fontWeight: 'bold'}} // Example: style today's date
                                />
                                <Button variant="outline" onPress={() => setDatePickerOpen(false)} className="mt-2 border-pebble-gray">
                                    <Text className="text-charcoal">Close</Text>
                                </Button>
                            </View>
                        </View>
                    </Modal>
                </View>

                {/* Flavor Notes */}
                <View>
                    <Text className="text-sm font-medium text-charcoal/80 mb-1.5 ml-1">Flavor Notes</Text>
                    <TextInput
                        value={bean.flavorNotes?.join(', ') || ''} // Join array for display
                        onChangeText={(value) => handleInputChange('flavorNotes', value)} // Handle splitting in handler
                        placeholder="Comma-separated (e.g., chocolate, berry, nutty)"
                        className="bg-white border border-cool-gray-light rounded-lg px-4 py-3 text-base text-charcoal placeholder:text-cool-gray-green focus:border-muted-sage-green focus:ring-1 focus:ring-muted-sage-green"
                    />
                </View>

             </View>
            
            {/* Error Text */} 
            {errorText && (
                 <Text className="text-red-500 text-sm text-center mb-4">{errorText}</Text>
            )}

            {/* Save Button */}
            <Button 
                onPress={handleSaveBean} 
                disabled={loading || analyzing}
                className="bg-muted-sage-green py-3.5 rounded-lg"
            >
                {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                    <Text className="text-white font-bold text-lg">
                        {isEditing ? 'Update Bean' : 'Add Bean'}
                    </Text>
                )}
            </Button>

        </ScrollView>
      </KeyboardAvoidingView>
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