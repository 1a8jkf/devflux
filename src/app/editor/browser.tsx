import React, { useState, useRef } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { Icon } from '../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const INJECT_ERUDA = `
  (function() {
    if (window.eruda) return;
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/eruda';
    document.body.appendChild(script);
    script.onload = function () {
      eruda.init();
    };
  })();
  true;
`;

export default function BrowserScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [urlInput, setUrlInput] = useState('http://localhost:5173');
  const [currentUrl, setCurrentUrl] = useState('http://localhost:5173');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  
  const webviewRef = useRef<WebView>(null);

  const handleGo = () => {
    let finalUrl = urlInput;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'http://' + finalUrl;
    }
    setCurrentUrl(finalUrl);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Icon name="X" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        
        <View style={styles.navGroup}>
          <TouchableOpacity 
            style={[styles.iconBtn, !canGoBack && { opacity: 0.5 }]} 
            disabled={!canGoBack}
            onPress={() => webviewRef.current?.goBack()}
          >
            <Icon name="ArrowLeft" size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.iconBtn, !canGoForward && { opacity: 0.5 }]} 
            disabled={!canGoForward}
            onPress={() => webviewRef.current?.goForward()}
          >
            <Icon name="ArrowRight" size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => webviewRef.current?.reload()}>
            <Icon name="RotateCw" size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.addressBar}>
          <TextInput
            style={styles.addressInput}
            value={urlInput}
            onChangeText={setUrlInput}
            onSubmitEditing={handleGo}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
          />
        </View>
      </View>

      <WebView
        ref={webviewRef}
        source={{ uri: currentUrl }}
        style={styles.webview}
        injectedJavaScript={INJECT_ERUDA}
        onNavigationStateChange={(navState) => {
          setCanGoBack(navState.canGoBack);
          setCanGoForward(navState.canGoForward);
          if (navState.url && navState.url !== 'about:blank') {
            setUrlInput(navState.url);
          }
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView error: ', nativeEvent);
        }}
      />
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
    gap: 8,
  },
  iconBtn: {
    padding: 8,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressBar: {
    flex: 1,
    backgroundColor: theme.colors.bgSurface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addressInput: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.mono,
    fontSize: 14,
    padding: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: '#fff',
  }
});
