import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runtimeHome, desktopPath, findExecutable } from '../src/platform-runtime.js';
import { classifyOperation, decideOperation } from '../src/interaction-policy.js';

test('Mac runtime stays outside application directory; Windows retains D drive', () => {
  assert.equal(runtimeHome('darwin', '/Users/test user'), '/Users/test user/Library/Application Support/PersonalAgent');
  assert.equal(runtimeHome('win32', 'C:/Users/test'), 'D:/PersonalAgent-data');
});

test('Finder PATH keeps existing entries and adds common native tool locations', () => {
  const entries = desktopPath('/usr/bin:/opt/homebrew/bin', 'darwin', '/Users/test').split(':');
  assert.equal(entries[0], '/usr/bin');
  for (const value of ['/Users/test/.local/bin', '/Users/test/.opencode/bin', '/opt/homebrew/bin', '/usr/local/bin']) assert.ok(entries.includes(value));
  assert.equal(entries.filter(value => value === '/opt/homebrew/bin').length, 1);
  assert.equal(desktopPath('C:/tools;D:/tools', 'win32'), 'C:/tools;D:/tools');
});

test('tool discovery rejects directories and continues to next installation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-mac-tools-'));
  try {
    const first = path.join(root, 'first'), second = path.join(root, 'second');
    fs.mkdirSync(path.join(first, 'node.exe'), { recursive: true }); fs.mkdirSync(second);
    const executable = path.join(second, 'node.exe'); fs.writeFileSync(executable, 'fixture');
    assert.equal(findExecutable('node', first + ';' + second, 'win32'), executable);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Mac interaction commands defer in work and destructive commands remain denied in idle', () => {
  for (const command of ['osascript -e display', 'pbcopy', 'pbpaste', 'screencapture /tmp/test.png', 'open /Applications']) {
    assert.equal(classifyOperation({ command }), 'DESKTOP_INTERACTIVE');
    assert.equal(decideOperation({ command }, { version: 1, mode: 'work', reason: '' }).action, 'defer');
  }
  for (const command of ['diskutil eraseDisk', 'pmset sleepnow', 'osascript -e tell application "System Events" to shut down']) assert.equal(decideOperation({ command }, { version: 1, mode: 'idle', reason: '' }).action, 'deny');
});
