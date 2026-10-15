import test from 'node:test';
import assert from 'node:assert/strict';
import {localFilePath,markdownFilePaths} from './fileReferences.js';
test('local file links normalize locations and exclude non-file schemes',()=>{
 assert.equal(localFilePath('file:///D:/Demo/report.md#L12'),'D:/Demo/report.md');
 assert.equal(localFilePath('src/code.ts:8:2'),'src/code.ts');
 assert.equal(localFilePath('D:/Demo/a%20b.md'),'D:/Demo/a b.md');
 for(const value of ['https://example.com/a.md','javascript:alert(1)','data:text/plain,hi','//server/secret.md','not a file'])assert.equal(localFilePath(value),undefined);
 assert.deepEqual(markdownFilePaths('[报告](<D:/Demo/a b.md>) `src/code.ts` [web](https://example.com/a.md)'),['D:/Demo/a b.md','src/code.ts']);
});


test('POSIX file URLs preserve their absolute root and reject remote hosts',()=>{assert.equal(localFilePath('file:///Users/test/My%20File.ts#L12'),'/Users/test/My File.ts');assert.equal(localFilePath('file://localhost/tmp/test.ts'),'/tmp/test.ts');assert.equal(localFilePath('file://server/share/test.ts'),undefined);});
