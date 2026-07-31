<div align="center">
  <img src="./assets/AppIcons/playstore.png" alt="DevFlux Logo" width="120" />
  <h1>DevFlux Labs 🧪</h1>
  <p>O <b>canivete suíço de bolso</b> para desenvolvedores e sysadmins.</p>
</div>

<br/>

## 🚀 Sobre o Projeto

O **DevFlux** é um aplicativo mobile inovador (SaaS Freemium) focado em colocar o poder de um sistema operacional de servidor inteiro na palma da sua mão. Seja para reiniciar um serviço remotamente, debugar um banco de dados numa viagem ou editar um arquivo essencial na praia, o DevFlux é a sua suíte de sobrevivência técnica.

### Por que ele é único?
Diferente de clientes SSH comuns, o DevFlux roda um ecossistema **Alpine Linux** real nativamente no seu celular (graças à injeção de C++ via `nodejs-mobile` e `PRoot`).

## 🔋 Funcionalidades (Features)

- 🐧 **Linux Nativão**: Emulação do ambiente Alpine Linux (PRoot) no fundo.
- 💻 **Terminal Integrado**: Xterm.js perfeitamente acoplado à API do Android.
- 📦 **Node.js Pocket**: Rode scripts em Node, Express ou servidores locais direto do aparelho.
- 🗄️ **Database Manager**: Conecte e inspecione bancos (MariaDB/MySQL, PostgreSQL) (Feature Pro).
- 🔄 **Live Sync / Cloud Sync**: Sincronize arquivos de configuração e scripts essenciais (Feature Pro).
- 💵 **Paywall Integrado**: Integração pronta e madura com a infraestrutura do **RevenueCat**.

## 🛠️ Arquitetura Técnica

- **Frontend**: React Native 0.74 (Expo SDK 51)
- **Engine Core**: `nodejs-mobile-react-native` (customizado)
- **Camada C/C++**: `libpty-wrapper.so` injetada via JNI para habilitar pty/tty e `libproot.so`.
- **Estilização**: Tailwind / NativeWind (tema Cyberpunk/Dark-moderno)
- **Monetização**: `react-native-purchases` (RevenueCat)

## 📦 Como rodar localmente

Como o projeto envolve bibliotecas pré-compiladas pesadas de C++ em ARM (para rodar no celular físico real e não quebrar no emulador), o fluxo de build é otimizado para produção:

1. Instale as dependências:
```bash
npm install
```

2. Rode a script de Build Nativa otimizada:
```bash
bash build_apk.sh
```
> O script fará a compilação do C/C++, pulará o Gradle Linting pesado e ejetará o `app-release.apk`.

## 💼 Modelo de Negócios (Freemium)

Idealizado para atingir o público Indie Hacker e Freelancers:
- **Gratuito**: Acesso ao Terminal local, Editor de Texto.
- **Assinatura (Pro)**: Acesso ilimitado à nuvem, Banco de Dados, Sincronização e Temas avançados. Com ~1% de conversão, já cobre tranquilamente os custos de servidor para rodar o Syncing.

## 📄 Licença
Todos os direitos reservados.
