import React from 'react';
import * as LucideIcons from 'lucide-react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { StyleProp, ViewStyle } from 'react-native';

export type IconName = keyof typeof LucideIcons | string | any;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  outline?: boolean; // If false, we might want a filled version, but Lucide is mostly outline. We can simulate fill or just use outline as standard.
  style?: StyleProp<ViewStyle>;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = '#FFFFFF',
  outline = true,
  style,
}) => {
  const { theme } = useAppTheme();

  const LucideIcon = (LucideIcons as any)[name] as React.FC<any>;

  if (!LucideIcon) {
    return null; // or a fallback icon
  }

  // Lucide icons don't support "fill" properly in all SVGs out of the box in the same way solid icons do,
  // but we can pass fill={color} if outline is false (it fills the path if supported).
  const fillProps = outline ? {} : { fill: color };

  return <LucideIcon size={size} color={color} strokeWidth={1.5} style={style} {...fillProps} />;
};
