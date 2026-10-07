# Browser test (e2e)

See "Browser test (e2e)" in the main `../../README.md` for the steps. Short version: start the backend with
`RAZORPAY_FAKE=1`, build and serve the client, then run `npm run e2e` inside `client/`.

For the admin area run `npm run e2e:admin` (`e2e/admin.mjs`). The backend must then run with `RAZORPAY_FAKE=1 CLOUDINARY_FAKE=1`.
