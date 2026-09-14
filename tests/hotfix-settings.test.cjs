const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./component-harness.cjs');

test('Ace defaults persist on first run and saved Monaco preference is preserved', async () => {
  for (const saved of [null, JSON.stringify({fontSize:18}), JSON.stringify({editorEngine:'monaco',fontSize:16})]) {
    let value=saved;
    const h=harness('src/contexts/SettingsContext.tsx',{
      '@react-native-async-storage/async-storage':{getItem:async()=>value,setItem:async(_,next)=>{value=next;}},
    });
    h.mount('SettingsProvider',{children:null});
    await h.flush();
    const context=()=>h.root().props.value;
    assert.equal(context().settings.editorEngine, saved?.includes('monaco')?'monaco':'lightweight');
    assert.equal(JSON.parse(value).editorEngine,context().settings.editorEngine);
    await context().updateSettings({editorEngine:'monaco'});
    assert.equal(JSON.parse(value).editorEngine,'monaco');
  }
});

test('Settings uses one standard parent header across home/editor/settings/back navigation', () => {
  let pathname='/';
  let backs=0;
  const drawer=Object.assign(()=>null,{Screen:'DrawerScreen'});
  const h=harness('src/app/_layout.tsx',{
    'expo-router':{useRouter:()=>({canGoBack:()=>true,back:()=>backs++}),usePathname:()=>pathname,useGlobalSearchParams:()=>({})},
    'expo-router/drawer':{Drawer:drawer},
    '../contexts/CommandPaletteContext':{useCommandPalette:()=>({openPalette(){}})},
    '../contexts/LanguageContext':{useLanguage:()=>({t:(_,fallback)=>fallback})},
  });
  h.native.BackHandler={addEventListener:()=>({remove(){}})};
  h.mount('default',{});
  h.exports.Inner=h.nodes(node=>node.type?.name==='InnerLayout')[0].type;
  for (const route of ['/', '/editor/codigo', '/editor/configuracoes', '/editor/codigo', '/editor/configuracoes']) {
    pathname=route;
    h.mount('Inner',{});
    const parent=h.nodes(node=>node.type===drawer)[0];
    const options=parent.props.screenOptions({navigation:{toggleDrawer(){}}});
    const screens=h.nodes(node=>node.type==='DrawerScreen');
    const editor=screens.find(node=>node.props.name==='editor');
    assert.equal(screens.filter(node=>node.props.name==='editor/configuracoes').length,0);
    assert.equal(editor.props.options.headerShown,undefined);
    assert.equal(options.headerShown,route!=='/editor/codigo');
    if(route==='/editor/configuracoes'){
      assert.equal(editor.props.options.title,'Configurações Gerais');
      options.headerLeft().props.onPress();
    }
  }
  assert.equal(backs,2);
});
