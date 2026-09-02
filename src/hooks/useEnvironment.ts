import { useState, useEffect, useCallback } from 'react';
import { EnvironmentService, EnvVar } from '../services/EnvironmentService';

export function useEnvironment() {
  const [hasCompletedSetup, setHasCompletedSetup] = useState<boolean>(true);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const completed = await EnvironmentService.hasCompletedSetup();
      setHasCompletedSetup(completed);
      
      const vars = await EnvironmentService.getEnvVars();
      setEnvVars(vars);
    } catch (e) {
      console.error('Failed to load environment config', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const completeSetup = async () => {
    await EnvironmentService.completeSetup();
    setHasCompletedSetup(true);
  };

  const addEnvVar = async (newVar: Omit<EnvVar, 'id'>) => {
    const updated = await EnvironmentService.addEnvVar(newVar);
    setEnvVars(updated);
  };

  const removeEnvVar = async (id: string) => {
    const updated = await EnvironmentService.removeEnvVar(id);
    setEnvVars(updated);
  };

  const updateEnvVar = async (id: string, value: string) => {
    const updated = await EnvironmentService.updateEnvVar(id, value);
    setEnvVars(updated);
  };

  return {
    loading,
    hasCompletedSetup,
    envVars,
    completeSetup,
    addEnvVar,
    removeEnvVar,
    updateEnvVar,
    refresh: loadData
  };
}
