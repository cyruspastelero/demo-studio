// Vite plugin: the browser's demo.json and handoff.json validators, compiled ahead of time with
// Ajv's standalone code generator. Ajv's runtime compiler builds functions from strings
// (new Function), which the editor's Content-Security-Policy (script-src 'self', no unsafe-eval)
// blocks, so the page imports plain generated code instead: `virtual:demo-studio-validators`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020Module from 'ajv/dist/2020.js';
import standaloneModule from 'ajv/dist/standalone/index.js';

const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
const standaloneCode = standaloneModule.default ?? standaloneModule;
const ID = 'virtual:demo-studio-validators';
const RESOLVED = `\0${ID}`;
const SCHEMAS = ['demo', 'handoff'];
const schemaFile = (name) => fileURLToPath(new URL(`../../schemas/${name}.schema.json`, import.meta.url));

export function validatorsSource() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, code: { source: true, esm: true } });
  for (const name of SCHEMAS) ajv.addSchema({ ...JSON.parse(readFileSync(schemaFile(name), 'utf8')), $id: name });
  const code = standaloneCode(ajv, Object.fromEntries(SCHEMAS.map((name) => [name, name])));
  // Standalone code still require()s Ajv's runtime helpers, which a browser module cannot do. The
  // only one these schemas need is ucs2length (minLength/maxLength in code points), inlined here.
  const inlined = code.replaceAll('require("ajv/dist/runtime/ucs2length").default', '__ucs2length');
  if (/\brequire\(/.test(inlined)) throw new Error('validators-plugin: generated code needs another Ajv runtime helper; inline it');
  return inlined.replace('"use strict";', '"use strict";const __ucs2length = (text) => [...text].length;');
}

export function validatorsPlugin() {
  return {
    name: 'demo-studio-validators',
    resolveId: (id) => (id === ID ? RESOLVED : null),
    load(id) {
      if (id !== RESOLVED) return null;
      for (const name of SCHEMAS) this.addWatchFile?.(schemaFile(name));
      return validatorsSource();
    },
  };
}
