import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Keyboard, 
  Platform,
  ScrollView
} from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { Icon } from './Icon';

interface KeyboardToolbarProps {
  onAction: (action: string, meta?: { key?: string, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean }) => void;
}

export const KeyboardToolbar: React.FC<KeyboardToolbarProps> = ({ onAction }) => {
  const { theme } = useAppTheme();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [altPressed, setAltPressed] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setIsVisible(true);
        setIsMinimized(false);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsVisible(false);
        setCtrlPressed(false);
        setShiftPressed(false);
        setAltPressed(false);
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (!isVisible) return null;

  const handleKeyPress = (key: string) => {
    onAction('keypress', { key, ctrlKey: ctrlPressed, shiftKey: shiftPressed, altKey: altPressed });
    setCtrlPressed(false);
    setShiftPressed(false);
    setAltPressed(false);
  };

  const handleModifier = (mod: 'ctrl' | 'shift' | 'alt') => {
    if (mod === 'ctrl') setCtrlPressed(!ctrlPressed);
    if (mod === 'shift') setShiftPressed(!shiftPressed);
    if (mod === 'alt') setAltPressed(!altPressed);
    onAction('modifier', { 
      ctrlKey: mod === 'ctrl' ? !ctrlPressed : ctrlPressed,
      shiftKey: mod === 'shift' ? !shiftPressed : shiftPressed,
      altKey: mod === 'alt' ? !altPressed : altPressed 
    });
  };

  const renderKey = (label: string, action: () => void, isActive: boolean = false, isWide: boolean = false) => (
    <TouchableOpacity 
      style={[
        styles.keyButton, 
        { backgroundColor: isActive ? theme.colors.accentBlue : '#2C2C2C' },
        isWide && { paddingHorizontal: 16 }
      ]}
      onPress={action}
    >
      <Text style={[
        styles.keyText, 
        { color: isActive ? '#FFFFFF' : '#E0E0E0' }
      ]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderIconKey = (iconName: any, action: () => void) => (
    <TouchableOpacity 
      style={[styles.keyButton, { backgroundColor: '#2C2C2C' }]}
      onPress={action}
    >
      <Icon name={iconName} size={16} color="#E0E0E0" />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: '#1A1A1A' }]}>
      {isMinimized ? (
        <View style={styles.minimizedContainer}>
          <TouchableOpacity style={styles.minimizeBtn} onPress={() => setIsMinimized(false)}>
            <Icon name="ChevronUp" size={16} color="#888" />
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <View style={styles.row}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollView} keyboardShouldPersistTaps="always">
              {/* Quick Actions / Shortcuts when Ctrl is pressed */}
              {ctrlPressed && (
                <>
                  {renderKey('C', () => handleKeyPress('c'))}
                  {renderKey('V', () => handleKeyPress('v'))}
                  {renderKey('X', () => handleKeyPress('x'))}
                  {renderKey('Z', () => handleKeyPress('z'))}
                  {renderKey('Y', () => handleKeyPress('y'))}
                  {renderKey('A', () => handleKeyPress('a'))}
                  {renderKey('F', () => handleKeyPress('f'))}
                  {renderKey('S', () => handleKeyPress('s'))}
                  <View style={styles.divider} />
                </>
              )}
              
              {renderKey('Esc', () => handleKeyPress('Escape'))}
              {renderKey('Tab', () => handleKeyPress('Tab'))}
              {renderKey('Ctrl', () => handleModifier('ctrl'), ctrlPressed)}
              {renderKey('Shift', () => handleModifier('shift'), shiftPressed)}
              {renderKey('Alt', () => handleModifier('alt'), altPressed)}
              
              <View style={styles.divider} />
              
              {/* Arrows */}
              {renderIconKey('ArrowLeft', () => handleKeyPress('ArrowLeft'))}
              {renderIconKey('ArrowUp', () => handleKeyPress('ArrowUp'))}
              {renderIconKey('ArrowDown', () => handleKeyPress('ArrowDown'))}
              {renderIconKey('ArrowRight', () => handleKeyPress('ArrowRight'))}
              
              <View style={styles.divider} />
              
              {/* Common Symbols */}
              {renderKey('<', () => handleKeyPress('<'))}
              {renderKey('>', () => handleKeyPress('>'))}
              {renderKey('/', () => handleKeyPress('/'))}
              {renderKey('{', () => handleKeyPress('{'))}
              {renderKey('}', () => handleKeyPress('}'))}
              {renderKey('[', () => handleKeyPress('['))}
              {renderKey(']', () => handleKeyPress(']'))}
              {renderKey('=', () => handleKeyPress('='))}
              {renderKey('"', () => handleKeyPress('"'))}
              {renderKey("'", () => handleKeyPress("'"))}
              {renderKey(';', () => handleKeyPress(';'))}
            </ScrollView>
            
            <TouchableOpacity style={styles.minimizeBtnRight} onPress={() => setIsMinimized(true)}>
              <Icon name="ChevronDown" size={16} color="#888" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 8,
  },
  minimizedContainer: {
    alignItems: 'flex-end',
    padding: 4,
  },
  minimizeBtn: {
    padding: 8,
    backgroundColor: '#2C2C2C',
    borderRadius: 8,
    marginRight: 8,
  },
  minimizeBtnRight: {
    padding: 10,
    backgroundColor: '#2C2C2C',
    borderLeftWidth: 1,
    borderLeftColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 6,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontFamily: 'sans-serif', // React Native default sans
    fontSize: 14,
    fontWeight: 'bold',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#444',
    marginHorizontal: 8,
    alignSelf: 'center',
  }
});
