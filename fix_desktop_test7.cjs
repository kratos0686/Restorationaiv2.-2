const fs = require('fs');
let code = fs.readFileSync('tests/DesktopApp.test.tsx', 'utf8');
code = code.replace(/isSearchOpen: false,/g, "");
code = code.replace(/const makeCtx = \(overrides = \{\}\) => \(\{/g, "const makeCtx = (overrides = {}) => ({\n  isSearchOpen: false,\n  setIsSearchOpen: vi.fn(),");
code = code.replace(/document\.dispatchEvent/g, "fireEvent(document,");
fs.writeFileSync('tests/DesktopApp.test.tsx', code);
