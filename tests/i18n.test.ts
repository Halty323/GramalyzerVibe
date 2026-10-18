import { test } from 'node:test';
import assert from 'node:assert/strict';
import en, { type Plural } from '../src/locales/en.js';
import { LANGS, loadLang } from '../src/i18n.js';

const placeholders = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]));
const samples = [...Array(1001).keys(), 0.5, 1.5, 2.5, 3.5, 10.5, 21.5];

for (const {code, locale} of LANGS) {
  test(`${code}: same keys, placeholders and plural forms as English`, async () => {
    const messages = await loadLang(code);
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort());
    const needed = new Set(samples.map(n => new Intl.PluralRules(locale).select(n)));
    for (const [key, source] of Object.entries(en)) {
      const value = messages[key as keyof typeof en];
      if (typeof source === 'string') {
        assert.equal(typeof value, 'string', key);
        assert.deepEqual(placeholders(value as string), placeholders(source), `${code} ${key}`);
        continue;
      }
      const forms = value as Plural;
      for (const category of needed) assert.ok(forms[category], `${code} ${key} needs a "${category}" form`);
      const allowed = placeholders(source.other);
      for (const [category, form] of Object.entries(forms)) {
        const used = placeholders(form!);
        for (const name of used) assert.ok(allowed.has(name), `${code} ${key}.${category} uses unknown {${name}}`);
        // a form may spell the count out ("قناة واحدة"), but only where the count is always the same number
        if (!used.has('n')) assert.ok(['zero', 'one', 'two'].includes(category), `${code} ${key}.${category} drops {n}`);
        for (const name of allowed) if (name !== 'n') assert.ok(used.has(name), `${code} ${key}.${category} drops {${name}}`);
      }
    }
  });
}
