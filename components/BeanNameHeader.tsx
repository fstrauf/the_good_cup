import React from 'react';
import { View, Text } from 'react-native';

interface BeanNameHeaderProps {
  beanName: string | null | undefined;
  prefix?: string; // Optional prefix like "Brewing:" or "History for:"
}

const BeanNameHeader: React.FC<BeanNameHeaderProps> = ({ beanName, prefix = "" }) => {
  // Don't render if no bean name is provided yet
  if (!beanName) {
    return null;
  }

  return (
    // Added top padding, bottom border, and bottom margin for separation
    <View className="px-4 pt-4 pb-2 bg-center border-b border-pale-gray mb-2">
      <Text className="text-xl font-semibold text-center text-charcoal">
        {prefix ? `${prefix} ` : ''}{beanName}
      </Text>
    </View>
  );
};

export default BeanNameHeader;