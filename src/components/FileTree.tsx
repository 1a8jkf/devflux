import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon, IconName } from './Icon';
import { Image } from 'react-native';
import type { FileNode as ProjectFileNode } from '../services/FileSystemService';
import { useLanguage } from '../contexts/LanguageContext';

interface FileNode extends Omit<ProjectFileNode, 'children'> {
  children?: FileNode[];
  isExpanded?: boolean;
  isRemote?: boolean;
}

interface FileTreeProps {
  data: FileNode[];
  onFilePress: (file: FileNode) => void;
  onFileLongPress?: (file: FileNode) => void;
  onFileDrop?: (source: FileNode, target: FileNode) => void;
  dirtyFileIds?: Set<string> | string[];
}

const getFileIcon = (file: FileNode, theme: AppTheme): { name: IconName; color: string } => {
  if (file.type === 'directory') {
    return { name: file.isExpanded ? 'FolderOpen' : 'Folder', color: theme.colors.accentBlue };
  }
  switch (file.fileType) {
    case 'json': return { name: 'Braces', color: theme.colors.textPrimary };
    case 'markdown': return { name: 'FileText', color: theme.colors.textSecondary };
    default: return { name: 'File', color: theme.colors.textSecondary };
  }
};

const getFileImage = (file: FileNode) => {
  if (file.type === 'directory') return null;
  switch (file.fileType) {
    case 'html': return require('../../assets/html.png');
    case 'css': return require('../../assets/css.png');
    case 'js':
    case 'jsx': return require('../../assets/js.png');
    case 'ts':
    case 'tsx': return require('../../assets/js.png'); // Fallback para js pois tsx.png esta vazio (0 bytes)
    case 'py':
    case 'python': return require('../../assets/python.png');
    case 'c':
    case 'cpp': return require('../../assets/c-.png');
    case 'cs':
    case 'csharp': return require('../../assets/c-sharp.png');
    default: return null;
  }
};

const hasDirtyFile = (dirtyFileIds: Set<string> | string[] | undefined, path?: string) => {
  if (!path || !dirtyFileIds) return false;
  return dirtyFileIds instanceof Set ? dirtyFileIds.has(path) : dirtyFileIds.includes(path);
};

const FileTreeNode: React.FC<{
  node: FileNode;
  level: number;
  draggedNode: FileNode | null;
  setDraggedNode: (node: FileNode | null) => void;
  onFilePress: (file: FileNode) => void;
  onFileLongPress?: (file: FileNode) => void;
  onFileDrop?: (source: FileNode, target: FileNode) => void;
  onToggleExpand: (id: string) => void;
  dirtyFileIds?: Set<string> | string[];
}> = ({ node, level, draggedNode, setDraggedNode, onFilePress, onFileLongPress, onFileDrop, onToggleExpand, dirtyFileIds }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { t } = useLanguage();
  const paddingLeft = level * 16 + 8;
  const { name, color } = getFileIcon(node, theme);
  const imageSource = getFileImage(node);
  const isDropTarget = !!draggedNode && draggedNode.id !== node.id;
  const isDirty = node.type === 'file' && hasDirtyFile(dirtyFileIds, node.path);

  const handleDrop = () => {
    if (!draggedNode || draggedNode.id === node.id) return;
    onFileDrop?.(draggedNode, node);
    setDraggedNode(null);
  };

  const webDragProps = Platform.OS === 'web' ? ({
    onContextMenu: (event: any) => {
      event.preventDefault();
      onFileLongPress?.(node);
    },
    draggable: true,
    onDragStart: (event: any) => {
      setDraggedNode(node);
      event.dataTransfer?.setData('text/plain', node.path || node.id);
      event.dataTransfer?.setDragImage?.(event.currentTarget, 8, 8);
    },
    onDragOver: (event: any) => {
      if (isDropTarget) event.preventDefault();
    },
    onDrop: (event: any) => {
      event.preventDefault();
      handleDrop();
    },
    onDragEnd: () => setDraggedNode(null),
  } as any) : {};

  return (
    <View>
      <TouchableOpacity
        {...webDragProps}
        style={[
          styles.node,
          Platform.OS === 'web' && ({ cursor: draggedNode?.id === node.id ? 'grabbing' : 'grab' } as any),
          isDropTarget && node.type === 'directory' && styles.nodeDropTarget,
          draggedNode?.id === node.id && styles.nodeDragging,
          { paddingLeft },
        ]}
        onLongPress={() => onFileLongPress?.(node)}
        onPress={() => {
          if (node.type === 'directory') {
            if (draggedNode && draggedNode.id !== node.id) {
              handleDrop();
              return;
            }
            onToggleExpand(node.id);
          } else {
            onFilePress(node);
          }
        }}
      >
        <View style={styles.iconContainer}>
          {node.type === 'directory' && (
            <Icon
              name={node.isExpanded ? "ChevronDown" : "ChevronRight"}
              size={14}
              color={theme.colors.textSecondary}
            />
          )}
          {node.type !== 'directory' && <View style={{ width: 14 }} />}
        </View>
        {imageSource ? (
          <Image
            source={imageSource}
            style={{ width: 16, height: 16, resizeMode: 'contain' }}
          />
        ) : (
          <Icon name={name} size={16} color={color} />
        )}
        <Text style={styles.nodeText} numberOfLines={1}>{node.name}</Text>
        <View style={styles.nodeBadges}>
          {isDirty && <View accessibilityLabel={t('Arquivo não salvo')} style={styles.dirtyDot} />}
          {(node as any).isRemote && <Icon name="Cloud" size={12} color={theme.colors.accentBlue} />}
        </View>
      </TouchableOpacity>

      {node.type === 'directory' && node.isExpanded && node.children && (
        <View>
          {node.children.map(child => (
            <FileTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              draggedNode={draggedNode}
              setDraggedNode={setDraggedNode}
              onFilePress={onFilePress}
              onFileLongPress={onFileLongPress}
              onFileDrop={onFileDrop}
              onToggleExpand={onToggleExpand}
              dirtyFileIds={dirtyFileIds}
            />
          ))}
        </View>
      )}
    </View>
  );
};

