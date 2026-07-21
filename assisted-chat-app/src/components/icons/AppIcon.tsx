import type { ComponentProps } from 'react';
import type { TextStyle } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

export type AppIconName = ComponentProps<typeof FontAwesome>['name'];

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color: string;
  style?: TextStyle;
  testID?: string;
}

export function AppIcon({ name, size = 20, color, style, testID }: AppIconProps) {
  return (
    <FontAwesome
      name={name}
      size={size}
      color={color}
      testID={testID}
      style={[{ lineHeight: size }, style]}
    />
  );
}
