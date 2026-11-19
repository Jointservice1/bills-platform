const config = require('../config');

const app = config.appName;
const faq = [
  ['Is it free to sign up?', `Yes. Creating a ${app} account is free. You only pay for what you buy, and any service fee is shown before you confirm.`, /sign up|register|creat\w* an? account/],
  ['How do I fund my wallet?', 'Tap Fund wallet, enter an amount (from ₦100) and pay with your card, bank transfer or USSD through Paystack. Your balance updates as soon as the payment is confirmed.', /fund\w* .*wallet|add .*money|top up|deposit/],
  ['What happens if a purchase fails?', 'You get your money back in your wallet automatically. If a provider is slow to confirm, we keep checking and either deliver or refund. You never need to pay twice.', /refund|fail\w*|money back/],
  ['How do I get my electricity token?', 'It appears on your receipt right after payment, with a Copy button. It is also saved in your History so you can find it later.', /token/],
  ['Can I pay for someone else?', 'Yes. Enter any phone number, meter number or smartcard number. We show the customer name for meters and decoders so you can double-check.', /someone else|another person|for a friend/],
  ['What is my electricity tariff band?', 'Bands A to E depend on how many hours of supply your area gets. Your band is on your electricity bill or DisCo app. We use it to estimate your units.', /tariff|band/],
  ['Where can I find my payment reference?', 'Open History, select the purchase, and look for the reference on its receipt.', /reference|receipt/],
  ['How do I check my purchase status?', 'Open History and select the purchase to view its current status and receipt.', /status|track|pending|history/],
];

module.exports = faq;
