# A review of a private app, 2026-10-18

This check closes ticket 21. It ran `archmap review` on a real branch of a private app, to prove spec 15 on real code.

- **The command:** `archmap review --tsconfig <the backend config> --scope '<the backend sources>' --scope '!**/*.spec.ts' --no-open --out <file>`.
- **The run time:** 1.8 s, from the start of the command to the written page. The acceptance limit is one minute.
- **The resolution rate:** 354 of 366 calls, 96.7%. The call measurement of the same day found 96.7% for the backend.
- **The rate with the test files in:** 360 of 464 calls, 77.6%. That run left out the `!**/*.spec.ts` glob. A test that mocks its calls adds open ends.
