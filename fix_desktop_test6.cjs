const fs = require('fs');
let code = fs.readFileSync('tests/DesktopApp.test.tsx', 'utf8');
code = code.replace(/document\.dispatchEvent\(event\);/g, "fireEvent(document, event);");
fs.writeFileSync('tests/DesktopApp.test.tsx', code);
