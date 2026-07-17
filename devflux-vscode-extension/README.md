# DevFlex Live Sync

Extensão oficial do **DevFlex** para Visual Studio Code.

## Funcionalidades

- **Live Sync Engine**: Transmite as edições de arquivos feitas no VS Code diretamente para o seu aplicativo DevFlex Mobile via WebSocket em tempo real.
- **Integração Nativa**: Substitui a necessidade de rodar scripts manuais no Node.js.

## Como Usar

1. Abra um projeto no seu VS Code.
2. Aperte `Ctrl+Shift+P` (ou `Cmd+Shift+P` no Mac) para abrir o Command Palette.
3. Digite `DevFlex: Start Live Sync Server` e dê Enter.
4. Uma notificação com o seu IP local irá aparecer. O botão "DevFlex Sync" ficará verde na sua barra de status (rodapé).
5. No app DevFlex, vá em "Live Sync" e conecte-se usando o IP fornecido.

Pronto! Ao salvar qualquer arquivo (`Ctrl+S`), o código é sincronizado quase instantaneamente para o dispositivo móvel.

## Requisitos

Ambos o seu computador e o celular com DevFlux devem estar conectados na mesma rede Wi-Fi para que a comunicação do WebSocket seja possível.
