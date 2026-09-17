const fs = require('fs');
let code = fs.readFileSync('tests/DesktopApp.test.tsx', 'utf8');
code = code.replace(/screen\.getAllByText\('Admin Settings'\)\[0\]/g, "(await screen.findAllByText('Admin Settings'))[0]");
fs.writeFileSync('tests/DesktopApp.test.tsx', code);
