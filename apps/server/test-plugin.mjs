// Test plugin loading - use CJS require
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

try {
  const path = require.resolve('@larksuite/openclaw-lark');
  console.log('✅ 找到插件:', path);

  // Use require instead of import
  const mod = require('@larksuite/openclaw-lark');
  console.log('✅ 加载成功');
  console.log('default:', typeof mod.default);
  console.log('keys:', Object.keys(mod));

  const plugin = mod.default || mod;
  if (plugin) {
    console.log('\n插件信息:');
    console.log('  id:', plugin.id);
    console.log('  name:', plugin.name);
    console.log('  version:', plugin.version);
  }
} catch (e) {
  console.log('❌ 错误:', e.message);
  console.log(e.stack);
}
