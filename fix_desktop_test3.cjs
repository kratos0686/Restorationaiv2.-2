const fs = require('fs');
let code = fs.readFileSync('tests/DesktopApp.test.tsx', 'utf8');
code = code.replace(/await screen\.findAllByText\('Admin Settings'\)\.then\(els => els\[0\]\)/g, "screen.getAllByText('Admin Settings')[0]");
fs.writeFileSync('tests/DesktopApp.test.tsx', code);
