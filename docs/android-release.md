# Android release - DevFlux

Status em 2026-09-10: APK e AAB assinados gerados e validados tecnicamente.
Publicacao ainda depende da revisao de politica e da homologacao em aparelho.
Testes unitarios e verificacoes ELF nao substituem um teste do AAB instalado pelo Google Play.

## Assinatura

O plugin `plugins/withDevFluxAndroid.js` aplica `scripts/android-release.gradle`.
Release sem credenciais falha; nao existe fallback para o certificado de debug.
O Gradle valida o alias, certificado, validade e acesso a chave privada, sem imprimir senhas.

Para build local, fornecer estas variaveis de ambiente ou propriedades no Gradle do usuario:

- `DEVFLUX_UPLOAD_STORE_FILE`: caminho absoluto do keystore de upload existente.
- `DEVFLUX_UPLOAD_STORE_PASSWORD`.
- `DEVFLUX_UPLOAD_KEY_ALIAS`.
- `DEVFLUX_UPLOAD_KEY_PASSWORD`.

Nao colocar credenciais no repositorio nem enviar senhas pelo chat. Os nomes acima usam
o prefixo completo em todas as quatro variaveis.
O usuario confirmou PRIMEIRO ENVIO. Foi criada uma nova chave de upload em
`~/.config/devflux/signing/com.marcos.devflux/upload-keystore.p12`, alias `devflux-upload`.
A keystore antiga na raiz do projeto foi preservada.
O Gradle le `credentials.json` nessa pasta privada quando nao ha configuracao explicita;
`DEVFLUX_SIGNING_DIR` permite escolher outra pasta. Configuracoes parciais sao rejeitadas,
sem misturar senhas da chave local com valores externos.
Diretorio com permissao 0700 e arquivos privados 0600. Fazer backup criptografado
da pasta completa (chave E credenciais); nao publicar nem anexar ao pacote da loja.
`node scripts/configure-android-signing.cjs` mostra apenas dados publicos.
O argumento `--create` existe para uma primeira configuracao e RECUSA substituir arquivos.
Uma configuracao de release injetada pelo EAS e preservada, mas precisa ser validada
no build real do EAS; nao houve envio ou acesso a credenciais remotas.

Comandos locais:

```sh
npm run android:release
bash build_apk.sh
bash scripts/build_android_release.sh both
npm run android:audit
```

Os dois primeiros geram AAB e APK respectivamente; `both` gera ambos na mesma
invocacao do Gradle. O modo `audit` permite explicitamente um AAB sem
assinatura para auditoria: NAO instalar, NAO enviar para publicacao. A verificacao
de 16 KB em modo `--strict` reprova releases com bibliotecas incompativeis.
Sem `--strict`, o verificador preserva o modo diagnostico que apenas informa problemas.
Releases locais verificam tambem a assinatura e o alinhamento ZIP do APK;
o AAB precisa passar no jarsigner sem entradas nao assinadas antes da copia.
O Gradle tambem verifica os ELF antes de empacotar releases assinados, inclusive
fora dos scripts locais. O modo de auditoria e explicitamente sem assinatura.
Os artefatos ficam em `dist/release`, que nao e versionado.
`node scripts/verify-android-artifacts.cjs` confere certificado, manifestos,
bundletool, ELF e os bytes do bundle JavaScript/main.js empacotados; gera
`release-verification.json` e `SHA256SUMS.txt`. Requer o bundletool 1.18.3
oficial em `dist/native-node/toolchains` (checksum validado pelo script).
O certificado publico pode ser indicado por `DEVFLUX_UPLOAD_CERTIFICATE`.
Nesta entrega: 31 bibliotecas verificadas por pacote, nenhuma incompativel no
alinhamento ELF; minSdk 24, targetSdk 36, versionCode 1 e debuggable=false.
Passaram 56 testes automatizados, TypeScript e os testes em navegador de Monaco,
Ace, xterm e controles Play/atalhos. Nao sao testes do APK em Android fisico.

