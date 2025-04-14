import React, { useState, useCallback } from 'react';
import { ScrollView, View, TouchableOpacity, FlatList, RefreshControl, Alert, TextInput, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '../../components/ui/button';
import { Text } from '../../components/ui/text';
import { Star, Trash2, Plus } from 'lucide-react-native';
import { cn } from '../../lib/utils';

// --- Tailwind --- 
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config.js'; // Adjust path if necessary

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.colors ?? {}) as Record<string, string>; 
// --- End Tailwind ---

// Storage keys
const BREW_DEVICES_STORAGE_KEY = '@GoodCup:brewDevices';
const GRINDERS_STORAGE_KEY = '@GoodCup:grinders';
const DEFAULT_BREW_DEVICE_KEY = '@GoodCup:defaultBrewDevice';
const DEFAULT_GRINDER_KEY = '@GoodCup:defaultGrinder';

// Interfaces
interface BrewDevice {
  id: string;
  name: string;
  type: string;
  notes?: string;
}

interface Grinder {
  id: string;
  name: string;
  type: string;
  notes?: string;
}

export default function SettingsScreen() {
  // OpenAI state
  // const [apiKey, setApiKey] = useState('');
  // const [apiKeyMasked, setApiKeyMasked] = useState(true);
  // const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  
  // Brew devices state
  const [brewDevices, setBrewDevices] = useState<BrewDevice[]>([]);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceType, setNewDeviceType] = useState('');
  const [newDeviceNotes, setNewDeviceNotes] = useState('');
  
  // Grinders state
  const [grinders, setGrinders] = useState<Grinder[]>([]);
  const [newGrinderName, setNewGrinderName] = useState('');
  const [newGrinderType, setNewGrinderType] = useState('');
  const [newGrinderNotes, setNewGrinderNotes] = useState('');
  
  // UI state
  const [addingDevice, setAddingDevice] = useState(false);
  const [addingGrinder, setAddingGrinder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Inside the component, add state for default selections
  const [defaultBrewDevice, setDefaultBrewDevice] = useState<string>('');
  const [defaultGrinder, setDefaultGrinder] = useState<string>('');

  // Load data
  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      // Load API Key
      // const storedApiKey = await getApiKey();
      // setSavedApiKey(storedApiKey);
      
      // Load brew devices
      const storedDevices = await AsyncStorage.getItem(BREW_DEVICES_STORAGE_KEY);
      if (storedDevices !== null) {
        setBrewDevices(JSON.parse(storedDevices));
      } else {
        // Default devices if none exist
        const defaultDevices: BrewDevice[] = [
          { id: '1', name: 'Hario Switch', type: 'Immersion/Pour Over', notes: 'Versatile brewer with ability to switch between immersion and pour over' },
          { id: '2', name: 'Aeropress', type: 'Immersion/Pressure', notes: 'Portable coffee maker with clean cup' }
        ];
        setBrewDevices(defaultDevices);
        await AsyncStorage.setItem(BREW_DEVICES_STORAGE_KEY, JSON.stringify(defaultDevices));
      }

      // Load grinders
      const storedGrinders = await AsyncStorage.getItem(GRINDERS_STORAGE_KEY);
      if (storedGrinders !== null) {
        setGrinders(JSON.parse(storedGrinders));
      } else {
        // Default grinders if none exist
        const defaultGrinders: Grinder[] = [
          { id: '1', name: '1Zpresso J-Max', type: 'Hand Grinder', notes: 'Premium hand grinder with 409 click adjustment' },
          { id: '2', name: 'Baratza Encore', type: 'Electric Grinder', notes: 'Entry-level electric burr grinder' }
        ];
        setGrinders(defaultGrinders);
        await AsyncStorage.setItem(GRINDERS_STORAGE_KEY, JSON.stringify(defaultGrinders));
      }

      // Load default selections
      const defaultDevice = await AsyncStorage.getItem(DEFAULT_BREW_DEVICE_KEY);
      if (defaultDevice) {
        setDefaultBrewDevice(defaultDevice);
      }
      
      const defaultGrinder = await AsyncStorage.getItem(DEFAULT_GRINDER_KEY);
      if (defaultGrinder) {
        setDefaultGrinder(defaultGrinder);
      }
    } catch (e) {
      console.error('Failed to load settings data', e);
    }
    setRefreshing(false);
  }, []);

  // Load data when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Save API Key
  // const handleSaveApiKey = async () => {
  //   try {
  //     await saveApiKey(apiKey);
  //     setSavedApiKey(apiKey);
  //     setApiKey('');
  //     Alert.alert('Success', 'API key saved successfully.');
  //   } catch (error) {
  //     console.error('Error saving API key:', error);
  //     Alert.alert('Error', 'Failed to save API key. Please try again.');
  //   }
  // };

  // // Remove API Key
  // const handleRemoveApiKey = async () => {
  //   try {
  //     await saveApiKey('');
  //     setSavedApiKey(null);
  //     setApiKey('');
  //     Alert.alert('Success', 'API key removed successfully.');
  //   } catch (error) {
  //     console.error('Error removing API key:', error);
  //     Alert.alert('Error', 'Failed to remove API key. Please try again.');
  //   }
  // };

  // Add new brew device
  const addBrewDevice = async () => {
    if (!newDeviceName || !newDeviceType) return;
    
    const newDevice: BrewDevice = {
      id: Date.now().toString(),
      name: newDeviceName,
      type: newDeviceType,
      notes: newDeviceNotes || undefined
    };
    
    const updatedDevices = [...brewDevices, newDevice];
    setBrewDevices(updatedDevices);
    await AsyncStorage.setItem(BREW_DEVICES_STORAGE_KEY, JSON.stringify(updatedDevices));
    
    // Reset form
    setNewDeviceName('');
    setNewDeviceType('');
    setNewDeviceNotes('');
    setAddingDevice(false);
  };

  // Add new grinder
  const addGrinder = async () => {
    if (!newGrinderName || !newGrinderType) return;
    
    const newGrinder: Grinder = {
      id: Date.now().toString(),
      name: newGrinderName,
      type: newGrinderType,
      notes: newGrinderNotes || undefined
    };
    
    const updatedGrinders = [...grinders, newGrinder];
    setGrinders(updatedGrinders);
    await AsyncStorage.setItem(GRINDERS_STORAGE_KEY, JSON.stringify(updatedGrinders));
    
    // Reset form
    setNewGrinderName('');
    setNewGrinderType('');
    setNewGrinderNotes('');
    setAddingGrinder(false);
  };

  // Delete brew device
  const handleRemoveBrewDevice = async (id: string) => {
    try {
      const updatedDevices = brewDevices.filter(device => device.id !== id);
      setBrewDevices(updatedDevices);
      await AsyncStorage.setItem(BREW_DEVICES_STORAGE_KEY, JSON.stringify(updatedDevices));
      
      // If default device is removed, clear the default
      if (defaultBrewDevice === id) {
        await AsyncStorage.removeItem(DEFAULT_BREW_DEVICE_KEY);
        setDefaultBrewDevice('');
      }
    } catch (error) {
      console.error('Error removing brew device:', error);
      Alert.alert('Error', 'Failed to remove brew device.');
    }
  };

  // Delete grinder
  const handleRemoveGrinder = async (id: string) => {
    try {
      const updatedGrinders = grinders.filter(grinder => grinder.id !== id);
      setGrinders(updatedGrinders);
      await AsyncStorage.setItem(GRINDERS_STORAGE_KEY, JSON.stringify(updatedGrinders));
      
      // If default grinder is removed, clear the default
      if (defaultGrinder === id) {
        await AsyncStorage.removeItem(DEFAULT_GRINDER_KEY);
        setDefaultGrinder('');
      }
    } catch (error) {
      console.error('Error removing grinder:', error);
      Alert.alert('Error', 'Failed to remove grinder.');
    }
  };

  // Add functions to set defaults
  const setAsDefaultBrewDevice = async (id: string) => {
    try {
      await AsyncStorage.setItem(DEFAULT_BREW_DEVICE_KEY, id);
      setDefaultBrewDevice(id);
      Alert.alert('Success', 'Default brew device set successfully.');
    } catch (error) {
      console.error('Error setting default brew device:', error);
      Alert.alert('Error', 'Failed to set default brew device.');
    }
  };

  const setAsDefaultGrinder = async (id: string) => {
    try {
      await AsyncStorage.setItem(DEFAULT_GRINDER_KEY, id);
      setDefaultGrinder(id);
      Alert.alert('Success', 'Default grinder set successfully.');
    } catch (error) {
      console.error('Error setting default grinder:', error);
      Alert.alert('Error', 'Failed to set default grinder.');
    }
  };

  // Render brew device item
  const renderBrewDeviceItem = ({ item }: { item: BrewDevice }) => (
    <View
      key={item.id}
      className="flex-row items-center justify-between py-3 border-b border-pale-gray"
    >
      <View className="flex-1 mr-2">
        <Text className="text-base text-charcoal">{item.name}</Text>
        <Text className="text-sm text-cool-gray-green">{item.type}</Text>
        {item.notes ? <Text className="text-xs text-cool-gray-green mt-1 italic">{item.notes}</Text> : null}
      </View>
      <View className="flex-row items-center">
        {defaultBrewDevice === item.id && (
          <View className="bg-muted-sage-green px-2 py-0.5 rounded-full mr-2">
            <Text className="text-charcoal text-xs font-medium">Default</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => setAsDefaultBrewDevice(item.id)}
          className="p-1 mr-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Star size={22} color={defaultBrewDevice === item.id ? themeColors['muted-sage-green'] : themeColors['pale-gray']} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleRemoveBrewDevice(item.id)}
          className="p-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Trash2 size={22} color={themeColors['cool-gray-green']} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render grinder item
  const renderGrinderItem = ({ item }: { item: Grinder }) => (
    <View
      key={item.id}
      className="flex-row items-center justify-between py-3 border-b border-pale-gray"
    >
      <View className="flex-1 mr-2">
        <Text className="text-base text-charcoal">{item.name}</Text>
        <Text className="text-sm text-cool-gray-green">{item.type}</Text>
        {item.notes ? <Text className="text-xs text-cool-gray-green mt-1 italic">{item.notes}</Text> : null}
      </View>
      <View className="flex-row items-center">
        {defaultGrinder === item.id && (
          <View className="bg-muted-sage-green px-2 py-0.5 rounded-full mr-2">
            <Text className="text-charcoal text-xs font-medium">Default</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => setAsDefaultGrinder(item.id)}
          className="p-1 mr-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Star size={22} color={defaultGrinder === item.id ? themeColors['muted-sage-green'] : themeColors['pale-gray']} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleRemoveGrinder(item.id)}
          className="p-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Trash2 size={22} color={themeColors['cool-gray-green']} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-soft-off-white" edges={['top', 'left', 'right']}>
      <View className="flex-1 bg-soft-off-white">
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={themeColors['cool-gray-green']} />}
        >
          <Text className="text-2xl font-semibold text-charcoal mb-4 mt-4">Settings</Text>
         
          
          {/* Divider */}
          {/* <View className="h-px bg-pale-gray mb-6" /> */}
          
          {/* Brew Devices Section */}
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-charcoal">Brew Devices</Text>
              {!addingDevice && (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => setAddingDevice(true)}
                  className="bg-light-beige border-pebble-gray"
                >
                  <Text className="text-charcoal">Add Device</Text>
                </Button>
              )}
            </View>
            
            {addingDevice ? (
              <View className="bg-white rounded-lg p-4 mb-4 shadow-sm border border-pale-gray">
                <TextInput
                  placeholder="Device Name (e.g., Hario Switch)"
                  value={newDeviceName}
                  onChangeText={setNewDeviceName}
                  placeholderTextColor={themeColors['cool-gray-green']}
                  className="border border-pale-gray rounded-md px-3 py-2 mb-2.5 bg-white text-charcoal"
                />
                <TextInput
                  placeholder="Device Type (e.g., Pour Over)"
                  value={newDeviceType}
                  onChangeText={setNewDeviceType}
                  placeholderTextColor={themeColors['cool-gray-green']}
                  className="border border-pale-gray rounded-md px-3 py-2 mb-2.5 bg-white text-charcoal"
                />
                <TextInput
                  placeholder="Notes (optional)"
                  value={newDeviceNotes}
                  onChangeText={setNewDeviceNotes}
                  placeholderTextColor={themeColors['cool-gray-green']}
                  className="border border-pale-gray rounded-md px-3 py-2 mb-3 bg-white text-charcoal h-20 align-top"
                  multiline
                  textAlignVertical="top"
                />
                <View className="flex-row justify-end gap-2">
                  <Button
                    variant="outline"
                    onPress={() => {
                      setAddingDevice(false);
                      setNewDeviceName('');
                      setNewDeviceType('');
                      setNewDeviceNotes('');
                    }}
                    className="bg-light-beige border-pebble-gray"
                  >
                    <Text className="text-charcoal">Cancel</Text>
                  </Button>
                  <Button
                    onPress={addBrewDevice}
                    className="bg-muted-sage-green"
                    disabled={!newDeviceName || !newDeviceType}
                  >
                    <Text className="text-white">Save</Text>
                  </Button>
                </View>
              </View>
            ) : null}
            
            <FlatList
              data={brewDevices}
              renderItem={renderBrewDeviceItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text className="text-center text-cool-gray-green my-4">
                  No brew devices added yet
                </Text>
              }
            />
          </View>
          
          {/* Divider */}
          <View className="h-px bg-pale-gray mb-6" />
          
          {/* Grinders Section */}
          <View className="pb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-charcoal">Grinders</Text>
              {!addingGrinder && (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => setAddingGrinder(true)}
                  className="bg-light-beige border-pebble-gray"
                >
                  <Text className="text-charcoal">Add Grinder</Text>
                </Button>
              )}
            </View>
            
            {addingGrinder ? (
              <View className="bg-white rounded-lg p-4 mb-4 shadow-sm border border-pale-gray">
                <TextInput
                  placeholder="Grinder Name (e.g., 1Zpresso J-Max)"
                  value={newGrinderName}
                  onChangeText={setNewGrinderName}
                  placeholderTextColor={themeColors['cool-gray-green']}
                  className="border border-pale-gray rounded-md px-3 py-2 mb-2.5 bg-white text-charcoal"
                />
                <TextInput
                  placeholder="Grinder Type (e.g., Hand Grinder)"
                  value={newGrinderType}
                  onChangeText={setNewGrinderType}
                  placeholderTextColor={themeColors['cool-gray-green']}
                  className="border border-pale-gray rounded-md px-3 py-2 mb-2.5 bg-white text-charcoal"
                />
                <TextInput
                  placeholder="Notes (optional)"
                  value={newGrinderNotes}
                  onChangeText={setNewGrinderNotes}
                  placeholderTextColor={themeColors['cool-gray-green']}
                  className="border border-pale-gray rounded-md px-3 py-2 mb-3 bg-white text-charcoal h-20 align-top"
                  multiline
                  textAlignVertical="top"
                />
                <View className="flex-row justify-end gap-2">
                  <Button
                    variant="outline"
                    onPress={() => {
                      setAddingGrinder(false);
                      setNewGrinderName('');
                      setNewGrinderType('');
                      setNewGrinderNotes('');
                    }}
                    className="bg-light-beige border-pebble-gray"
                  >
                    <Text className="text-charcoal">Cancel</Text>
                  </Button>
                  <Button
                    onPress={addGrinder}
                    className="bg-muted-sage-green"
                    disabled={!newGrinderName || !newGrinderType}
                  >
                    <Text className="text-white">Save</Text>
                  </Button>
                </View>
              </View>
            ) : null}
            
            <FlatList
              data={grinders}
              renderItem={renderGrinderItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text className="text-center text-cool-gray-green my-4">
                  No grinders added yet
                </Text>
              }
            />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
