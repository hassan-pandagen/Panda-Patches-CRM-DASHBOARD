# E2E Testing Guide

**Status:** Documentation only (not runnable in this project)

## What is E2E Testing?

**E2E = End-to-End Testing**

Tests the entire application workflow from the **user's perspective**, not just individual functions.

### Example E2E Test Flow

```
1. User visits website
2. User logs in with email/password
3. User creates new order
4. User submits order
5. User sees order in list
6. System sends confirmation email
7. Test verifies entire flow worked
```

### Unit Test vs E2E Test

| Aspect | Unit Test | E2E Test |
|--------|-----------|----------|
| **Scope** | Tests 1 function | Tests entire workflow |
| **Speed** | Fast (ms) | Slower (seconds) |
| **Isolation** | Isolated/mocked | Full integration |
| **Dependencies** | Mock all external | Real browser/server |
| **Reliability** | Less realistic | Most realistic |
| **Example** | Test `isValidEmail()` | Test login → order creation |

---

## E2E Testing Tools

### Popular Options

1. **Playwright** ⭐ Recommended
   - Fast, reliable, cross-browser
   - Modern syntax
   - Best for modern apps

2. **Cypress**
   - Developer-friendly
   - Great debugging
   - Slower than Playwright

3. **Puppeteer**
   - Chrome/Chromium only
   - Lower level control
   - Good for performance testing

### Comparison

```javascript
// Playwright
await page.goto('http://localhost:5173/login');
await page.fill('input[type="email"]', 'test@example.com');

// Cypress
cy.visit('http://localhost:5173/login');
cy.get('input[type="email"]').type('test@example.com');

// Puppeteer
const page = await browser.newPage();
await page.goto('http://localhost:5173/login');
await page.$eval('input[type="email"]', el => el.value = 'test@example.com');
```

---

## Example E2E Tests

### Example 1: User Login Workflow

```javascript
import { test, expect } from '@playwright/test';

test('User can login successfully', async ({ page }) => {
  // 1. Navigate to login page
  await page.goto('http://localhost:5173/login');
  
  // 2. Verify login form is visible
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  
  // 3. Enter credentials
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123');
  
  // 4. Click login button
  await page.click('button:has-text("Sign In")');
  
  // 5. Verify redirected to dashboard
  await page.waitForURL('**/dashboard');
  await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
});
```

### Example 2: Create Order Workflow

```javascript
test('User can create new order', async ({ page }) => {
  // 1. Login first
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123');
  await page.click('button:has-text("Sign In")');
  
  // 2. Navigate to New Order
  await page.click('a:has-text("New Order")');
  await page.waitForURL('**/new-order');
  
  // 3. Fill out form
  await page.fill('input[placeholder="Customer Name"]', 'John Doe');
  await page.fill('input[placeholder="Email"]', 'john@example.com');
  await page.fill('input[placeholder="Phone"]', '555-1234');
  await page.fill('input[placeholder="Design Name"]', 'Logo Design');
  await page.selectOption('select[name="patchType"]', 'embroidered');
  await page.fill('input[placeholder="Quantity"]', '100');
  
  // 4. Upload file
  await page.locator('input[type="file"]').setInputFiles('src/tests/fixtures/design.pdf');
  
  // 5. Submit
  await page.click('button:has-text("Submit Order")');
  
  // 6. Verify success message
  await expect(page.locator('text=Order created successfully')).toBeVisible();
  
  // 7. Verify order in list
  await page.click('a:has-text("Orders")');
  await page.waitForURL('**/orders');
  await expect(page.locator('text=ORD-001')).toBeVisible();
});
```

### Example 3: Order Status Update

```javascript
test('Admin can update order status', async ({ page }) => {
  // 1. Login as admin
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'admin@example.com');
  await page.fill('input[type="password"]', 'AdminPass123');
  await page.click('button:has-text("Sign In")');
  
  // 2. Open order
  await page.click('a:has-text("Orders")');
  await page.click('a:has-text("ORD-001")');
  
  // 3. Change status
  await page.selectOption('select[name="status"]', 'QUOTED');
  
  // 4. Save
  await page.click('button:has-text("Save Changes")');
  
  // 5. Verify status changed
  await expect(page.locator('text=Status: QUOTED')).toBeVisible();
});
```

### Example 4: Offline Support

```javascript
test('App works offline', async ({ page, context }) => {
  // 1. Login
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123');
  await page.click('button:has-text("Sign In")');
  
  // 2. Go offline
  await context.setOffline(true);
  
  // 3. Navigate to orders (should show cached)
  await page.click('a:has-text("Orders")');
  
  // 4. Verify offline indicator
  await expect(page.locator('text=Working Offline')).toBeVisible();
  
  // 5. Go back online
  await context.setOffline(false);
  
  // 6. Data should sync
  await page.reload();
  await expect(page.locator('text=Working Offline')).not.toBeVisible();
});
```

### Example 5: Mobile Responsiveness

```javascript
test('App is responsive on mobile', async ({ page }) => {
  // Set mobile viewport
  await page.setViewportSize({ width: 375, height: 667 });
  
  // Login
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123');
  await page.click('button:has-text("Sign In")');
  
  // Verify mobile menu
  await expect(page.locator('button[aria-label="Menu"]')).toBeVisible();
  
  // Open menu
  await page.click('button[aria-label="Menu"]');
  
  // Verify menu items are accessible
  await expect(page.locator('a:has-text("Orders")')).toBeVisible();
});
```

---

## Setup Instructions (For Future)

### Install Playwright

```bash
npm install --save-dev @playwright/test
```

### Create playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Add Script to package.json

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

### Run E2E Tests

```bash
npm run test:e2e
```

---

## When to Add E2E Tests

### Stage 1: NOW (Production Ready)
✅ 70 unit/component tests  
✅ Core logic covered  
✅ Sentry error tracking  
→ **SHIP THIS**

### Stage 2: Post-Launch (Week 1-2)
Add 5-10 E2E tests for critical flows:
- Login workflow
- Create order workflow
- Update status workflow

### Stage 3: Month 2-3
Expand E2E tests:
- Edge cases
- Error scenarios
- Multi-user scenarios

---

## E2E vs Other Testing Levels

```
┌─────────────────────────────────────────────────────┐
│  TESTING PYRAMID                                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│           🏔️ E2E Tests (5-10)                        │
│           Slow, expensive, realistic                 │
│                                                      │
│        📊 Integration Tests (10-20)                  │
│        Medium speed, verify modules work together   │
│                                                      │
│    ✅ Unit Tests (70)                               │
│    Fast, cheap, isolated, many needed               │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Current Testing Status

| Level | Count | Status | Next Step |
|-------|-------|--------|-----------|
| **Unit Tests** | 37 | ✅ Done | Complete |
| **Component Tests** | 33 | ✅ Done | Complete |
| **E2E Tests** | 0 | ⏳ Planned | Post-launch |
| **TOTAL** | **70** | ✅ Ready | Ship now |

---

## Recommendation

**Ship now with 70 tests. Add E2E tests post-launch when you have real users finding edge cases.**

Why?
- Unit tests catch logic bugs
- Component tests verify UI rendering
- Sentry catches production errors
- Real users reveal edge cases
- E2E tests then validate fixes

This is the fastest path to production with good coverage.

---

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Cypress Documentation](https://docs.cypress.io)
- [Testing Best Practices](https://testingjavascript.com)

