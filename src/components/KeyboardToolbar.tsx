/* eslint-disable react-hooks/refs, react-hooks/purity */
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
  useWindowDimensions,
  Dimensions
} from 'react-native';
import { Icon } from './Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';

type ToolbarTarget = 'editor' | string;

interface KeyboardToolbarProps {
  onAction?: (action: string, meta?: { key?: string, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, target?: ToolbarTarget }) => void;
}

const isToolbarTarget = (target?: string | null) => !!target && (target === 'editor' || String(target).startsWith('shell'));

export const KeyboardToolbar: React.FC<KeyboardToolbarProps> = ({ onAction }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [altPressed, setAltPressed] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardTop, setKeyboardTop] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [activeTarget, setActiveTarget] = useState<ToolbarTarget | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useLanguage();

  const isInteractingRef = useRef(false);
  const activeTargetRef = useRef<ToolbarTarget | null>(null);
  const keyboardVisibleRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearFallbackTimer = () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };

    const clearPendingTimer = () => {
      if (pendingClearTimerRef.current) {
        clearTimeout(pendingClearTimerRef.current);
        pendingClearTimerRef.current = null;
      }
    };

    const hideToolbar = () => {
      clearFallbackTimer();
      clearPendingTimer();
      activeTargetRef.current = null;
      setActiveTarget(null);
      setIsVisible(false);
      setPendingActionId(null);
      setCtrlPressed(false);
      setShiftPressed(false);
      setAltPressed(false);
      DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_HEIGHT_CHANGE', 0);
    };

    const handleShow = (e?: any) => {
      clearFallbackTimer();
      const kh = e?.endCoordinates?.height || 280;
      const kt = e?.endCoordinates?.screenY || 0;
      keyboardVisibleRef.current = true;
      setIsKeyboardVisible(true);
      setKeyboardHeight(kh);
      setKeyboardTop(kt);
      if (isToolbarTarget(String(activeTargetRef.current || ''))) {
        setIsVisible(true);
      }
    };

    const handleHide = () => {
      clearFallbackTimer();
      keyboardVisibleRef.current = false;
      setIsKeyboardVisible(false);
      if (!isInteractingRef.current) {
        hideToolbar();
      }
      setKeyboardHeight(0);
      setKeyboardTop(0);
    };

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      handleShow
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      handleHide
    );
    const showToolbarSub = DeviceEventEmitter.addListener('SHOW_KEYBOARD_TOOLBAR', (event?: { target?: ToolbarTarget, keyboardExpected?: boolean }) => {
      const nextTarget = event?.target || (global as any).activeInputTarget;
      if (!isToolbarTarget(String(nextTarget || ''))) {
        hideToolbar();
        return;
      }

      activeTargetRef.current = nextTarget;
      setActiveTarget(nextTarget);
      if (keyboardVisibleRef.current) {
        setIsVisible(true);
        return;
      }

      if (Platform.OS === 'android' && event?.keyboardExpected) {
        clearFallbackTimer();
        fallbackTimerRef.current = setTimeout(() => {
          if (!isToolbarTarget(String(activeTargetRef.current || '')) || keyboardVisibleRef.current) return;
          const metrics = (Keyboard as any).metrics?.();
          const screenHeight = Dimensions.get('screen').height;
          const currentWindowHeight = Dimensions.get('window').height;
          const estimatedHeight = Math.max(0, screenHeight - currentWindowHeight - insets.bottom);
          const kh = metrics?.height && metrics.height > 80 ? metrics.height : (estimatedHeight > 80 ? estimatedHeight : 0);
          if (kh <= 0) return;
          const kt = Math.max(0, currentWindowHeight - kh);
          keyboardVisibleRef.current = true;
          setIsKeyboardVisible(true);
          setKeyboardHeight(kh);
          setKeyboardTop(kt);
          setIsVisible(true);
        }, 220);
      }
    });
    const hideToolbarSub = DeviceEventEmitter.addListener('HIDE_KEYBOARD_TOOLBAR', hideToolbar);
    const completeSub = DeviceEventEmitter.addListener('KEYBOARD_TOOLBAR_ACTION_COMPLETE', (event?: { requestId?: string, target?: ToolbarTarget }) => {
      if (event?.target && event.target !== activeTargetRef.current) return;
      if (!event?.requestId || event.requestId === pendingActionId) {
        clearPendingTimer();
        setPendingActionId(null);
      }
    });

    return () => {
      clearFallbackTimer();
      clearPendingTimer();
      showSub.remove();
      hideSub.remove();
      showToolbarSub.remove();
      hideToolbarSub.remove();
      completeSub.remove();
      DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_HEIGHT_CHANGE', 0);
    };
  }, [insets.bottom, pendingActionId]);

  if (!isVisible || !activeTarget || !isKeyboardVisible) return null;

  const queuePendingClear = (requestId: string) => {
    if (pendingClearTimerRef.current) clearTimeout(pendingClearTimerRef.current);
    pendingClearTimerRef.current = setTimeout(() => {
      setPendingActionId(current => current === requestId ? null : current);
      pendingClearTimerRef.current = null;
    }, 350);
  };

  const markInteracting = () => {
    isInteractingRef.current = true;
    setTimeout(() => { isInteractingRef.current = false; }, 1000);
  };

  const handleKeyPress = (key: string) => {
    markInteracting();
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const target = activeTargetRef.current || activeTarget;
    const meta = { key, ctrlKey: ctrlPressed, shiftKey: shiftPressed, altKey: altPressed, target };
    setPendingActionId(key);
    onAction?.('keypress', meta);
    DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_ACTION', { actionType: 'keypress', meta, target, requestId });
    setCtrlPressed(false);
    setShiftPressed(false);
    setAltPressed(false);
    if (key === 'Escape') setPendingActionId(null);
    else queuePendingClear(requestId);
  };

  const handleModifier = (mod: 'ctrl' | 'shift' | 'alt') => {
    markInteracting();
    if (mod === 'ctrl') setCtrlPressed(!ctrlPressed);
    if (mod === 'shift') setShiftPressed(!shiftPressed);
    if (mod === 'alt') setAltPressed(!altPressed);
  };

  const isPending = (key: string) => pendingActionId === key;

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

  const renderIconKey = (iconName: string, key: string, label?: string) => (
    <TouchableOpacity style={[styles.keyButton, isPending(key) && styles.keyButtonActive]} onPress={() => handleKeyPress(key)} activeOpacity={0.7}>
      <Icon name={iconName} size={16} color={isPending(key) ? '#FFFFFF' : '#E2E8F0'} />
      {label && <Text style={[styles.keyText, isPending(key) && styles.keyTextActive, { marginLeft: 4 }]}>{label}</Text>}
    </TouchableOpacity>
  );

  const keyboardMetrics = (Keyboard as any).metrics?.();
  const measuredKeyboardHeight = keyboardMetrics?.height && keyboardMetrics.height > 80
    ? keyboardMetrics.height
    : keyboardHeight;
  const screenHeight = Dimensions.get('screen').height;
  const keyboardResizeDelta = Math.max(0, screenHeight - windowHeight);
  const hasAdjustResizeWorked = Platform.OS === 'android' && keyboardResizeDelta > 150;
  const keyboardTopInset = keyboardTop > 0 ? Math.max(0, windowHeight - keyboardTop) : 0;
  const navBarHeight = Math.max(0, screenHeight - Dimensions.get('window').height - (isKeyboardVisible ? measuredKeyboardHeight : 0));

  let bottomOffset = 0;
  const toolbarGap = Platform.OS === 'android' ? 2 : 4;

  if (Platform.OS === 'ios') {
    bottomOffset = (measuredKeyboardHeight > 0 ? measuredKeyboardHeight : 0) + toolbarGap;
  } else if (isKeyboardVisible) {
    const measuredInset = keyboardTopInset > 0
      ? keyboardTopInset
      : (hasAdjustResizeWorked ? 0 : Math.max(0, measuredKeyboardHeight - navBarHeight));
    bottomOffset = measuredInset + toolbarGap;
  }

  return (
    <View
      onLayout={(e) => {
        DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_HEIGHT_CHANGE', e.nativeEvent.layout.height);
      }}
      style={[styles.container, { bottom: bottomOffset }]}
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
            <Text style={styles.minimizeText}>{t('Atalhos')}</Text>
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
              {ctrlPressed && (
                <>
                  {renderKey('C', () => handleKeyPress('c'), isPending('c'), true)}
                  {renderKey('V', () => handleKeyPress('v'), isPending('v'), true)}
                  {renderKey('X', () => handleKeyPress('x'), isPending('x'), true)}
                  {renderKey('Z', () => handleKeyPress('z'), isPending('z'), true)}
                  {renderKey('Y', () => handleKeyPress('y'), isPending('y'), true)}
                  {renderKey('S', () => handleKeyPress('s'), isPending('s'), true)}
                  {renderKey('D', () => handleKeyPress('d'), isPending('d'), true)}
                  {renderKey('A', () => handleKeyPress('a'), isPending('a'), true)}
                  {renderKey('F', () => handleKeyPress('f'), isPending('f'), true)}
                  <View style={styles.divider} />
                </>
              )}

              {renderKey('CTRL', () => handleModifier('ctrl'), ctrlPressed)}
              {renderKey('TAB', () => handleKeyPress('Tab'), isPending('Tab'))}
              {renderKey('ENTER', () => handleKeyPress('Enter'), isPending('Enter'), true)}
              {renderKey('SHFT', () => handleModifier('shift'), shiftPressed)}
              {renderKey('ALT', () => handleModifier('alt'), altPressed)}

              {renderIconKey('Undo', 'Undo')}
              {renderIconKey('Redo', 'Redo')}
              {renderIconKey('Search', 'Search')}

              {renderKey('ESC', () => handleKeyPress('Escape'), isPending('Escape'))}

              {renderIconKey('ArrowLeft', 'ArrowLeft')}
              {renderIconKey('ArrowDown', 'ArrowDown')}
              {renderIconKey('ArrowUp', 'ArrowUp')}
              {renderIconKey('ArrowRight', 'ArrowRight')}
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    backgroundColor: 'transparent',
    zIndex: 1000,
    elevation: 24,
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
    letterSpacing: 0,
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