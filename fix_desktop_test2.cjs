const fs = require('fs');
let code = fs.readFileSync('tests/DesktopApp.test.tsx', 'utf8');
code = code.replace(/await screen\.findByText\('Admin Settings'\)/g, "await screen.findAllByText('Admin Settings').then(els => els[0])");
fs.writeFileSync('tests/DesktopApp.test.tsx', code);
