import React from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Icon } from './Icon';

interface BrowserPlayButtonProps {
  state: 'idle' | 'loading' | 'running' | 'error';
  onPress: () => void;
  color: string;
}

export const BrowserPlayButton: React.FC<BrowserPlayButtonProps> = ({ state, onPress, color }) => {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress} disabled={state === 'loading'}>
      <View style={styles.container}>
        {state === 'idle' && <Icon name="Play" size={18} color={color} outline={false} />}
        {state === 'loading' && <ActivityIndicator size="small" color={color} />}
        {state === 'running' && <Icon name="Square" size={14} color="#ef4444" outline={false} />}
        {state === 'error' && <Icon name="AlertTriangle" size={18} color="#f59e0b" />}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  container: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
