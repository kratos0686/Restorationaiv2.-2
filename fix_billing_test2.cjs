const fs = require('fs');
let code = fs.readFileSync('tests/Billing.test.tsx', 'utf8');

// I might have put hasPermission in the wrong place, let's fix it by regex matching the whole mock object.
code = code.replace(/useAppContext: \(\) => \(\{\n/g, "useAppContext: () => ({\n    hasPermission: () => true,\n");

fs.writeFileSync('tests/Billing.test.tsx', code);
