import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Keyboard, 
  Platform, 
  ScrollView,
  DeviceEventEmitter,
  Dimensions
} from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';

interface KeyboardToolbarProps {
  onAction?: (action: string, meta?: { key?: string, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean }) => void;
}

export const KeyboardToolbar: React.FC<KeyboardToolbarProps> = ({ onAction }) => {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [altPressed, setAltPressed] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  const isInteractingRef = useRef(false);
  const isEditorActiveRef = useRef(false);

  useEffect(() => {
    const handleShow = (e?: any) => {
      const kh = e?.endCoordinates?.height || 280;
      setKeyboardHeight(kh);
      if (isEditorActiveRef.current) {
        setIsVisible(true);
      }
    };

    const handleHide = () => {
      if (!isInteractingRef.current) {
        setIsVisible(false);
        DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_HEIGHT_CHANGE', 0);
      }
      setKeyboardHeight(0);
      setCtrlPressed(false);
      setShiftPressed(false);
      setAltPressed(false);
    };

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      handleShow
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      handleHide
    );
    const showToolbarSub = DeviceEventEmitter.addListener('SHOW_KEYBOARD_TOOLBAR', () => {
      isEditorActiveRef.current = true;
      setIsVisible(true);
    });
    const hideToolbarSub = DeviceEventEmitter.addListener('HIDE_KEYBOARD_TOOLBAR', () => {
      isEditorActiveRef.current = false;
      if (!isInteractingRef.current) {
        setIsVisible(false);
        setKeyboardHeight(0);
        DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_HEIGHT_CHANGE', 0);
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      showToolbarSub.remove();
      hideToolbarSub.remove();
      DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_HEIGHT_CHANGE', 0);
    };
  }, []);

  // NEVER render when not visible or not in an editor/terminal, or if keyboard is down
  if (!isVisible || !isEditorActiveRef.current || keyboardHeight <= 0) return null;

  const handleKeyPress = (key: string) => {
    isInteractingRef.current = true;
    setTimeout(() => { isInteractingRef.current = false; }, 1000);
    if (onAction) onAction('keypress', { key, ctrlKey: ctrlPressed, shiftKey: shiftPressed, altKey: altPressed });
    DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_ACTION', { actionType: 'keypress', meta: { key, ctrlKey: ctrlPressed, shiftKey: shiftPressed, altKey: altPressed } });
    setCtrlPressed(false);
    setShiftPressed(false);
    setAltPressed(false);
  };

  const handleModifier = (mod: 'ctrl' | 'shift' | 'alt') => {
    isInteractingRef.current = true;
    setTimeout(() => { isInteractingRef.current = false; }, 1000);
    if (mod === 'ctrl') setCtrlPressed(!ctrlPressed);
    if (mod === 'shift') setShiftPressed(!shiftPressed);
    if (mod === 'alt') setAltPressed(!altPressed);
  };

  const renderKey = (label: string, action: () => void, isActive: boolean = false, isWide: boolean = false) => (
    <TouchableOpacity 
      style={[
        styles.keyButton, 
        isActive && styles.keyButtonActive, 
        isWide && { minWidth: 54 }
      ]} 
      onPress={action}
      activeOpacity={0.7}
    >
      <Text style={[styles.keyText, isActive && styles.keyTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderIconKey = (iconName: string, action: () => void, label?: string) => (
    <TouchableOpacity style={styles.keyButton} onPress={action} activeOpacity={0.7}>
      <Icon name={iconName} size={16} color="#E2E8F0" />
      {label && <Text style={[styles.keyText, { marginLeft: 4 }]}>{label}</Text>}
    </TouchableOpacity>
  );

  const bottomMargin = keyboardHeight > 0 
    ? keyboardHeight + (Platform.OS === 'android' ? insets.bottom : 0)
    : (Platform.OS === 'android' ? insets.bottom : 0);

  return (
    <View 
      onLayout={(e) => {
        DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_HEIGHT_CHANGE', e.nativeEvent.layout.height);
      }}
      style={[
        styles.container, 
        { marginBottom: bottomMargin }
      ]}
      onTouchStart={() => { isInteractingRef.current = true; }}
      onTouchEnd={() => { setTimeout(() => { isInteractingRef.current = false; }, 1000); }}
    >
      {isMinimized ? (
        <View style={styles.minimizedContainer}>
          <TouchableOpacity 
            style={styles.minimizeBtn} 
            onPress={() => setIsMinimized(false)}
            activeOpacity={0.8}
          >
            <Icon name="ChevronUp" size={16} color="#A0AEC0" />
            <Text style={styles.minimizeText}>Atalhos</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.toolbarContent}>
          <View style={styles.row}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.scrollView} 
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="always"
            >
              {/* Quick Actions / Shortcuts when Ctrl is pressed */}
              {ctrlPressed && (
                <>
                  {renderKey('C', () => handleKeyPress('c'), false, true)}
                  {renderKey('V', () => handleKeyPress('v'), false, true)}
                  {renderKey('X', () => handleKeyPress('x'), false, true)}
                  {renderKey('Z', () => handleKeyPress('z'), false, true)}
                  {renderKey('A', () => handleKeyPress('a'), false, true)}
                  {renderKey('F', () => handleKeyPress('f'), false, true)}
                  <View style={styles.divider} />
                </>
              )}
              
              {/* Acode-Inspired Elegant Core Modifiers & Actions */}
              {renderKey('CTRL', () => handleModifier('ctrl'), ctrlPressed)}
              {renderKey('TAB', () => handleKeyPress('Tab'))}
              {renderKey('SHFT', () => handleModifier('shift'), shiftPressed)}
              {renderKey('ALT', () => handleModifier('alt'), altPressed)}
              
              {renderIconKey('Undo', () => handleKeyPress('Undo'))}
              {renderIconKey('Redo', () => handleKeyPress('Redo'))}
              {renderIconKey('Search', () => handleKeyPress('Search'))}
              
              {renderKey('ESC', () => handleKeyPress('Escape'))}
              
              
              {/* Navigation Arrows */}
              {renderIconKey('ArrowLeft', () => handleKeyPress('ArrowLeft'))}
              {renderIconKey('ArrowDown', () => handleKeyPress('ArrowDown'))}
              {renderIconKey('ArrowUp', () => handleKeyPress('ArrowUp'))}
              {renderIconKey('ArrowRight', () => handleKeyPress('ArrowRight'))}
            </ScrollView>
            
            <TouchableOpacity 
              style={styles.minimizeBtnRight} 
              onPress={() => setIsMinimized(true)}
              activeOpacity={0.7}
            >
              <Icon name="ChevronDown" size={16} color="#A0AEC0" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  toolbarContent: {
    backgroundColor: '#141414',
    borderTopWidth: 1,
    borderTopColor: '#282828',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  minimizedContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  minimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  minimizeText: {
    color: '#A0AEC0',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  minimizeBtnRight: {
    height: '100%',
    paddingHorizontal: 14,
    backgroundColor: '#181818',
    borderLeftWidth: 1,
    borderLeftColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#202020',
    borderWidth: 1,
    borderColor: '#2E2E2E',
    borderRadius: 6,
    marginRight: 6,
    minWidth: 38,
    height: 32,
  },
  keyButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#6366F1',
  },
  keyText: {
    fontFamily: 'sans-serif',
    fontSize: 12,
    fontWeight: '700',
    color: '#E2E8F0',
    letterSpacing: 0.3,
  },
  keyTextActive: {
    color: '#FFFFFF',
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: '#2E2E2E',
    marginHorizontal: 4,
    marginRight: 10,
  }
});