Os builds nao reinstalam dependencias com `--force` e nao desabilitam o lint Android.
Quando Android ja existe, apenas os mods do DevFlux sao aplicados, sem regenerar a
pasta inteira. Num checkout limpo, o Expo gera Android e o plugin copia Kotlin,
PRoot, loaders e configura a ponte nativa. O SDK 57 foi conferido na documentacao
versionada e o Gradle confirmou minSdk 24, compileSdk 36 e targetSdk 36.

## ABI e paginas de 16 KB

O app distribui somente `arm64-v8a`: o rootfs Alpine e os binarios PRoot embarcados
sao ARM64. Anunciar ARM32/x86 sem um runtime correspondente permitia instalar um
app cujo Shell nao poderia funcionar.

`scripts/build_proot_ndk.sh` compila uma copia isolada da arvore PRoot local, sem
limpar ou editar a origem externa. Variaveis opcionais:

- `ANDROID_HOME` / `ANDROID_NDK_HOME`.
- `DEVFLUX_PROOT_SOURCE`: raiz da arvore PRoot, incluindo as modificacoes DevFlux.
- `DEVFLUX_TALLOC_ROOT`: prefixo de talloc com headers e arquivo estatico ARM64.

Os novos PRoot, loader ARM64, loader ARM32 auxiliar e wrapper PTY passaram na
inspecao dos segmentos ELF com alinhamento de 16384 bytes. O PRoot passou a
incorporar talloc estaticamente, sem depender da antiga `libtalloc.so.2` em runtime.
A ponte JNI do Node recebe `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` no NDK 27.
Essas verificacoes NAO comprovam execucao correta em aparelho com paginas de 16 KB.

O pacote original `nodejs-mobile-react-native@18.20.4` inclui `libnode.so` com
segmentos de 4096 bytes. A correcao upstream foi integrada no PR 154, mas nao havia
um release oficial com o binario corrigido nas fontes consultadas.
Foi reconstruida a biblioteca a partir dessa revisao oficial: os quatro segmentos
LOAD passaram na inspecao com alinhamento de 16384 bytes e offsets congruentes.
Nao foi usado um binario de terceiro nem alterado apenas o cabecalho ELF.

A reconstrucao local foi implementada em `scripts/build-node-mobile.cjs`, usando
a revisao oficial `d9552e0e01ed5bdbe12a31d1ce6c0877a4f39580` (Node 18.20.4),
NDK `24.0.8215888`, API 24 e `-Wl,-z,max-page-size=16384`.
O script valida SHA-256 do tarball, ELF ARM64 e alinhamento antes de aplicar.
O plugin reaplica a biblioteca validada depois de uma reinstalacao de dependencias.
O cache `dist/native-node` fica fora do Git, TypeScript, da indexacao do Metro e
dos inputs da tarefa Gradle que gera o JavaScript.
Logs e procedencia ficam em `build.log` e `build.json` nessa pasta.

Para reconstruir, instalar NDK r24 pelo sdkmanager e fornecer um Python 3.6--3.11
com zlib e bz2 em `DEVFLUX_BUILD_PYTHON`, depois executar:

```sh
DEVFLUX_NATIVE_JOBS=4 node scripts/build-node-mobile.cjs
```

Nesta maquina foi compilado Python 3.11.9 em `dist/native-node/toolchains`, sem
substituir o Python do sistema; zlib/bz2 usam as bibliotecas locais do Linux.
Nao alterar a biblioteca somente em node_modules: preservar o cache validado ou
refazer o build. O alinhamento foi conferido novamente no APK/AAB final.

```sh
node scripts/check-android-native.cjs dist/release/DevFlux-UNSIGNED-AUDIT.aab
```

O verificador abre o ZIP do AAB/APK e inspeciona todas as bibliotecas das pastas
ARM64/x86_64. Confere alinhamento e congruencia entre offsets e enderecos; rejeita
arquivos truncados e pacotes sem bibliotecas. Nao certifica politicas, assinatura,
compatibilidade de instrucoes, nem comportamento do runtime.

## Alpine e politica da Play

