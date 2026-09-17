const fs = require('fs');
let code = fs.readFileSync('tests/DesktopApp.test.tsx', 'utf8');

// Fix ctx is not defined in the ctrl+k test
code = code.replace(/vi\.mocked\(useAppContext\)\.mockReturnValue\(makeCtx\(\) as ReturnType<typeof useAppContext>\);/, "const ctx = makeCtx();\n    vi.mocked(useAppContext).mockReturnValue(ctx as ReturnType<typeof useAppContext>);");

fs.writeFileSync('tests/DesktopApp.test.tsx', code);
