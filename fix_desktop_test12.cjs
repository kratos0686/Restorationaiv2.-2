const fs = require('fs');
let code = fs.readFileSync('tests/DesktopApp.test.tsx', 'utf8');

// The LaunchScreen logic is in App.tsx not DesktopApp.tsx. DesktopApp assumes it's authenticated. Let's remove the LaunchScreen test.
code = code.replace(/it\('renders LaunchScreen when not authenticated'[\s\S]+?\}\);\n/g, "");
fs.writeFileSync('tests/DesktopApp.test.tsx', code);
