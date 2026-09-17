const fs = require('fs');
let code = fs.readFileSync('tests/Billing.test.tsx', 'utf8');

// The test is missing hasPermission in the mock context
code = code.replace(/useAppContext: \(\) => \(\{\n/g, "useAppContext: () => ({\n    hasPermission: () => true,\n");

// It looks like there's a manual mock for useAppContext in tests/Billing.test.tsx
fs.writeFileSync('tests/Billing.test.tsx', code);
