const fs = require('fs');
const path = require('path');

function processFile(filepath) {
    let content = fs.readFileSync(filepath, 'utf-8');

    if (!content.includes('import { theme }') && !content.includes('import {theme}')) {
        return;
    }

    // 1. Replace import
    content = content.replace(
        /import\s*\{\s*theme\s*\}\s*from\s*['"]([^'"]*?)theme['"];?/g,
        "import { useAppTheme } from '$1contexts/ThemeContext';\nimport { AppTheme } from '$1theme';"
    );

    // 2. Replace StyleSheet.create
    content = content.replace(
        /const styles = StyleSheet\.create\(/g,
        "const getStyles = (theme: AppTheme) => StyleSheet.create("
    );

    // 3. Insert hook into exported components
    const pattern = /(export\s+(?:default\s+)?(?:function\s+\w+\([^)]*\)|const\s+\w+\s*(?::\s*React\.FC(?:<[^>]+>)?\s*)?=\s*(?:<[^>]+>\s*)?\([^)]*\)\s*=>)\s*\{)/g;
    
    content = content.replace(pattern, (match, p1) => {
        return p1 + "\n  const { theme } = useAppTheme();\n  const styles = getStyles(theme);\n";
    });

    fs.writeFileSync(filepath, content, 'utf-8');
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            if (!['theme.ts', 'ThemeContext.tsx', 'CommandPaletteContext.tsx'].includes(file)) {
                processFile(fullPath);
            }
        }
    }
}

walkDir('c:/Users/user01/Documents/DevFlux/src');
console.log("Refactor Complete");
