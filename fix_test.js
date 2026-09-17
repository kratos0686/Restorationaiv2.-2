const fs = require('fs');
let code = fs.readFileSync('tests/MobileApp.test.tsx', 'utf8');
code = code.replace(/nav.querySelectorAll\('button'\)/g, "screen.getAllByRole('button')");
fs.writeFileSync('tests/MobileApp.test.tsx', code);
