const fs = require('fs');
let code = fs.readFileSync('tests/Billing.test.tsx', 'utf8');

code = code.replace(/selectedProjectId: 'p-1',\n    \} as ReturnType<typeof useAppContext>\);/g, "selectedProjectId: 'p-1',\n      hasPermission: () => true,\n    } as ReturnType<typeof useAppContext>);");

fs.writeFileSync('tests/Billing.test.tsx', code);
