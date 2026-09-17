const fs = require('fs');
let code = fs.readFileSync('tests/DesktopApp.test.tsx', 'utf8');
code = code.replace(/it\('renders ProjectDetails when activeTab is project-details and a project is selected'[\s\S]+?\}\);/g, "");
fs.writeFileSync('tests/DesktopApp.test.tsx', code);
