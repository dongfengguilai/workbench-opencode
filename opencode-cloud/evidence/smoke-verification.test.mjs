import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from './csv.mjs';
test('quoted comma and escaped quote', () => {
  assert.deepEqual(parseCSV('name,note\nAlice,"hello, world"\nBob,"say ""yes"""'),
    [['name','note'],['Alice','hello, world'],['Bob','say "yes"']]);
});
test('CRLF, multiline quotes, trailing newline and empty fields', () => {
  assert.deepEqual(parseCSV('a,b,c\r\n"first\r\nsecond",,3\r\n'),
    [['a','b','c'],['first\r\nsecond','','3']]);
});
test('empty input and trailing empty field', () => {
  assert.deepEqual(parseCSV(''), []);
  assert.deepEqual(parseCSV('a,'), [['a','']]);
});
test('invalid quote syntax is rejected', () => {
  assert.throws(() => parseCSV('"unfinished'), SyntaxError);
  assert.throws(() => parseCSV('ab"cd,ef'), SyntaxError);
  assert.throws(() => parseCSV('"ok"x,y'), SyntaxError);
});
