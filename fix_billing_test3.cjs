const fs = require('fs');
let code = fs.readFileSync('tests/Billing.test.tsx', 'utf8');

// There must be a beforeEach or it() where useAppContext is mocked using vi.mocked(useAppContext).mockReturnValue(...)
code = code.replace(/selectedProjectId: '1',/g, "selectedProjectId: '1',\n      hasPermission: () => true,");
code = code.replace(/selectedProjectId: null,/g, "selectedProjectId: null,\n      hasPermission: () => true,");

fs.writeFileSync('tests/Billing.test.tsx', code);
