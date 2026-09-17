const fs = require('fs');
let code = fs.readFileSync('tests/DesktopApp.test.tsx', 'utf8');

// The test expects clicking or ctrl+K to open CommandCenter.
// Actually DesktopApp receives isSearchOpen from AppContext. 
// So firing the event in the test won't update the context mock unless we do it manually or test the setIsSearchOpen call.
code = code.replace(/expect\(screen\.getByTestId\('CommandCenter'\)\)\.toBeInTheDocument\(\);/, "expect(ctx.setIsSearchOpen).toHaveBeenCalledWith(true);");
fs.writeFileSync('tests/DesktopApp.test.tsx', code);
