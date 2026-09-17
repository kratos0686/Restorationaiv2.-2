const fs = require('fs');
let code = fs.readFileSync('tests/EventBus.test.ts', 'utf8');
code = code.replace(/beforeEach\(\(\) => \{/g, "beforeEach(() => { vi.useFakeTimers();");
code = code.replace(/EventBus\.publish\((.*?)\);/g, "EventBus.publish($1); vi.runAllTimers();");
fs.writeFileSync('tests/EventBus.test.ts', code);
