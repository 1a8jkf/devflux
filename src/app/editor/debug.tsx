import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { Icon } from '../../components/Icon';
import { DebugService, DebugEvent, DebugLevel, DebugSource } from '../../services/DebugService';
import { ContextManager } from '../../services/ContextManager';
import { FileSystemService, ProjectInfo } from '../../services/FileSystemService';

const SOURCE_FILTERS: (DebugSource | 'all')[] = ['all', 'file', 'editor', 'shell', 'browser', 'liveSync', 'github', 'ai', 'runtime'];
const LEVEL_FILTERS: (DebugLevel | 'all')[] = ['all', 'error', 'warn', 'info'];
const GLOBAL_SESSION_SOURCES = new Set<DebugSource>(['liveSync', 'runtime', 'system']);

const routeParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default function ProjectDebugScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [sourceFilter, setSourceFilter] = useState<DebugSource | 'all'>('all');
  const [levelFilter, setLevelFilter] = useState<DebugLevel | 'all'>('all');

  const projectId = routeParam(params.projectId as string | string[] | undefined) || ContextManager.getActiveProject();

  useEffect(() => {
    if (projectId) ContextManager.setActiveProject(projectId);
  }, [projectId]);

  useEffect(() => {
    return DebugService.subscribe(nextEvents => setEvents(nextEvents));
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadProject = async () => {
      if (!projectId) {
        setProject(null);
        return;
      }
      try {
        const projects = await FileSystemService.getProjects();
        if (!mounted) return;
        setProject(projects.find(item => item.id === projectId) || null);
      } catch (error: any) {
        if (!mounted) return;
        DebugService.log('file', 'error', 'Projeto não carregou para o Debug.', { project: projectId, error: error?.message || String(error) });
      }
    };
    loadProject();
    return () => { mounted = false; };
  }, [projectId]);

  const scopedEvents = useMemo(() => {
    return events.filter(event => {
      const eventProject = typeof event.context?.project === 'string' ? event.context.project : undefined;

      if (projectId) {
        if (eventProject && eventProject !== projectId) return false;
        if (!eventProject && !GLOBAL_SESSION_SOURCES.has(event.source)) return false;
      }

      if (sourceFilter !== 'all' && event.source !== sourceFilter) return false;
      if (levelFilter !== 'all' && event.level !== levelFilter) return false;
      return true;
    });
  }, [events, projectId, sourceFilter, levelFilter]);

  const openEventFile = (event: DebugEvent) => {
    const targetProject = typeof event.context?.project === 'string' ? event.context.project : projectId;
    if (!targetProject || !event.context?.file) return;
    router.push({
      pathname: '/editor/codigo',
      params: {
        projectId: targetProject,
        openFile: event.context.file,
        goToLine: event.context.line ? String(event.context.line) : undefined,
      },
    });
  };

  const getLevelColor = (level: DebugLevel) => {
    if (level === 'error') return theme.colors.error;
    if (level === 'warn') return theme.colors.accentAmber;
    return theme.colors.accentBlue;
  };

  const getSourceIcon = (source: DebugSource) => {
    switch (source) {
      case 'editor': return 'FileText';
      case 'browser': return 'Globe';
      case 'shell': return 'Terminal';
      case 'ai': return 'Bot';
      case 'liveSync': return 'MonitorUp';
      case 'github': return 'Github';
      case 'runtime': return 'Cpu';
      case 'file': return 'FileCode';
      default: return 'Settings';
    }
  };

  const formatContext = (event: DebugEvent) => {
    if (!event.context) return '';
    return Object.entries(event.context)
      .filter(([key]) => key !== 'project')
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('  ');
  };

  const renderEvent = ({ item }: { item: DebugEvent }) => {
    const context = formatContext(item);
    const canOpenFile = !!item.context?.file;
    return (
      <TouchableOpacity
        style={[styles.eventItem, canOpenFile && styles.eventItemClickable]}
        onPress={() => openEventFile(item)}
        disabled={!canOpenFile}
      >
        <View style={styles.eventHeader}>
          <Icon name={getSourceIcon(item.source) as any} size={14} color={theme.colors.textSecondary} />
          <Text style={styles.eventSource}>{item.source.toUpperCase()}</Text>
          <Text style={[styles.eventLevel, { color: getLevelColor(item.level) }]}>{item.level.toUpperCase()}</Text>
          <View style={styles.eventSpacer} />
          <Text style={styles.eventTime}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
        </View>
        <Text style={[styles.eventMessage, item.level === 'error' && styles.eventMessageError]}>{item.message}</Text>
        {!!context && <Text style={styles.eventContext} numberOfLines={3}>{context}</Text>}
      </TouchableOpacity>
    );
  };

  if (!projectId) {
    return (
      <View style={[styles.container, styles.emptyState, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Icon name="Activity" size={36} color={theme.colors.textSecondary} />
        <Text style={styles.emptyTitle}>Debug do projeto</Text>
        <Text style={styles.emptyText}>Abra um projeto para visualizar os eventos reais daquele contexto.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Debug</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{project?.name || projectId}</Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={() => DebugService.clear(projectId)}>
          <Icon name="Trash2" size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterBand}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {SOURCE_FILTERS.map(source => (
            <TouchableOpacity key={source} style={[styles.filterChip, sourceFilter === source && styles.filterChipActive]} onPress={() => setSourceFilter(source)}>
              <Text style={[styles.filterText, sourceFilter === source && styles.filterTextActive]}>{source === 'all' ? 'TODOS' : source.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.levelFilters}>
          {LEVEL_FILTERS.map(level => (
            <TouchableOpacity key={level} style={[styles.filterChip, levelFilter === level && styles.filterChipActive]} onPress={() => setLevelFilter(level)}>
              <Text style={[styles.filterText, levelFilter === level && styles.filterTextActive]}>{level === 'all' ? 'NIVEIS' : level.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={scopedEvents}
        renderItem={renderEvent}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhum evento registrado para este projeto.</Text>}
      />
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
  },
  title: {
    fontFamily: theme.typography.uiBold,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  filterBand: {
    paddingVertical: 10,
    paddingLeft: 12,
    backgroundColor: theme.colors.bgSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  levelFilters: {
    marginTop: 8,
  },
  filterChip: {
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: theme.colors.accentBlue,
    borderColor: theme.colors.accentBlue,
  },
  filterText: {
    fontFamily: theme.typography.uiBold,
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  filterTextActive: {
    color: '#FFF',
  },
  listContent: {
    padding: 12,
  },
  eventItem: {
    padding: 12,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  eventItemClickable: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accentBlue,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  eventSpacer: {
    flex: 1,
  },
  eventSource: {
    fontFamily: theme.typography.uiBold,
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginLeft: 6,
    marginRight: 8,
  },
  eventLevel: {
    fontFamily: theme.typography.mono,
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventTime: {
    fontFamily: theme.typography.mono,
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  eventMessage: {
    fontFamily: theme.typography.mono,
    fontSize: 13,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  eventMessageError: {
    color: theme.colors.error,
  },
  eventContext: {
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: theme.colors.accentPurple,
    opacity: 0.9,
  },
  emptyTitle: {
    marginTop: 12,
    fontFamily: theme.typography.uiBold,
    fontSize: 18,
    color: theme.colors.textPrimary,
  },
  emptyText: {
    marginTop: 8,
    fontFamily: theme.typography.ui,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: theme.colors.textSecondary,
  },
});