export const FileTree: React.FC<FileTreeProps> = ({ data, onFilePress, onFileLongPress, onFileDrop, dirtyFileIds }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { t } = useLanguage();

  const [treeData, setTreeData] = useState(data);
  const [draggedNode, setDraggedNode] = useState<FileNode | null>(null);

  useEffect(() => {
    // Preserve expanded state if possible
    const mergeState = (newData: FileNode[], oldData: FileNode[]): FileNode[] => {
      return newData.map(newNode => {
        const oldNode = oldData.find(n => n.id === newNode.id);
        return {
          ...newNode,
          isExpanded: oldNode ? oldNode.isExpanded : false,
          children: newNode.children && oldNode?.children ? mergeState(newNode.children, oldNode.children) : newNode.children
        };
      });
    };
    setTreeData(prev => mergeState(data, prev));
  }, [data]);

  const toggleExpand = (id: string, nodes: FileNode[] = treeData): FileNode[] => {
    return nodes.map(node => {
      if (node.id === id) {
        return { ...node, isExpanded: !node.isExpanded };
      }
      if (node.children) {
        return { ...node, children: toggleExpand(id, node.children) };
      }
      return node;
    });
  };

  const handleToggle = (id: string) => {
    setTreeData(toggleExpand(id));
  };

  return (
    <ScrollView style={styles.container}>
      {treeData.length === 0 ? (
        <View style={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ color: '#666', fontSize: 12, textAlign: 'center' }}>{t('Nenhum arquivo encontrado.')}{`\n`}{t('Conecte ao PC e toque em atualizar')}</Text>
        </View>
      ) : (
        treeData.map(node => (
          <FileTreeNode
            key={node.id}
            node={node}
            level={0}
            draggedNode={draggedNode}
            setDraggedNode={setDraggedNode}
            onFilePress={onFilePress}
            onFileLongPress={onFileLongPress}
            onFileDrop={onFileDrop}
            onToggleExpand={handleToggle}
            dirtyFileIds={dirtyFileIds}
          />
        ))
      )}
    </ScrollView>
  );
};

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  node: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 16,
  },
  nodeDragging: {
    opacity: 0.5,
    backgroundColor: theme.colors.bgElevated,
    borderColor: theme.colors.accentBlue,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  nodeDropTarget: {
    backgroundColor: theme.colors.accentBlue + '18',
  },
  iconContainer: {
    width: 20,
    alignItems: 'center',
    marginRight: 4,
  },
  nodeText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 14,
    marginLeft: 8,
    flexShrink: 1,
  },
  nodeBadges: {
    marginLeft: 'auto',
    marginRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dirtyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accentBlue,
  },
});

