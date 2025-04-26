import React from 'react';
import { View, Linking, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/ui/text'; // Assuming common UI components path
import { Button } from '../components/ui/button'; // Assuming common UI components path
import { Mail, Twitter } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
// import { Header } from '../components/Header'; // Assuming a Header component exists

// --- Tailwind ---
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../tailwind.config.js'; // Adjust path if necessary

const fullConfig = resolveConfig(tailwindConfig);
const themeColors = (fullConfig.theme?.colors ?? {}) as Record<string, string>;
// --- End Tailwind ---

const TWITTER_URL = 'https://twitter.com/ffstrauf';
const EMAIL_ADDRESS = 'f.strauf@gmail.com';

export default function AboutScreen() {
  const navigation = useNavigation();

  const handleEmailPress = async () => {
    const mailtoUrl = `mailto:${EMAIL_ADDRESS}`;
    try {
      const supported = await Linking.canOpenURL(mailtoUrl);
      if (supported) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert("Cannot open email client", "No email application found on your device.");
      }
    } catch (error) {
      console.error('Failed to open email client:', error);
      Alert.alert("Error", "An error occurred while trying to open the email client.");
    }
  };

  const handleTwitterPress = async () => {
    try {
      const supported = await Linking.canOpenURL(TWITTER_URL);
      if (supported) {
        await Linking.openURL(TWITTER_URL);
      } else {
        Alert.alert("Cannot open URL", `Don't know how to open this URL: ${TWITTER_URL}`);
      }
    } catch (error) {
      console.error('Failed to open Twitter URL:', error);
      Alert.alert("Error", "An error occurred while trying to open the link.");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-soft-off-white" edges={['top', 'left', 'right']}>
      {/* Assuming a Header component exists for back navigation and title */}
      {/* <Header title="About" showBackButton={true} /> */}
      {/* Add a simple title for now */}
      <View className="p-4 border-b border-pale-gray">
        <Text className="text-xl font-semibold text-charcoal text-center">About</Text>
      </View>
      <View className="flex-1 p-4">
        <Text className="text-lg text-charcoal mb-4">
          The Good Cup helps you brew the perfect cup of coffee, every time.
        </Text>
        <Text className="text-base text-cool-gray-green mb-6">
          Have questions, feedback, or just want to say hi?
        </Text>

        {/* Contact Button */}
        <Button
          onPress={handleEmailPress}
          className="bg-muted-sage-green flex-row items-center justify-center mb-4"
        >
          <Mail size={18} color={themeColors['white']} className="mr-2" />
          <Text className="text-white font-semibold">Contact Me via Email</Text>
        </Button>

        {/* Twitter Button */}
        <Button
          variant="outline"
          onPress={handleTwitterPress}
          className="bg-light-beige border-pebble-gray flex-row items-center justify-center"
        >
          <Twitter size={18} color={themeColors['charcoal']} className="mr-2" />
          <Text className="text-charcoal font-semibold">Follow on Twitter (@ffstrauf)</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
} 