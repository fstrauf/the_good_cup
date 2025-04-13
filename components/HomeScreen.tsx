import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, Text, Platform, Alert, View, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dropdown } from 'react-native-element-dropdown';
import { Input, Slider, Switch, Card, Divider, Button as RNEButton } from '@rneui/themed';
import { getBrewSuggestions } from '../lib/openai';

const BREWS_STORAGE_KEY = '@GoodCup:brews';
const BEAN_NAMES_STORAGE_KEY = '@GoodCup:beanNames';
const BREW_DEVICES_KEY = '@GoodCup:brewDevices';
const GRINDERS_KEY = '@GoodCup:grinders';
const BEANS_STORAGE_KEY = '@GoodCup:beans';
const DEFAULT_BREW_DEVICE_KEY = '@GoodCup:defaultBrewDevice';
const DEFAULT_GRINDER_KEY = '@GoodCup:defaultGrinder';

interface BeanNameOption {
  label: string;
  value: string;
}

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
}

const formatTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const HomeScreenComponent = () => {
  const [beanName, setBeanName] = useState<string | null>(null);
  const [steepTimeSeconds, setSteepTimeSeconds] = useState(180);
  const [useBloom, setUseBloom] = useState(false);
  const [bloomTime, setBloomTime] = useState('');
  const [grindSize, setGrindSize] = useState('');
  const [waterTemp, setWaterTemp] = useState('');
  const [rating, setRating] = useState(5);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [brewDevices, setBrewDevices] = useState<BrewDevice[]>([]);
  const [grinders, setGrinders] = useState<Grinder[]>([]);
  const [selectedBrewDevice, setSelectedBrewDevice] = useState<string>('');
  const [selectedGrinder, setSelectedGrinder] = useState<string>('');
  const [gettingSuggestion, setGettingSuggestion] = useState(false);
  const [suggestion, setSuggestion] = useState<string>('');
  const [showSuggestion, setShowSuggestion] = useState(false);

  const [allBeanNames, setAllBeanNames] = useState<string[]>([]);
  const [beanNameOptions, setBeanNameOptions] = useState<BeanNameOption[]>([]);
  const [isDropdownFocus, setIsDropdownFocus] = useState(false);
  const [searchText, setSearchText] = useState<string>('');
  const searchInputRef = useRef<any>(null);

  useEffect(() => {
    loadBeanNames();
    loadEquipment();
  }, []);

  useEffect(() => {
    const options = allBeanNames.map(name => ({ label: name, value: name }));
    setBeanNameOptions(options);
  }, [allBeanNames]);

  const loadBeanNames = async () => {
    try {
      // First, try to load from the new Beans storage
      const storedBeans = await AsyncStorage.getItem(BEANS_STORAGE_KEY);
      if (storedBeans) {
        const beans = JSON.parse(storedBeans) as StoredBean[];
        const beanNames = beans.map((bean: StoredBean) => bean.name);
        if (beanNames.length > 0) {
          setAllBeanNames(beanNames);
          
          // Create options for dropdown
          const options = beanNames.map((name: string) => ({
            label: name,
            value: name
          }));
          setBeanNameOptions(options);
          return;
        }
      }
      
      // If no beans in new storage, fall back to the old storage method
      const storedNames = await AsyncStorage.getItem(BEAN_NAMES_STORAGE_KEY);
      if (storedNames) {
        const parsedNames = JSON.parse(storedNames) as string[];
        setAllBeanNames(parsedNames);
        
        // Create options for dropdown
        const options = parsedNames.map((name: string) => ({
          label: name,
          value: name
        }));
        setBeanNameOptions(options);
      }
    } catch (error) {
      console.error('Error loading bean names:', error);
    }
  };

  const loadEquipment = async () => {
    try {
      const storedDevices = await AsyncStorage.getItem(BREW_DEVICES_KEY);
      const storedGrinders = await AsyncStorage.getItem(GRINDERS_KEY);
      const defaultDeviceId = await AsyncStorage.getItem(DEFAULT_BREW_DEVICE_KEY);
      const defaultGrinderId = await AsyncStorage.getItem(DEFAULT_GRINDER_KEY);
      
      if (storedDevices) {
        setBrewDevices(JSON.parse(storedDevices));
      }
      
      if (storedGrinders) {
        setGrinders(JSON.parse(storedGrinders));
      }

      // Set default selections if available
      if (defaultDeviceId) {
        setSelectedBrewDevice(defaultDeviceId);
      }
      
      if (defaultGrinderId) {
        setSelectedGrinder(defaultGrinderId);
      }
    } catch (error) {
      console.error('Error loading equipment:', error);
    }
  };

  const saveBeanName = async (nameToSave: string | null) => {
    if (!nameToSave || allBeanNames.includes(nameToSave)) {
      return;
    }
    try {
      const updatedNames = [...allBeanNames, nameToSave].sort();
      setAllBeanNames(updatedNames);
      
      // Create the option immediately and add it to options
      const newOption = { label: nameToSave, value: nameToSave };
      const updatedOptions = [...beanNameOptions, newOption].sort((a, b) => a.label.localeCompare(b.label));
      setBeanNameOptions(updatedOptions);
      
      await AsyncStorage.setItem(BEAN_NAMES_STORAGE_KEY, JSON.stringify(updatedNames));
    } catch (e) {
      console.error("Failed to save bean name.", e);
    }
  };

  const handleSaveBrew = async () => {
    if (!beanName || !grindSize || !waterTemp) {
      Alert.alert('Missing Info', 'Please fill in Bean Name, Grind Size, and Water Temp.');
      return;
    }
    
    await saveBeanName(beanName);
    
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
      grinder: selectedGrinder || undefined
    };

    try {
      const storedBrews = await AsyncStorage.getItem(BREWS_STORAGE_KEY);
      const existingBrews: Brew[] = storedBrews ? JSON.parse(storedBrews) : [];
      const updatedBrews = [...existingBrews, newBrew];
      await AsyncStorage.setItem(BREWS_STORAGE_KEY, JSON.stringify(updatedBrews));

      setBeanName(null);
      setSteepTimeSeconds(180);
      setUseBloom(false);
      setBloomTime('');
      setGrindSize('');
      setWaterTemp('');
      setRating(5);
      setNotes('');
      Alert.alert('Success', 'Brew saved successfully!');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('Failed to save brew.', e);
      Alert.alert('Error', 'Could not save the brew.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const onSliderChange = (value: number, type: 'time' | 'rating') => {
    if (type === 'time') {
      setSteepTimeSeconds(value);
    } else {
      setRating(value);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDropdownChange = (item: { label: string; value: string }) => {
    // Update the bean name state
    setBeanName(item.value);
    
    // Show bean details if available
    if (item.value) {
      getBeanDetails(item.value);
    }
    
    // Clear search text and reset focus
    setSearchText('');
    setIsDropdownFocus(false);
    
    // Save the new bean name if it's not in the list already
    if (item.value && !allBeanNames.includes(item.value)) {
      saveBeanName(item.value);
    }
  };

  const handleSearchTextSubmit = () => {
    if (searchText && searchText.trim() !== '') {
      setBeanName(searchText);
      
      // Immediately save the new bean name to AsyncStorage
      saveBeanName(searchText);
      
      setIsDropdownFocus(false);
      setSearchText('');
    }
  };

  // Timer functionality
  const startTimer = useCallback(() => {
    if (timerActive) return;
    
    setTimerActive(true);
    const interval = setInterval(() => {
      setTimerSeconds(prev => prev + 1);
    }, 1000);
    
    setTimerInterval(interval);
  }, [timerActive]);

  const stopTimer = useCallback(() => {
    if (!timerActive) return;
    
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    
    setTimerActive(false);
    setSteepTimeSeconds(timerSeconds);
    setTimerInterval(null);
  }, [timerActive, timerInterval, timerSeconds]);

  const resetTimer = useCallback(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    
    setTimerActive(false);
    setTimerSeconds(0);
    setTimerInterval(null);
  }, [timerInterval]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [timerInterval]);

  // Get AI suggestions for the current brew
  const getAiSuggestions = async () => {
    if (!beanName || !grindSize || !waterTemp) {
      Alert.alert('Missing Info', 'Please fill in Bean Name, Grind Size, and Water Temp.');
      return;
    }

    setGettingSuggestion(true);
    setSuggestion('');
    setShowSuggestion(true);
    
    try {
      // Create current brew object
      const currentBrew: Brew = {
        id: 'temp',
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
        grinder: selectedGrinder || undefined
      };
      
      // Get existing brews
      const storedBrews = await AsyncStorage.getItem(BREWS_STORAGE_KEY);
      let brews: Brew[] = [];
      
      if (storedBrews) {
        brews = JSON.parse(storedBrews);
      }
      
      // Get previous brews with same bean
      const relatedBrews = brews.filter(brew => 
        brew.beanName.toLowerCase() === beanName.toLowerCase()
      );
      
      // Get suggestions
      const result = await getBrewSuggestions(currentBrew, relatedBrews, beanName);
      setSuggestion(result);
    } catch (error) {
      console.error('Error getting suggestions:', error);
      setSuggestion('Error getting suggestions. Please check your OpenAI API key in settings.');
    }
    
    setGettingSuggestion(false);
  };

  // Reset form
  const resetForm = () => {
    setBeanName(null);
    setSteepTimeSeconds(180);
    setUseBloom(false);
    setBloomTime('');
    setGrindSize('');
    setWaterTemp('');
    setRating(5);
    setNotes('');
    resetTimer();
    setSelectedBrewDevice('');
    setSelectedGrinder('');
    setSuggestion('');
    setShowSuggestion(false);
  };

  // Format brew devices and grinders for dropdown
  const brewDeviceOptions: DropdownItem[] = brewDevices.map(device => ({
    label: device.name,
    value: device.id
  }));
  
  const grinderOptions: DropdownItem[] = grinders.map(grinder => ({
    label: grinder.name,
    value: grinder.id
  }));

  // Function to get bean details to display additional info on selection
  const getBeanDetails = useCallback(async (beanName: string) => {
    if (!beanName) return null;
    
    try {
      const storedBeans = await AsyncStorage.getItem(BEANS_STORAGE_KEY);
      if (storedBeans) {
        const beans = JSON.parse(storedBeans) as StoredBean[];
        const matchedBean = beans.find(bean => bean.name === beanName);
        
        if (matchedBean) {
          // If we find bean details, show them to the user
          Alert.alert(
            `${matchedBean.name}`,
            `Roaster: ${matchedBean.roaster}\nOrigin: ${matchedBean.origin}\nProcess: ${matchedBean.process}\nRoast: ${matchedBean.roastLevel}${matchedBean.flavorNotes?.length ? `\n\nFlavor Notes: ${matchedBean.flavorNotes.join(', ')}` : ''}${matchedBean.description ? `\n\n${matchedBean.description}` : ''}`,
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.error('Error getting bean details:', error);
    }
  }, []);

  // Update the handleBeanChange function
  const handleBeanChange = (value: string) => {
    setBeanName(value);
    
    // Show bean details if available
    if (value) {
      getBeanDetails(value);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-transparent" edges={['top', 'left', 'right']}>
      <View className="flex-1 bg-white dark:bg-black">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Card containerStyle={{
            borderRadius: 10,
            paddingHorizontal: 0,
            paddingVertical: 0,
            paddingBottom: 15,
            elevation: 1,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            marginBottom: 40,
          }}>
            <View style={{
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 8,
            }}>
              <View style={{ marginBottom: 16 }}>
                <Dropdown
                  style={{
                    height: 50,
                    borderColor: '#e1e1e1',
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    backgroundColor: 'white',
                  }}
                  placeholderStyle={{ fontSize: 16, color: '#9CA3AF' }}
                  selectedTextStyle={{ fontSize: 16, color: '#333' }}
                  inputSearchStyle={{ height: 40, fontSize: 16, borderColor: '#e1e1e1', borderWidth: 1, borderRadius: 8 }}
                  containerStyle={{ backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#e1e1e1' }}
                  itemTextStyle={{ color: '#333', fontSize: 16 }}
                  data={beanNameOptions}
                  search
                  maxHeight={300}
                  labelField="label"
                  valueField="value"
                  placeholder={!isDropdownFocus ? 'Select or type bean name...' : '...'}
                  searchPlaceholder="Search or type new name..."
                  value={beanName}
                  onFocus={() => setIsDropdownFocus(true)}
                  onBlur={() => setIsDropdownFocus(false)}
                  onChange={handleDropdownChange}
                  renderInputSearch={(onSearch) => (
                    <Input
                      ref={searchInputRef}
                      placeholder="Type new bean name..."
                      value={searchText}
                      onChangeText={(text) => {
                        setSearchText(text);
                        onSearch(text);
                      }}
                      onSubmitEditing={handleSearchTextSubmit}
                      returnKeyType="done"
                      rightIcon={{
                        type: 'ionicon',
                        name: 'checkmark-circle-outline',
                        onPress: handleSearchTextSubmit,
                        color: '#2089dc'
                      }}
                      inputContainerStyle={{ borderBottomWidth: 0 }}
                    />
                  )}
                />
              </View>
            </View>

            <Divider style={{ marginBottom: 16, backgroundColor: '#e1e1e1', height: 1 }} />
            
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, marginBottom: 0, fontWeight: '500', color: '#333' }}>Steep Time</Text>
                  <Text style={{ fontSize: 16, color: '#2089dc', fontWeight: '600' }}>{formatTime(timerActive ? timerSeconds : steepTimeSeconds)}</Text>
                </View>
                <Slider
                  value={steepTimeSeconds}
                  onValueChange={(value) => onSliderChange(value, 'time')}
                  minimumValue={30}
                  maximumValue={240}
                  step={5}
                  allowTouchTrack={true}
                  minimumTrackTintColor="#2089dc"
                  maximumTrackTintColor="#d3d3d3"
                  thumbTintColor="#2089dc"
                  trackStyle={{ height: 6, borderRadius: 3 }}
                  thumbStyle={{ height: 20, width: 20, backgroundColor: 'white', borderWidth: 2, borderColor: '#2089dc' }}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 16, marginBottom: 0, fontWeight: '500', color: '#333' }}>Use Bloom?</Text>
                <Switch
                  value={useBloom}
                  onValueChange={(v) => { setUseBloom(v); setIsDropdownFocus(false); }}
                  color="#2089dc"
                />
              </View>

              {useBloom && (
                <View style={{ marginBottom: 16, marginTop: 12 }}>
                  <Text style={{ fontSize: 16, marginBottom: 8, fontWeight: '500', color: '#333' }}>Bloom Time (e.g., 0:30)</Text>
                  <Input
                    value={bloomTime}
                    onChangeText={setBloomTime}
                    placeholder="Minutes:Seconds"
                    placeholderTextColor="#9CA3AF"
                    keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                    onFocus={() => setIsDropdownFocus(false)}
                    inputContainerStyle={{ borderWidth: 1, borderColor: '#e1e1e1', borderRadius: 8, paddingHorizontal: 10 }}
                  />
                </View>
              )}

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 16, marginBottom: 8, fontWeight: '500', color: '#333' }}>Grind Size</Text>
                <Input
                  value={grindSize}
                  onChangeText={setGrindSize}
                  placeholder="Medium-Fine, 18 clicks, etc."
                  placeholderTextColor="#9CA3AF"
                  onFocus={() => setIsDropdownFocus(false)}
                  inputContainerStyle={{ borderWidth: 1, borderColor: '#e1e1e1', borderRadius: 8, paddingHorizontal: 10 }}
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 16, marginBottom: 8, fontWeight: '500', color: '#333' }}>Water Temperature</Text>
                <Input
                  value={waterTemp}
                  onChangeText={setWaterTemp}
                  placeholder="Temperature in °C or °F"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  onFocus={() => setIsDropdownFocus(false)}
                  inputContainerStyle={{ borderWidth: 1, borderColor: '#e1e1e1', borderRadius: 8, paddingHorizontal: 10 }}
                />
              </View>
            </View>

            <Divider style={{ marginBottom: 16, backgroundColor: '#e1e1e1', height: 1 }} />
            
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, marginBottom: 0, fontWeight: '500', color: '#333' }}>Rating</Text>
                  <Text style={{ fontSize: 16, color: '#2089dc', fontWeight: '600' }}>{rating}/10</Text>
                </View>
                <Slider
                  value={rating}
                  onValueChange={(value) => onSliderChange(value, 'rating')}
                  minimumValue={1}
                  maximumValue={10}
                  step={1}
                  allowTouchTrack={true}
                  minimumTrackTintColor="#2089dc"
                  maximumTrackTintColor="#d3d3d3"
                  thumbTintColor="#2089dc"
                  trackStyle={{ height: 6, borderRadius: 3 }}
                  thumbStyle={{ height: 20, width: 20, backgroundColor: 'white', borderWidth: 2, borderColor: '#2089dc' }}
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 16, marginBottom: 8, fontWeight: '500', color: '#333' }}>Notes</Text>
                <Input
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Tasting notes, observations, etc."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={4}
                  inputContainerStyle={{ 
                    borderWidth: 1, 
                    borderColor: '#e1e1e1', 
                    borderRadius: 8, 
                    paddingHorizontal: 10,
                    minHeight: 120 
                  }}
                  inputStyle={{ 
                    textAlignVertical: 'top', 
                    paddingTop: 10, 
                    minHeight: 100 
                  }}
                  onFocus={() => setIsDropdownFocus(false)}
                />
              </View>
            </View>

            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 16, marginBottom: 8, fontWeight: '500', color: '#333' }}>Brew Device</Text>
              <Dropdown
                style={{
                  height: 50,
                  borderColor: '#e1e1e1',
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  marginBottom: 16,
                }}
                placeholderStyle={{ color: '#9e9e9e' }}
                selectedTextStyle={{ color: '#333' }}
                data={brewDeviceOptions}
                maxHeight={300}
                labelField="label"
                valueField="value"
                placeholder="Select brew device"
                value={selectedBrewDevice}
                onChange={item => setSelectedBrewDevice(item.value)}
                disable={brewDeviceOptions.length === 0}
              />
              {brewDeviceOptions.length === 0 && (
                <Text style={{ color: '#9e9e9e', fontSize: 12, marginLeft: 10, marginTop: -12, marginBottom: 16 }}>
                  Add brew devices in Settings
                </Text>
              )}
            </View>

            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 16, marginBottom: 8, fontWeight: '500', color: '#333' }}>Grinder</Text>
              <Dropdown
                style={{
                  height: 50,
                  borderColor: '#e1e1e1',
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  marginBottom: 16,
                }}
                placeholderStyle={{ color: '#9e9e9e' }}
                selectedTextStyle={{ color: '#333' }}
                data={grinderOptions}
                maxHeight={300}
                labelField="label"
                valueField="value"
                placeholder="Select grinder"
                value={selectedGrinder}
                onChange={item => setSelectedGrinder(item.value)}
                disable={grinderOptions.length === 0}
              />
              {grinderOptions.length === 0 && (
                <Text style={{ color: '#9e9e9e', fontSize: 12, marginLeft: 10, marginTop: -12, marginBottom: 16 }}>
                  Add grinders in Settings
                </Text>
              )}
            </View>

            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 16, marginBottom: 0, fontWeight: '500', color: '#333' }}>Timer</Text>
                <Text style={{ fontSize: 16, color: '#2089dc', fontWeight: '600' }}>{formatTime(timerActive ? timerSeconds : steepTimeSeconds)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <RNEButton
                  title={timerActive ? "Stop" : "Start"}
                  onPress={timerActive ? stopTimer : startTimer}
                  buttonStyle={{ marginHorizontal: 8, borderRadius: 8, paddingHorizontal: 16 }}
                />
                <RNEButton
                  title="Reset"
                  onPress={resetTimer}
                  buttonStyle={{ marginHorizontal: 8, borderRadius: 8, paddingHorizontal: 16 }}
                  color="#607d8b"
                />
              </View>
            </View>

            <Divider style={{ marginBottom: 16, backgroundColor: '#e1e1e1', height: 1 }} />
            
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <RNEButton
                title="Get AI Suggestions"
                onPress={getAiSuggestions}
                buttonStyle={{ height: 48, borderRadius: 8, backgroundColor: '#5e35b1' }}
                loading={gettingSuggestion}
                icon={{
                  name: 'lightbulb-outline',
                  type: 'material',
                  color: 'white',
                  size: 18
                }}
              />
            </View>

            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              {showSuggestion && (
                <Card containerStyle={{
                  marginTop: 16,
                  marginBottom: 8,
                  borderRadius: 8,
                  padding: 16,
                  backgroundColor: '#f9f4ff'
                }}>
                  <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#5e35b1' }}>AI Suggestions</Text>
                  {gettingSuggestion ? (
                    <ActivityIndicator size="large" color="#5e35b1" style={{ marginVertical: 20 }} />
                  ) : (
                    <Text style={{ fontSize: 14, lineHeight: 20, color: '#333' }}>
                      {suggestion || 'No suggestions available. Please check your OpenAI API key in settings.'}
                    </Text>
                  )}
                  <RNEButton
                    title="Hide Suggestions"
                    onPress={() => setShowSuggestion(false)}
                    buttonStyle={{ marginTop: 12 }}
                    type="clear"
                  />
                </Card>
              )}
            </View>

            <RNEButton
              title="Save Brew"
              onPress={handleSaveBrew}
              containerStyle={{ marginHorizontal: 16, marginTop: 16 }}
              buttonStyle={{ backgroundColor: '#2089dc', borderRadius: 8, height: 50 }}
              raised
            />
          </Card>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

export default HomeScreenComponent; 