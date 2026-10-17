import { copyFileSync } from 'node:fs';

// Edit the files in Apps Script first; these two copies support existing links.
copyFileSync('Apps Script/Code.js', 'Code.gs');
copyFileSync('Apps Script/Index.html', 'index.html');
console.log('Cópias de compatibilidade sincronizadas.');
