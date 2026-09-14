import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, BackHandler, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../contexts/LanguageContext';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: 1,
    title: 'Bem-vindo ao DevFlux',
    desc: 'O Cloud IDE de bolso. Construa aplicações completas de onde estiver, mesmo sem internet.',
    icon: 'Layout' as any,
    color: '#3498DB'
  },
  {
    id: 2,
    title: 'Edição Poderosa',
    desc: 'Equipado com o Monaco Editor. Auto-complete, Syntax Highlighting e dezenas de temas.',
    icon: 'Terminal' as any,
    color: '#9B59B6'
  },
  {
    id: 3,
    title: 'Mágica do Live Sync',
    desc: 'Conecte ao seu PC e edite seus projetos do VS Code em tempo real no celular.',
    icon: 'MonitorUp' as any,
    color: '#2ECC71'
  }
];

export default function OnboardingScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  
  const [currentIndex, setCurrentIndex] = useState(0);

  // Android hardware back button — go to previous slide or block exit
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => {
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
        return true;
      }
      return true; // Block exit during onboarding
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [currentIndex]);

  const handleNext = async () => {
    if (currentIndex < SLIDES.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      await AsyncStorage.setItem('@codeflex_onboarding_done', 'true');
      router.replace('/');
    }
  };

  const slide = SLIDES[currentIndex];

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.slideContent}>
        <View style={[styles.iconRing, { borderColor: slide.color + '40' }]}>
          <View style={[styles.iconCircle, { backgroundColor: slide.color + '20' }]}>
            <Icon name={slide.icon} size={64} color={slide.color} outline={false} />
          </View>
        </View>
        <Text style={styles.title}>{t(slide.title)}</Text>
        <Text style={styles.desc}>{t(slide.desc)}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((s, idx) => (
            <View 
              key={s.id} 
              style={[
                styles.dot, 
                idx === currentIndex && { backgroundColor: theme.colors.textPrimary, width: 24 }
              ]} 
            />
          ))}
        </View>
        
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
          <Text style={styles.nextText}>{currentIndex === SLIDES.length - 1 ? t('COMEÇAR') : t('PRÓXIMO')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  slideContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  desc: {
    fontSize: 16,
    fontFamily: theme.typography.ui,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    padding: 32,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    marginHorizontal: 4,
  },
  nextBtn: {
    backgroundColor: theme.colors.accentBlue,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: theme.typography.uiBold,
  }
});
