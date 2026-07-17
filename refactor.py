import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'import { theme }' not in content and 'import {theme}' not in content:
        return

    # 1. Replace import
    content = re.sub(
        r"import\s*\{\s*theme\s*\}\s*from\s*['\"]([^'\"]*?)theme['\"];?",
        r"import { useAppTheme } from '\1contexts/ThemeContext';\nimport { AppTheme } from '\1theme';",
        content
    )

    # 2. Replace StyleSheet.create
    content = re.sub(
        r"const styles = StyleSheet\.create\(",
        r"const getStyles = (theme: AppTheme) => StyleSheet.create(",
        content
    )

    # 3. Insert hook into exported components
    pattern = r"(export\s+(?:default\s+)?(?:function\s+\w+\([^)]*\)|const\s+\w+\s*(?::\s*React\.FC(?:<[^>]+>)?\s*)?=\s*(?:<[^>]+>\s*)?\([^)]*\)\s*=>)\s*\{)"
    
    def repl(m):
        return m.group(1) + "\n  const { theme } = useAppTheme();\n  const styles = getStyles(theme);\n"
        
    content = re.sub(pattern, repl, content)

    # Replace usages of theme outside of components that were missed?
    # No, theme.colors is used in styles. 
    # What if theme is used in navigation options? (e.g. in _layout.tsx)
    # expo-router _layout.tsx usually has `theme.colors...` in screenOptions.
    # Those are inside components, so `theme` is available from the hook.

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for root, dirs, files in os.walk('c:/Users/user01/Documents/DevFlux/src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            if file not in ['theme.ts', 'ThemeContext.tsx', 'CommandPaletteContext.tsx']:
                process_file(os.path.join(root, file))

print("Refactor Complete")
