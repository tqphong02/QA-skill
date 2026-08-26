# Windows and PowerShell

Use Node.js 20 or newer and run from the installed `hybrid-source-coverage` directory:

```powershell
npm install
npm run build
npm run test:coverage
```

Analyze one function without shell continuation:

```powershell
npm run cli -- analyze --repo "C:\work\app" --file "src\payment\payment.service.ts" --class "PaymentService" --function "processPayment" --format json --output "C:\work\app\reports\process-payment"
```

Generate and run a Vitest test:

```powershell
npm run cli -- generate-test --analysis "C:\work\app\reports\process-payment.json" --mapping "C:\work\app\reports\process-payment.unit-test-mapping.json" --output "C:\work\app\tests\process-payment.whitebox.test.ts"
npm run cli -- run-coverage --runner vitest --cwd "C:\work\app" --analysis "C:\work\app\reports\process-payment.json" --test "tests\process-payment.whitebox.test.ts" --output "C:\work\app\reports\process-payment.runtime.json"
```

The CLI normalizes Windows separators when matching Istanbul paths. The runner resolves `node_modules\.bin\vitest` or `jest` inside the target repository and does not require WSL.
