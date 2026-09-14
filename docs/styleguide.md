# Guia de Estilo CodeFlex

Este documento serve como referência rápida para o Design System do CodeFlex, implementado no arquivo `src/theme.ts`.

## Cores

### Tema Escuro (Padrão)
- **Fundo Principal (`bg-primary`)**: `#0F172A`
- **Superfície Elevada (`bg-elevated`)**: `#1E293B` (Usado em cards, painéis, barras e modais)
- **Superfície de Código (`bg-surface`)**: `#111827` (Usado exclusivamente no editor de código e terminal)
- **Bordas (`border`)**: `#334155`

### Acentos e Ações
- **Azul (`accent-blue`)**: `#2563EB` (Ações primárias, links, botões principais, HTML)
- **Teal (`accent-teal`)**: `#0EA5A9` (Sucesso, status de sync ativo, JS)
- **Âmbar (`accent-amber`)**: `#D97706` (Atenção, alertas, abas não salvas, plano Pro)
- **Roxo (`accent-purple`)**: `#7C3AED` (Tudo relacionado à Inteligência Artificial e BYOK)
- **Perigo (`danger`)**: `#EF4444` (Erros, conflitos Git, exclusões)

### Tipografia
- **UI (Texto Geral)**: Fonte padrão do sistema (Inter/Roboto/San Francisco), utilizada em todo o aplicativo (menus, botões, descrições).
- **Código (Monoespaçada)**: Fonte monospace padrão, usada no editor, no terminal, nos blocos de código do chat de IA e em indicações de branches/commits.

### Espaçamento e Grid
Baseado em um grid de 4px:
- `4px` / `8px` / `12px` / `16px` / `24px` / `32px`
- Os componentes geralmente seguem `16px` para paddings internos de container, e `8-12px` entre elementos relacionados.

### Arredondamento (Border Radius)
- Elementos pequenos/botões: `8px`
- Cards e Modais: `12px` a `16px`
- Botões redondos/Avatares: Totalmente arredondados (`9999px`)

### Ícones
- Utilizada a biblioteca `lucide-react-native` (traço de 2px, base 24x24).
- Ações desativas/Padrão usam a versão outline.
- Cores de ícones acompanham o estado do item (Teal para sucesso, Purple para IA, etc.).
