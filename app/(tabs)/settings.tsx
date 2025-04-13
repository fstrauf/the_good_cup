import React, { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, View, TouchableOpacity, FlatList, RefreshControl, Alert, TextInput, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '../../components/ui/button';
import { Text } from '../../components/ui/text';
// import { Icon } from '@rneui/base';
import { Star, Trash2 } from 'lucide-react-native';

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
    <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Text className="text-base">{item.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {defaultBrewDevice === item.id && (
          <View className="bg-green-500 px-2 py-0.5 rounded-xl mr-2.5">
            <Text className="text-white text-xs">Default</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => setAsDefaultBrewDevice(item.id)}
          style={{ marginRight: 10 }}
        >
          <Star size={24} color={defaultBrewDevice === item.id ? '#ffc107' : '#e0e0e0'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleRemoveBrewDevice(item.id)}>
          <Trash2 size={24} color="#f44336" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render grinder item
  const renderGrinderItem = ({ item }: { item: Grinder }) => (
    <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Text className="text-base">{item.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {defaultGrinder === item.id && (
          <View className="bg-green-500 px-2 py-0.5 rounded-xl mr-2.5">
            <Text className="text-white text-xs">Default</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => setAsDefaultGrinder(item.id)}
          style={{ marginRight: 10 }}
        >
          <Star size={24} color={defaultGrinder === item.id ? '#ffc107' : '#e0e0e0'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleRemoveGrinder(item.id)}>
          <Trash2 size={24} color="#f44336" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-transparent" edges={['top', 'left', 'right']}>
      <View className="flex-1 bg-[#f5f5f5]">
        <ScrollView
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
        >
          <Text className="text-2xl font-semibold text-[#333] mb-4 mt-2">Settings</Text>
          
          {/* OpenAI API Key Section */}
          {/* <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 12 }}>
              Brew Suggestions (OpenAI)
            </Text>
            <Card containerStyle={{
              borderRadius: 10,
              padding: 16,
              elevation: 1,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 2,
              marginBottom: 0
            }}>
              <Text style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
                Enter your OpenAI API key to get AI-powered suggestions for improving your coffee brews.
              </Text>
              
              <Input
                placeholder="Enter OpenAI API Key"
                value={apiKey}
                onChangeText={setApiKey}
                secureTextEntry={apiKeyMasked}
                rightIcon={{
                  type: 'ionicon',
                  name: apiKeyMasked ? 'eye-off-outline' : 'eye-outline',
                  onPress: () => setApiKeyMasked(!apiKeyMasked)
                }}
                containerStyle={{ paddingHorizontal: 0 }}
                inputContainerStyle={{ 
                  borderWidth: 1, 
                  borderColor: '#e1e1e1', 
                  borderRadius: 8, 
                  paddingHorizontal: 10 
                }}
              />
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontSize: 14, color: '#666' }}>
                  Status: {savedApiKey ? 'API Key Saved ✓' : 'No API Key Saved'}
                </Text>
                {savedApiKey && (
                  <TouchableOpacity onPress={handleRemoveApiKey}>
                    <Text style={{ color: '#ff6b6b', fontSize: 14 }}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              <Button
                title="Save API Key"
                onPress={handleSaveApiKey}
                disabled={!apiKey}
                buttonStyle={{ 
                  borderRadius: 8, 
                  marginTop: 16,
                  backgroundColor: '#2089dc' 
                }}
              />
              
              <Text style={{ fontSize: 12, color: '#888', marginTop: 12, textAlign: 'center' }}>
                Your API key is stored securely on your device only.
              </Text>
            </Card>
          </View> */}
          
          <View className="h-px bg-gray-300 mb-6" /> {/* Divider */}
          
          {/* Brew Devices Section */}
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-[#333]">Brew Devices</Text>
              {!addingDevice ? (
                <TouchableOpacity onPress={() => setAddingDevice(true)}>
                  <Text className="text-[#2089dc] text-sm">Add Device</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            
            {addingDevice ? (
              <View className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-200">
                <TextInput
                  placeholder="Device Name (e.g., Hario Switch)"
                  value={newDeviceName}
                  onChangeText={setNewDeviceName}
                  style={styles.input}
                />
                <TextInput
                  placeholder="Device Type (e.g., Pour Over)"
                  value={newDeviceType}
                  onChangeText={setNewDeviceType}
                  style={styles.input}
                />
                <TextInput
                  placeholder="Notes (optional)"
                  value={newDeviceNotes}
                  onChangeText={setNewDeviceNotes}
                  style={[styles.input, styles.textArea]}
                  multiline
                />
                <View className="flex-row justify-end gap-2">
                  <Button
                    onPress={() => {
                      setAddingDevice(false);
                      setNewDeviceName('');
                      setNewDeviceType('');
                      setNewDeviceNotes('');
                    }}
                    className="bg-white border border-[#2089dc] rounded-lg"
                  >
                    <Text className="text-[#2089dc]">Cancel</Text>
                  </Button>
                  <Button
                    onPress={addBrewDevice}
                    className="bg-[#2089dc] rounded-lg"
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
                <Text className="text-center text-gray-500 my-4">
                  No brew devices added yet
                </Text>
              }
            />
          </View>
          
          <View className="h-px bg-gray-300 mb-6" /> {/* Divider */}
          
          {/* Grinders Section */}
          <View>
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-[#333]">Grinders</Text>
              {!addingGrinder ? (
                <TouchableOpacity onPress={() => setAddingGrinder(true)}>
                  <Text className="text-[#2089dc] text-sm">Add Grinder</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            
            {addingGrinder ? (
              <View className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-200">
                <TextInput
                  placeholder="Grinder Name (e.g., 1Zpresso J-Max)"
                  value={newGrinderName}
                  onChangeText={setNewGrinderName}
                  style={styles.input}
                />
                <TextInput
                  placeholder="Grinder Type (e.g., Hand Grinder)"
                  value={newGrinderType}
                  onChangeText={setNewGrinderType}
                  style={styles.input}
                />
                <TextInput
                  placeholder="Notes (optional)"
                  value={newGrinderNotes}
                  onChangeText={setNewGrinderNotes}
                  style={[styles.input, styles.textArea]}
                  multiline
                />
                <View className="flex-row justify-end gap-2">
                  <Button
                    onPress={() => {
                      setAddingGrinder(false);
                      setNewGrinderName('');
                      setNewGrinderType('');
                      setNewGrinderNotes('');
                    }}
                    className="bg-white border border-[#2089dc] rounded-lg"
                  >
                    <Text className="text-[#2089dc]">Cancel</Text>
                  </Button>
                  <Button
                    onPress={addGrinder}
                    className="bg-[#2089dc] rounded-lg"
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
                <Text className="text-center text-gray-500 my-4">
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

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
  },
});
