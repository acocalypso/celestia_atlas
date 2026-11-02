// Test a host against this checkout without changing its dependency pin.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
registerHooks({
  resolve(specifier, context, nextResolve) {
    const name = '@acocalypso/celestia-atlas';
    if (specifier === name || specifier.startsWith(`${name}/`)) {
      const key = specifier === name ? '.' : `.${specifier.slice(name.length)}`;
      const target = pkg.exports[key];
      if (typeof target === 'string') return { url: new URL(target, root).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
