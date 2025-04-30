import React, { useState, useCallback, useEffect } from 'react';
import { ScrollView, View, TouchableOpacity, FlatList, RefreshControl, Alert, TextInput, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '../../components/ui/button';
import { Text } from '../../components/ui/text';
import { Star, Trash2, Plus, LogOut, Info } from 'lucide-react-native';
import { cn } from '../../lib/utils';
import { Link } from 'expo-router';
import { Href } from 'expo-router';

// --- Import API functions ---
import * as api from '../../lib/api';
import { BrewDevice, Grinder } from '../../lib/api'; // Import interfaces

// --- Tailwind --- 
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config.js';

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.colors ?? {}) as Record<string, string>; 
// --- End Tailwind ---

export default function SettingsScreen() {
  const signOut = () => console.log("Sign Out Pressed - Placeholder"); // Placeholder

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
  const [loading, setLoading] = useState(true); // Add loading state
  const [error, setError] = useState<string | null>(null); // Add error state

  // Default selections state
  const [defaultBrewDeviceId, setDefaultBrewDeviceId] = useState<string | null>(null);
  const [defaultGrinderId, setDefaultGrinderId] = useState<string | null>(null);

  // Load data from API
  const loadData = useCallback(async (isRefreshing = false) => {
    if (!isRefreshing) setLoading(true);
    setRefreshing(isRefreshing);
    setError(null);
    try {
      // Fetch all data concurrently
      const [devicesData, grindersData, settingsData] = await Promise.all([
        api.getBrewDevices(),
        api.getGrinders(),
        api.getUserSettings()
      ]);
      setBrewDevices(devicesData);
      setGrinders(grindersData);
      setDefaultBrewDeviceId(settingsData.defaultBrewDeviceId);
      setDefaultGrinderId(settingsData.defaultGrinderId);
    } catch (e: any) {
      console.error('Failed to load settings data from API:', e);
      setError(`Failed to load data: ${e.message || 'Unknown error'}`);
      // Clear data on error? Or keep stale data? Clearing for now.
      setBrewDevices([]);
      setGrinders([]);
      setDefaultBrewDeviceId(null);
      setDefaultGrinderId(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load data when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]) // Dependency array includes loadData
  );
  
  const onRefresh = useCallback(() => {
      loadData(true); // Pass true to indicate it's a refresh pull
  }, [loadData]);


  // Add new brew device via API
  const addBrewDevice = async () => {
    if (!newDeviceName || !newDeviceType) return;
    setLoading(true); // Indicate loading
    try {
      const newDeviceData = {
        name: newDeviceName,
        type: newDeviceType,
        notes: newDeviceNotes || undefined
      };
      const addedDevice = await api.addBrewDevice(newDeviceData);
      setBrewDevices(prevDevices => [...prevDevices, addedDevice]); // Optimistically update UI
      
      // Reset form
      setNewDeviceName('');
      setNewDeviceType('');
      setNewDeviceNotes('');
      setAddingDevice(false);
    } catch (e: any) {
        console.error('Failed to add brew device:', e);
        Alert.alert('Error', `Failed to add device: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  // Add new grinder via API
  const addGrinder = async () => {
    if (!newGrinderName || !newGrinderType) return;
    setLoading(true);
    try {
      const newGrinderData = {
        name: newGrinderName,
        type: newGrinderType,
        notes: newGrinderNotes || undefined
      };
      const addedGrinder = await api.addGrinder(newGrinderData);
      setGrinders(prevGrinders => [...prevGrinders, addedGrinder]);
      
      setNewGrinderName('');
      setNewGrinderType('');
      setNewGrinderNotes('');
      setAddingGrinder(false);
    } catch (e: any) {
        console.error('Failed to add grinder:', e);
        Alert.alert('Error', `Failed to add grinder: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  // Delete brew device via API
  const handleRemoveBrewDevice = async (id: string) => {
    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to delete this brew device?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await api.deleteBrewDevice(id);
              setBrewDevices(prevDevices => prevDevices.filter(device => device.id !== id));
              
              // If default device is removed, update default state (API handles DB side)
              if (defaultBrewDeviceId === id) {
                setDefaultBrewDeviceId(null); 
                // Optionally call updateUserSettings({ defaultBrewDeviceId: null }) if backend doesn't use ON DELETE SET NULL or similar
              }
              Alert.alert('Success', 'Brew device deleted.');
            } catch (e: any) {
              console.error('Error removing brew device:', e);
              Alert.alert('Error', `Failed to remove brew device: ${e.message}`);
            } finally {
                setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Delete grinder via API
  const handleRemoveGrinder = async (id: string) => {
     Alert.alert(
      "Confirm Delete",
      "Are you sure you want to delete this grinder?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await api.deleteGrinder(id);
              setGrinders(prevGrinders => prevGrinders.filter(grinder => grinder.id !== id));
              
              // If default grinder is removed, update state
              if (defaultGrinderId === id) {
                setDefaultGrinderId(null);
                 // Optionally call updateUserSettings({ defaultGrinderId: null })
              }
               Alert.alert('Success', 'Grinder deleted.');
            } catch (e: any) {
              console.error('Error removing grinder:', e);
              Alert.alert('Error', `Failed to remove grinder: ${e.message}`);
            } finally {
                setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Set default brew device via API
  const setAsDefaultBrewDevice = async (id: string) => {
    // Avoid API call if already default
    if (id === defaultBrewDeviceId) return; 
    setLoading(true);
    try {
      await api.updateUserSettings({ defaultBrewDeviceId: id });
      setDefaultBrewDeviceId(id);
      Alert.alert('Success', 'Default brew device set successfully.');
    } catch (e: any) {
      console.error('Error setting default brew device:', e);
      Alert.alert('Error', `Failed to set default brew device: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  // Set default grinder via API
  const setAsDefaultGrinder = async (id: string) => {
     // Avoid API call if already default
    if (id === defaultGrinderId) return;
    setLoading(true);
    try {
      await api.updateUserSettings({ defaultGrinderId: id });
      setDefaultGrinderId(id);
      Alert.alert('Success', 'Default grinder set successfully.');
    } catch (e: any) {
      console.error('Error setting default grinder:', e);
      Alert.alert('Error', `Failed to set default grinder: ${e.message}`);
    } finally {
        setLoading(false);
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
        <Text className="text-sm text-cool-gray-green">{item.type || 'Unknown Type'}</Text> 
        {item.notes ? <Text className="text-xs text-cool-gray-green mt-1 italic">{item.notes}</Text> : null}
      </View>
      <View className="flex-row items-center">
        {/* Check against defaultBrewDeviceId state */}
        {defaultBrewDeviceId === item.id && ( 
          <View className="bg-muted-sage-green px-2 py-0.5 rounded-full mr-2">
            <Text className="text-charcoal text-xs font-medium">Default</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => setAsDefaultBrewDevice(item.id)}
          className="p-1 mr-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={loading || defaultBrewDeviceId === item.id} // Disable if loading or already default
        >
          <Star size={22} color={defaultBrewDeviceId === item.id ? themeColors['muted-sage-green'] : themeColors['pale-gray']} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleRemoveBrewDevice(item.id)}
          className="p-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={loading} // Disable if loading
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
        <Text className="text-sm text-cool-gray-green">{item.type || 'Unknown Type'}</Text>
        {item.notes ? <Text className="text-xs text-cool-gray-green mt-1 italic">{item.notes}</Text> : null}
      </View>
      <View className="flex-row items-center">
        {/* Check against defaultGrinderId state */}
        {defaultGrinderId === item.id && (
          <View className="bg-muted-sage-green px-2 py-0.5 rounded-full mr-2">
            <Text className="text-charcoal text-xs font-medium">Default</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => setAsDefaultGrinder(item.id)}
          className="p-1 mr-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={loading || defaultGrinderId === item.id} // Disable if loading or already default
        >
          <Star size={22} color={defaultGrinderId === item.id ? themeColors['muted-sage-green'] : themeColors['pale-gray']} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleRemoveGrinder(item.id)}
          className="p-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={loading} // Disable if loading
        >
          <Trash2 size={22} color={themeColors['cool-gray-green']} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Handle Sign Out
  const handleSignOut = async () => {
    Alert.alert(
      "Confirm Sign Out",
      "Are you sure you want to sign out?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Sign Out",
          onPress: async () => {
            try {
              await signOut(); 
              // Navigation back to login happens automatically due to AuthProvider state change (if using context)
              // OR: Need explicit navigation if not using context provider pattern for auth state
              // Example: navigation.navigate('Login'); 
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
          style: "destructive",
        }
      ]
    );
  };

  // --- Render Loading/Error States ---
  if (loading && !refreshing) { // Show initial loading indicator
    return (
      <SafeAreaView className="flex-1 bg-soft-off-white justify-center items-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={themeColors['cool-gray-green']} />
        <Text className="mt-2 text-cool-gray-green">Loading Settings...</Text>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView className="flex-1 bg-soft-off-white" edges={['top', 'left', 'right']}>
      <View className="flex-1 bg-soft-off-white">
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          // Use onRefresh callback
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors['cool-gray-green']} />} 
        >
          <Text className="text-2xl font-semibold text-charcoal mb-4 mt-4">Settings</Text>
         
          {/* Display error message if any */}
          {error && (
             <View className="bg-red-100 border border-red-300 p-3 rounded-md mb-4">
                <Text className="text-red-700">{error}</Text>
             </View>
          )}
          
          {/* Brew Devices Section */}
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-charcoal">Brew Devices</Text>
              {/* Disable Add button while loading/adding */}
              {!addingDevice && ( 
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => setAddingDevice(true)}
                  className="bg-light-beige border-pebble-gray"
                  disabled={loading} 
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
                    disabled={loading} // Disable while loading
                  >
                    <Text className="text-charcoal">Cancel</Text>
                  </Button>
                  <Button
                    onPress={addBrewDevice}
                    className="bg-muted-sage-green"
                    // Disable based on state AND loading status
                    disabled={!newDeviceName || !newDeviceType || loading} 
                  >
                    {/* Show spinner if saving */}
                    {loading ? <ActivityIndicator size="small" color="#ffffff" className="mr-2"/> : null} 
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
                !loading && !refreshing && brewDevices.length === 0 ? (
                    <View className="items-center my-4 p-4 bg-light-beige/50 rounded-lg border border-dashed border-pale-gray">
                        <Text className="text-center text-cool-gray-green mb-3">
                            No brew devices added yet. Add common ones?
                        </Text>
                        <View className="flex-row gap-2">
                             <Button 
                                size="sm" 
                                variant="outline"
                                className="bg-white border-pebble-gray"
                                onPress={() => {
                                    setNewDeviceName('Hario Switch');
                                    setNewDeviceType('Pour Over / Immersion');
                                    setNewDeviceNotes(''); // Clear notes
                                    setAddingDevice(true);
                                }}
                            >
                                <Text className="text-charcoal">Hario Switch</Text>
                            </Button>
                             {/* Add more suggestions if needed */}
                        </View>
                    </View>
                ) : null
              }
            />
          </View>
          
          {/* Divider */}
          <View className="h-px bg-pale-gray mb-6" />
          
          {/* Grinders Section */}
          <View className="pb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-charcoal">Grinders</Text>
               {/* Disable Add button while loading/adding */}
              {!addingGrinder && (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => setAddingGrinder(true)}
                  className="bg-light-beige border-pebble-gray"
                   disabled={loading}
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
                    disabled={loading} // Disable while loading
                  >
                    <Text className="text-charcoal">Cancel</Text>
                  </Button>
                  <Button
                    onPress={addGrinder}
                    className="bg-muted-sage-green"
                    // Disable based on state AND loading status
                    disabled={!newGrinderName || !newGrinderType || loading} 
                  >
                    {/* Show spinner if saving */}
                    {loading ? <ActivityIndicator size="small" color="#ffffff" className="mr-2"/> : null} 
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
                 !loading && !refreshing && grinders.length === 0 ? ( 
                     <View className="items-center my-4 p-4 bg-light-beige/50 rounded-lg border border-dashed border-pale-gray">
                        <Text className="text-center text-cool-gray-green mb-3">
                            No grinders added yet. Add common ones?
                        </Text>
                         <View className="flex-row gap-2">
                             <Button 
                                size="sm" 
                                variant="outline"
                                className="bg-white border-pebble-gray"
                                onPress={() => {
                                    setNewGrinderName('1Zpresso J-Max');
                                    setNewGrinderType('Hand Grinder');
                                    setNewGrinderNotes(''); // Clear notes
                                    setAddingGrinder(true);
                                }}
                             >
                                <Text className="text-charcoal">1Zpresso J-Max</Text>
                            </Button>
                            {/* Add more suggestions if needed */}
                        </View>
                    </View>
                 ) : null
              }
            />
          </View>
          
          {/* Divider */}
          <View className="h-px bg-pale-gray mb-6" />

          {/* About Button */}
          <Link href={"/about" as any} asChild>
            <Button 
              variant="outline"
              className="flex-row items-center justify-center bg-light-beige border-pebble-gray mb-4"
            >
              <Info size={18} color={themeColors['charcoal']} className="mr-2" />
              <Text className="text-charcoal font-semibold">About This App</Text>
            </Button>
          </Link>

          {/* Sign Out Button */}
          <Button 
            variant="destructive"
            onPress={handleSignOut} 
            className="flex-row items-center justify-center bg-red-100 border border-red-300"
          >
            <LogOut size={18} color={themeColors['red-600']} className="mr-2" />
            <Text className="text-red-600 font-semibold">Sign Out</Text>
          </Button>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
