# PayBills: airtime, data, electricity, TV and exam PINs

Customers fund a wallet with Paystack, then buy from any provider below. Delivery comes from a bill-payment aggregator (VTpass by default). The platform earns the aggregator's commission plus any convenience fee you set.

## What can be sold

| Category | Providers |
|---|---|
| Airtime | MTN, Airtel, Glo, 9mobile |
| Data | MTN, Airtel, Glo, Glo SME, 9mobile |
| Electricity (prepaid token / postpaid) | Ikeja, Eko, Abuja, Ibadan, Enugu, Port Harcourt, Kano, Kaduna, Jos, Benin, Yola, Aba Power |
| TV | DStv, GOtv, StarTimes (renew or change package), Showmax |
| Internet | Smile, Spectranet |
| Exam PINs | WAEC Result Checker, WAEC Registration, JAMB |

The list lives in [src/catalog.js](src/catalog.js). Plans and prices are fetched live from the provider.

## Quick start (demo mode, no keys needed)

```
npm install
copy .env.example .env
npm start
```

Open http://localhost:3000, sign up, and on the Wallet page click **Add demo money**. Demo mode simulates every purchase, and a yellow banner says so. Test numbers:

- ending in `0000`: verification fails
- ending in `9999`: purchase fails and the wallet is refunded
- ending in `8888`: purchase stays "Processing", then succeeds on requery

`npm test` runs the money-path tests.

## Going live

1. Create a VTpass account and fund it. Copy the API, public and secret keys into `.env`, and set `PROVIDER=vtpass`. Test against `https://sandbox.vtpass.com/api` first, then switch `VTPASS_BASE_URL` to `https://vtpass.com/api`.
2. Put your Paystack secret key in `PAYSTACK_SECRET_KEY`, and set the Paystack webhook to `https://YOUR-DOMAIN/webhooks/paystack`.
3. Set `NODE_ENV=production` and serve over HTTPS. Demo mode refuses to start in production.
4. Keep your VTpass balance above total customer wallet balances. The admin page warns when it isn't.

## How money is protected

- Prices for plans, TV renewals and PINs come from the provider, never from the browser.
- Meter numbers and smartcards are verified, and the customer's name is shown before payment.
- The wallet is debited and the order is marked processing in one database transaction, so double-clicks can't pay twice.
- A **failed** purchase is refunded automatically. An **unknown** result (timeout, "processing") is never refunded blindly: a background job requeries every minute, and admins can requery by hand.
- Paystack funding is verified server-side, webhooks are signature-checked, and every top-up is credited exactly once.
- Every balance change is written to `wallet_ledger`, so balances always reconcile.

## Adding another provider

Write an adapter in `src/providers/` with the interface documented in [src/providers/index.js](src/providers/index.js) (`listVariations`, `verify`, `pay`, `requery`, `balance`), register it there, and set `PROVIDER`.

## Not built yet

Transaction PIN, password reset, SMS/email receipts, login rate limiting, a referral/reseller tier, and failover between providers.
