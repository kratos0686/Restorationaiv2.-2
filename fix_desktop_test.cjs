const fs = require('fs');
let code = fs.readFileSync('tests/DesktopApp.test.tsx', 'utf8');
code = code.replace(/await screen\.findByText\('Dashboard'\)/g, "await screen.findAllByText('Dashboard').then(els => els[0])");
fs.writeFileSync('tests/DesktopApp.test.tsx', code);