Revisao do codigo, nao uma aprovacao do Google:

| Fluxo | Codigo | Observacao |
| --- | --- | --- |
| Rootfs | `nodejs-assets/nodejs-project/linux-bootstrap.js` | Extrai o Alpine embarcado e pode baixar o tarball como fallback. |
| Setup/pacotes | `buildPackageInstallCommand` em `main.js` | Usa `apk update/add/fix` e baixa executaveis nativos. |
| Terminal | handler `SHELL_PTY_START` em `main.js` | Pode instalar `util-linux-misc` automaticamente. |
| NPM | handler `LINUX_NPM_COMMAND` em `main.js` | Pode instalar Node/NPM e executar scripts de pacotes. |
| SSH | `buildSshInstallCommand` em `main.js` | Pode instalar openssh/sshpass. |

A politica restringe download de codigo executavel fora do Google Play. A excecao
para interpretadores/VMs com acesso indireto as APIs Android nao deve ser presumida
para binarios nativos executados por PRoot. O Shell livre tambem pode baixar e
executar arquivos; bloquear somente chamadas automaticas de `apk` nao resolve tudo.

Caminhos para decisao antes de publicar:

1. Solicitar orientacao formal sobre este runtime e descrever os fluxos reais, sem
   esconder comportamento na revisao ou ativar recursos remotamente depois dela.
2. Avaliar uma edicao com runtime/pacotes nativos integralmente distribuidos pelo
   Google Play e limites efetivos para downloads nativos, preservando codigo
   interpretado dentro das condicoes da politica.
3. Avaliar execucao Linux remota/SSH, assumindo explicitamente a mudanca de produto.

Nenhuma dessas mudancas de produto foi aplicada automaticamente. Tambem ficam
pendentes a revisao do servico continuo declarado como `dataSync`, o bypass TLS
`rejectUnauthorized: false` do downloader, seguranca/backup das chaves BYOK,
declaracoes de dados, privacidade e licencas/fontes correspondentes dos binarios
PRoot/talloc/Alpine distribuidos. A lista nao equivale a uma auditoria completa.

## Homologacao em aparelho

ADB executado nesta maquina: nenhum dispositivo conectado. Todos os itens abaixo
continuam NAO EXECUTADOS no build de producao:

- Instalacao limpa pelo canal de testes da Play, setup e abertura do primeiro arquivo.
- Atualizacao de uma versao anterior assinada com a MESMA chave de assinatura do app,
  preservando arquivos, projetos, configuracoes de IA e conversas.
- Monaco e Ace: primeira leitura, arquivo vazio legitimo, troca rapida e salvar/reabrir.
- Chat/BYOK: projeto atual, chave/modelo salvos, chamada real autorizada e erros de API.
- Teclado Android: input visivel no Chat, scroll, rotacao, navegacao por gestos e botoes.
- Shell global/projeto/expandido: abrir, digitar, setas, Ctrl+C/D, resize e reinicio.
- Live Sync: leitura local offline, desconexao/reconexao e ausencia de perda de conteudo.
- Android ARM64 com paginas de 4 KB e 16 KB; reinicio, segundo plano e falta de rede.

Nao desinstalar o app do usuario para contornar `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
Um APK antigo assinado com debug nao aceita atualizacao assinada com outra chave.
Verificar backups antes de qualquer migracao. A chave de upload do AAB pode ser
diferente da chave com que o Play App Signing assina os APKs entregues ao aparelho.

## Referencias oficiais

- Expo SDK 57: https://docs.expo.dev/versions/v57.0.0/
- Assinatura: https://developer.android.com/studio/publish/app-signing
- API de destino: https://support.google.com/googleplay/android-developer/answer/11926878
- Paginas de 16 KB: https://developer.android.com/guide/practices/page-sizes
- Execucao/download de codigo e servicos: https://support.google.com/googleplay/android-developer/answer/16559646
- Node mobile: https://github.com/nodejs-mobile/nodejs-mobile/pull/154
- Release pendente: https://github.com/nodejs-mobile/nodejs-mobile/pull/155
