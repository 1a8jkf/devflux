import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon, IconName } from './Icon';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'directory';
  fileType?: string;
  children?: FileNode[];
  isExpanded?: boolean;
  path?: string;
}

interface FileTreeProps {
  data: FileNode[];
  onFilePress: (file: FileNode) => void;
  onFileLongPress?: (file: FileNode) => void;
}

const getFileIcon = (file: FileNode, theme: AppTheme): { name: IconName; color: string } => {
  if (file.type === 'directory') {
    return { name: file.isExpanded ? 'FolderOpen' : 'Folder', color: theme.colors.accentBlue };
  }
  switch (file.fileType) {
    case 'html': return { name: 'FileCode2', color: theme.colors.accentBlue };
    case 'css': return { name: 'FileJson', color: theme.colors.accentBlue };
    case 'js': return { name: 'FileCode', color: theme.colors.accentTeal };
    case 'jsx': return { name: 'FileBox', color: theme.colors.accentAmber };
    case 'json': return { name: 'Braces', color: theme.colors.textPrimary };
    case 'markdown': return { name: 'FileText', color: theme.colors.textSecondary };
    default: return { name: 'File', color: theme.colors.textSecondary };
  }
};

const FileTreeNode: React.FC<{
  node: FileNode;
  level: number;
  onFilePress: (file: FileNode) => void;
  onFileLongPress?: (file: FileNode) => void;
  onToggleExpand: (id: string) => void;
}> = ({ node, level, onFilePress, onFileLongPress, onToggleExpand }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const paddingLeft = level * 16 + 8;
  const { name, color } = getFileIcon(node, theme);

  return (
    <View>
      <TouchableOpacity 
        style={[styles.node, { paddingLeft }]} 
        onLongPress={() => onFileLongPress?.(node)}
        onPress={() => {
          if (node.type === 'directory') {
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
          {!node.type && <View style={{ width: 14 }} />}
        </View>
        <Icon name={name} size={16} color={color} />
        <Text style={styles.nodeText}>{node.name}</Text>
        {(node as any).isRemote && (
          <Icon name="Cloud" size={12} color={theme.colors.accentBlue} style={{ marginLeft: 'auto', marginRight: 16 }} />
        )}
      </TouchableOpacity>
      
      {node.type === 'directory' && node.isExpanded && node.children && (
        <View>
          {node.children.map(child => (
            <FileTreeNode 
              key={child.id} 
              node={child} 
              level={level + 1} 
              onFilePress={onFilePress}
              onFileLongPress={onFileLongPress}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </View>
      )}
    </View>
  );
};

export const FileTree: React.FC<FileTreeProps> = ({ data, onFilePress, onFileLongPress }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  const [treeData, setTreeData] = useState(data);

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
    // Use functional update to always access fresh treeData
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
          <Text style={{ color: '#666', fontSize: 12, textAlign: 'center' }}>Nenhum arquivo encontrado.{`\n`}Conecte ao PC e toque em ↺</Text>
        </View>
      ) : (
        treeData.map(node => (
          <FileTreeNode 
            key={node.id} 
            node={node} 
            level={0} 
            onFilePress={onFilePress} 
            onFileLongPress={onFileLongPress}
            onToggleExpand={handleToggle} 
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
  },
});
