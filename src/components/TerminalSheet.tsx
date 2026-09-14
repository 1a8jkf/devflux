import React, { useRef, useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, PanResponder, useWindowDimensions } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from './Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TerminalView, TerminalViewRef } from './TerminalView';

import { terminalSheetHeights } from '../utils/terminalLayout';

interface TerminalSheetProps {
  projectId: string;
  visible?: boolean;
  onOpenInTab?: () => void;
  availableHeight?: number;
}

export interface TerminalSheetRef {
  snapToIndex: (index: number) => void;
  expand: () => void;
  collapse: () => void;
  runCommand: (cmd: string) => void;
  reset: () => void;
}

export const TerminalSheet = forwardRef<TerminalSheetRef, TerminalSheetProps>(({ projectId, visible = true, onOpenInTab, availableHeight }, ref) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();
  
  const { height: windowHeight } = useWindowDimensions();
  const [MIN_HEIGHT, MID_HEIGHT, MAX_HEIGHT] = terminalSheetHeights(availableHeight || windowHeight, insets.bottom);

  const heightAnim = useRef(new Animated.Value(MIN_HEIGHT)).current;
  const lastHeight = useRef(MIN_HEIGHT);
  const [isExpanded, setIsExpanded] = useState(false);
  const snapIndex = useRef(0);
  const [terminalResetKey, setTerminalResetKey] = useState(0);

  useEffect(() => {
    const target = [MIN_HEIGHT, MID_HEIGHT, MAX_HEIGHT][snapIndex.current];
    heightAnim.stopAnimation();
    heightAnim.setValue(target);
    lastHeight.current = target;
  }, [MIN_HEIGHT, MID_HEIGHT, MAX_HEIGHT, heightAnim]);

  const snapTo = useCallback((target: number) => {
    snapIndex.current = target <= MIN_HEIGHT ? 0 : target >= MAX_HEIGHT ? 2 : 1;
    lastHeight.current = target;
    setIsExpanded(target > MIN_HEIGHT + 10);
    Animated.spring(heightAnim, {
      toValue: target,
      useNativeDriver: false,
      friction: 10,
      tension: 60,
    }).start();
  }, [MIN_HEIGHT, MAX_HEIGHT, heightAnim]);

  const terminalViewRef = useRef<TerminalViewRef>(null);

  const resetTerminal = () => {
    setTerminalResetKey(prev => prev + 1);
  };

  useImperativeHandle(ref, () => ({
    snapToIndex: (index: number) => {
      const targets = [MIN_HEIGHT, MID_HEIGHT, MAX_HEIGHT];
      snapTo(targets[index] || MIN_HEIGHT);
    },
    expand: () => snapTo(MAX_HEIGHT),
    collapse: () => snapTo(MIN_HEIGHT),
    runCommand: (cmd: string) => {
      terminalViewRef.current?.runCommand?.(cmd);
    },
    reset: resetTerminal
  }));

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        heightAnim.stopAnimation(value => { lastHeight.current = value; });
      },
      onPanResponderMove: (_, gs) => {
        let newHeight = lastHeight.current - gs.dy;
        if (newHeight < MIN_HEIGHT) newHeight = MIN_HEIGHT;
        if (newHeight > MAX_HEIGHT) newHeight = MAX_HEIGHT;
        heightAnim.setValue(newHeight);
      },
      onPanResponderRelease: (_, gs) => {
        const current = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, lastHeight.current - gs.dy));
        const velocity = gs.vy;

        // Snap to nearest point based on position and velocity
        if (velocity > 1.5 || current < MIN_HEIGHT + 40) {
          snapTo(MIN_HEIGHT);
        } else if (velocity < -1.5 || current > MID_HEIGHT + (MAX_HEIGHT - MID_HEIGHT) / 2) {
          snapTo(MAX_HEIGHT);
        } else if (current > MIN_HEIGHT + 40) {
          snapTo(MID_HEIGHT);
        } else {
          snapTo(MIN_HEIGHT);
        }
      },
    })
  , [MIN_HEIGHT, MID_HEIGHT, MAX_HEIGHT, heightAnim, snapTo]);

  const toggleExpand = () => {
    if (isExpanded) {
      snapTo(MIN_HEIGHT);
    } else {
      snapTo(MID_HEIGHT);
    }
  };

  return (
    <Animated.View style={[styles.container, { height: heightAnim, paddingBottom: insets.bottom, display: visible ? 'flex' : 'none' }]}>
      {/* Drag handle */}
      <View {...panResponder.panHandlers} style={styles.handleArea}>
        <View style={styles.handleBar} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.greenDot} />
        <Text style={styles.headerTitle} numberOfLines={1}>projects/{projectId}</Text>
        <View style={{ flex: 1 }} />
        {onOpenInTab && (
          <TouchableOpacity style={styles.headerIconButton} onPress={onOpenInTab} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="Maximize2" size={15} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.headerIconButton} onPress={resetTerminal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="RefreshCw" size={15} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIconButton} onPress={toggleExpand} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name={isExpanded ? 'ChevronDown' : 'ChevronUp'} size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Terminal content — uses separate Alpine session for each project */}
      <View style={styles.terminalArea}>
        <TerminalView ref={terminalViewRef} projectId={projectId} sessionId={`sheet-${projectId}`} resetKey={terminalResetKey} />
      </View>
    </Animated.View>
  );
});

TerminalSheet.displayName = 'TerminalSheet';

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    overflow: 'hidden',
    zIndex: 100,
    elevation: 20,
  },
  handleArea: {
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 36,
    paddingVertical: 4,
    backgroundColor: '#000000',
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  headerTitle: {
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginLeft: 6,
    maxWidth: '62%',
  },
  headerIconButton: {
    width: 30,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  terminalArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
