// VTpass adapter. Docs: https://www.vtpass.com/documentation
// All amounts going in/out of this module are kobo; VTpass itself uses naira.

const toKobo = (naira) => Math.round(Number(naira || 0) * 100);
const toNaira = (kobo) => +(kobo / 100).toFixed(2);

// Response codes that guarantee nothing was delivered or charged: safe to refund.
const DEFINITE_FAIL = new Set(['011', '012', '013', '015', '016', '017', '018', '021', '022', '023', '024',
  '030', '034', '035', '040', '085', '087', '091']);

function parseTx(json) {
  const code = String(json.code ?? '');
  const t = json.content?.transactions || {};
  let status = 'pending'; // anything unexpected is treated as unknown, never as failed
  if (code === '000') {
    if (t.status === 'delivered') status = 'delivered';
    else if (t.status === 'failed' || t.status === 'reversed') status = 'failed';
  } else if (DEFINITE_FAIL.has(code)) {
    status = 'failed';
  }

  let token = json.mainToken || json.token || json.purchased_code || null;
  if (Array.isArray(json.cards) && json.cards.length) {
    token = json.cards.map((c) => [c.Serial && `Serial: ${c.Serial}`, c.Pin && `PIN: ${c.Pin}`].filter(Boolean).join('  ')).join('\n');
  } else if (Array.isArray(json.tokens) && json.tokens.length) {
    token = json.tokens.join('\n');
  }
  if (typeof token === 'string') token = token.replace(/^\s*(Token|Meter Token)\s*:\s*/i, '').trim();

  return {
    status,
    token: token || null,
    units: json.mainTokenUnits || json.units || null,
    providerRef: t.transactionId ? String(t.transactionId) : null,
    message: json.response_description || t.status || code,
    raw: json,
  };
}

function createVtpass({ baseUrl, apiKey, publicKey, secretKey }) {
  if (!apiKey || !secretKey || !publicKey) throw new Error('VTPASS_API_KEY, VTPASS_PUBLIC_KEY and VTPASS_SECRET_KEY are required');

  async function request(method, path, body) {
    const headers = method === 'GET'
      ? { 'api-key': apiKey, 'public-key': publicKey }
      : { 'api-key': apiKey, 'secret-key': secretKey, 'Content-Type': 'application/json' };
    const res = await fetch(baseUrl + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`VTpass ${path} returned HTTP ${res.status}: ${text.slice(0, 120)}`);
    }
  }

  return {
    name: 'vtpass',

    async listVariations(serviceId) {
      const json = await request('GET', `/service-variations?serviceID=${encodeURIComponent(serviceId)}`);
      const list = json.content?.variations || json.content?.varations || [];
      return list.map((v) => ({
        code: v.variation_code, name: v.name, amount: toKobo(v.variation_amount),
        fixed: String(v.fixedPrice).toLowerCase() === 'yes',
      }));
    },

    async verify({ serviceId, billersCode, type }) {
      const json = await request('POST', '/merchant-verify', { serviceID: serviceId, billersCode, type });
      const c = json.content || {};
      if (json.code !== '000' || c.error || c.WrongBillersCode) {
        return { ok: false, error: c.error || json.response_description || 'Could not verify this number' };
      }
      return {
        ok: true,
        name: c.Customer_Name || c.customer_name || '',
        address: c.Address || c.address || '',
        currentPackage: c.Current_Bouquet || c.Current_Plan || '',
        renewalAmount: c.Renewal_Amount ? toKobo(c.Renewal_Amount) : null,
        dueDate: c.Due_Date || '',
      };
    },

    async pay(o) {
      const body = {
        request_id: o.requestId, serviceID: o.serviceId, billersCode: o.billersCode,
        variation_code: o.variationCode, amount: toNaira(o.amount), phone: o.phone,
      };
      if (o.subscriptionType) body.subscription_type = o.subscriptionType;
      if (o.quantity && o.quantity > 1) body.quantity = o.quantity;
      return parseTx(await request('POST', '/pay', body));
    },

    async requery(requestId) {
      return parseTx(await request('POST', '/requery', { request_id: requestId }));
    },

    async balance() {
      const json = await request('GET', '/balance');
      const b = json.contents?.balance ?? json.content?.balance;
      return b == null ? null : toKobo(b);
    },
  };
}

module.exports = { createVtpass, parseTx };
