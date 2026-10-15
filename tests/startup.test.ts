import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { backendDirectory } from '../scripts/backend.js';

test('missing backend exits with recovery commands before launching any services', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gramalyzer-startup-'));
  const missing = join(temp, "Halty's projects", 'GramalyzerBot');
  try {
    for (const entry of ['scripts/dev.ts', 'scripts/backend.ts']) {
      const result = spawnSync(process.execPath, ['--import', 'tsx', entry], {
        env: {...process.env, GRAMALYZER_BOT_DIR: missing}, encoding: 'utf8', timeout: 10000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(join(missing, 'pom.xml')));
      assert.ok(result.stderr.includes('git clone https://github.com/Halty323/GramalyzerBot.git'));
      assert.ok(result.stderr.includes("Halty'\\''s projects"), 'suggested clone path must be shell-quoted');
      assert.ok(result.stderr.includes('GRAMALYZER_BOT_DIR='));
      assert.ok(!result.stderr.includes('at runBackend'), 'expected setup errors should not print a stack trace');
      assert.ok(!result.stdout.includes('VITE') && !result.stdout.includes('[INFO] Scanning'), 'no services should start');
    }
  } finally {rmSync(temp, {recursive: true, force: true});}
});

test('existing archive-only checkout gets update instructions instead of a conflicting clone', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gramalyzer-checkout-'));
  try {
    mkdirSync(join(temp, '.git'));
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/dev.ts'], {
      env: {...process.env, GRAMALYZER_BOT_DIR: temp}, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('pull --ff-only origin main'));
    assert.ok(!result.stderr.includes('git clone'));
  } finally {rmSync(temp, {recursive: true, force: true});}
});

test('an explicit relative backend directory resolves to the complete Maven project', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gramalyzer-location-'));
  const previous = process.env.GRAMALYZER_BOT_DIR;
  try {
    writeFileSync(join(temp, 'pom.xml'), '<project/>');
    process.env.GRAMALYZER_BOT_DIR = relative(process.cwd(), temp);
    assert.equal(backendDirectory(), temp);
  } finally {
    if (previous === undefined) delete process.env.GRAMALYZER_BOT_DIR;
    else process.env.GRAMALYZER_BOT_DIR = previous;
    rmSync(temp, {recursive: true, force: true});
  }
});
