import AsyncStorage from '@react-native-async-storage/async-storage';

export interface EnvVar {
  id: string;
  key: string;
  value: string;
  isSystem?: boolean; // Se é predefinida pelo sistema ou adicionada pelo usuário
}

const STORAGE_KEYS = {
  SETUP_COMPLETED: '@DevFlux_setupCompleted',
  ENV_VARS: '@DevFlux_envVars',
};

// Variáveis default sugeridas caso o usuário queira
const DEFAULT_ENV_VARS: EnvVar[] = [
  { id: '1', key: 'npm', value: '/usr/local/bin/npm', isSystem: true },
  { id: '2', key: 'node', value: '/usr/local/bin/node', isSystem: true },
];

export const EnvironmentService = {
  async hasCompletedSetup(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(STORAGE_KEYS.SETUP_COMPLETED);
      return val === 'true';
    } catch {
      return false;
    }
  },

  async completeSetup(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.SETUP_COMPLETED, 'true');
  },

  async getEnvVars(): Promise<EnvVar[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.ENV_VARS);
      if (data) {
        return JSON.parse(data);
      }
      return DEFAULT_ENV_VARS; // Se não houver nada, retorna os defaults
    } catch {
      return DEFAULT_ENV_VARS;
    }
  },

  async saveEnvVars(vars: EnvVar[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.ENV_VARS, JSON.stringify(vars));
  },

  async addEnvVar(newVar: Omit<EnvVar, 'id'>): Promise<EnvVar[]> {
    const current = await this.getEnvVars();
    const variable: EnvVar = {
      ...newVar,
      id: Date.now().toString(),
      isSystem: false,
    };
    const updated = [...current, variable];
    await this.saveEnvVars(updated);
    return updated;
  },

  async removeEnvVar(id: string): Promise<EnvVar[]> {
    const current = await this.getEnvVars();
    const updated = current.filter(v => v.id !== id);
    await this.saveEnvVars(updated);
    return updated;
  },

  async updateEnvVar(id: string, value: string): Promise<EnvVar[]> {
    const current = await this.getEnvVars();
    const updated = current.map(v => v.id === id ? { ...v, value } : v);
    await this.saveEnvVars(updated);
    return updated;
  },
  
  // Constrói um objeto chave-valor para ser injetado facilmente nos processos
  async buildEnvObject(): Promise<Record<string, string>> {
    const vars = await this.getEnvVars();
    return vars.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);
  }
};
