import { pt } from './translations/pt';
import { en } from './translations/en';
import { es } from './translations/es';

export type Language = 'pt' | 'en' | 'es';

export const translations = {
  pt,
  en,
  es,
};

export type TranslationDictionary = typeof pt;

export function getTranslation(dict: any, key: string): string {
  if (dict && typeof dict === 'object' && key in dict && typeof dict[key] === 'string') {
    return dict[key];
  }

  const keys = key.split('.');
  let result = dict;
  for (const k of keys) {
    if (result && typeof result === 'object' && k in result) {
      result = result[k];
    } else {
      return key;
    }
  }
  return typeof result === 'string' ? result : key;
}
