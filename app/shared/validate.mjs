import Ajv2020Module from 'ajv/dist/2020.js';

// ajv ships CommonJS; under Node ESM the class sits on .default, under Vite it is the export itself.
const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;

/** @typedef {((data: unknown) => boolean) & { errors?: object[] | null }} CompiledCheck */

// A compiled Ajv check (from ajv.compile, or the build-time code in validators-plugin.mjs) as a
// function that returns readable messages. They read like demolib.py's so the app and the scripts
// say the same thing.
export function fromCheck(check) {
  return (data) => (check(data) ? [] : summarize(check.errors ?? []));
}

// Node only: compiles at runtime. The browser uses fromCheck on the precompiled validators, since
// its Content-Security-Policy does not allow eval.
export function makeValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return fromCheck(ajv.compile(schema));
}

function where(error) {
  const path = error.instancePath
    .split('/')
    .slice(1)
    .map((part) => (/^\d+$/.test(part) ? `[${part}]` : `.${part}`))
    .join('')
    .replace(/^\./, '');
  return path || '(top level)';
}

function message(error) {
  const p = error.params ?? {};
  switch (error.keyword) {
    case 'required': return `missing required field '${p.missingProperty}'`;
    case 'additionalProperties': return `unknown field '${p.additionalProperty}'`;
    case 'pattern': return `does not match ${p.pattern}`;
    case 'enum': return `must be one of ${(p.allowedValues ?? []).join(', ')}`;
    default: return error.message ?? error.keyword;
  }
}

// A shot that matches no oneOf branch reports every branch's errors. Show the branch that came
// closest (fewest errors at that spot) instead of all three.
function summarize(errors) {
  const oneOfPaths = new Set(errors.filter((e) => e.keyword === 'oneOf').map((e) => e.instancePath));
  const kept = [];
  const branches = new Map();
  for (const error of errors) {
    if (error.keyword === 'oneOf') continue;
    const owner = [...oneOfPaths].find((p) => error.instancePath === p || error.instancePath.startsWith(`${p}/`));
    if (!owner) {
      kept.push(error);
      continue;
    }
    // Branches are $refs, so ajv reports their errors under #/$defs/<branch>/...
    const branch = error.schemaPath.match(/#\/\$defs\/([^/]+)/)?.[1] ?? error.schemaPath;
    const byBranch = branches.get(owner) ?? new Map();
    byBranch.set(branch, [...(byBranch.get(branch) ?? []), error]);
    branches.set(owner, byBranch);
  }
  for (const byBranch of branches.values()) {
    const closest = [...byBranch.values()].sort((a, b) => a.length - b.length)[0];
    kept.push(...closest);
  }
  return [...new Set(kept.map((e) => `${where(e)}: ${message(e)}`))];
}
