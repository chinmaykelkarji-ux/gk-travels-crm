// ============================================================
// GK sample data for a local copy — through the app's own API, so every
// rule, number and audit row is the real one. Run it while the app is up:
//
//   node scripts/demo-data.mjs            (http://localhost:3001 by default)
//
// Refuses anything but localhost. Running it twice adds nothing twice.
// ============================================================

const API = process.env.TRAVELOS_API ?? 'http://localhost:3001/api';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(API)) { console.error('Sample data is for a local copy only.'); process.exit(1); }
const OWNER = { email: process.env.DEMO_OWNER_EMAIL ?? 'owner@gktravels.local', password: process.env.DEMO_OWNER_PASS ?? 'Owner@12345' };
const STAFF_PASS = 'Staff@12345';
const day = d => new Date(Date.now() + 330 * 60_000 + d * 86_400_000).toISOString().slice(0, 10);

async function waitForApi() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${API}/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('The app did not start within two minutes.');
}
async function signIn({ email, password }) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`Could not sign in as ${email} (${r.status}). Is the owner account set up?`);
  return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}
function as(cookie) {
  return async (method, path, body) => {
    const r = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    const json = text ? JSON.parse(text) : null;
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
    return json;
  };
}

await waitForApi();
const owner = as(await signIn(OWNER));

const existing = await owner('GET', '/v2/trips?q=Kashi&includeClosed=true');
if (existing.total > 0) { console.log('Sample data is already there — nothing added.'); process.exit(0); }

console.log('Adding the team…');
for (const [name, email, role] of [['Priya (Sales)', 'sales@gktravels.local', 'BOOKING'], ['Rahul (Accounts)', 'accounts@gktravels.local', 'ACCOUNTS'], ['Sunil (Operations)', 'ops@gktravels.local', 'OPERATIONS']]) {
  await owner('POST', '/users', { name, email, password: STAFF_PASS, role }).catch(e => console.log(`  ${email}: ${e.message.includes('409') || e.message.includes('exists') ? 'already there' : e.message}`));
}

console.log('A group pilgrimage with two families, from enquiry to accepted quotation…');
const e = await owner('POST', '/v2/enquiries', { newCustomer: { name: 'Ramesh Patil', phone: '9876543210', email: 'ramesh@example.com' }, source: 'WHATSAPP', destination: 'Kashi (Varanasi)', adults: 4, children: 1, departureDate: day(5), returnDate: day(11) });
const traveller = (firstName, lastName) => owner('POST', '/v2/travellers', { firstName, lastName, customerId: e.customer.id });
const [t1, t2, t3] = [await traveller('Ramesh', 'Patil'), await traveller('Sunita', 'Patil'), await traveller('Vinayak', 'Kulkarni')];
const q = await owner('POST', '/v2/quotations', {
  enquiryId: e.id, gstMode: 'EXCLUDED', gstRate: 5,
  parties: [{ key: 'p', name: 'Patil family', adults: 2, travellerIds: [t1.id, t2.id] }, { key: 'k', name: 'Kulkarni family', adults: 2, children: 1, travellerIds: [t3.id] }],
  items: [
    { key: 'h1', serviceType: 'HOTEL', description: 'Ganga View — room, 5 nights', pricingBasis: 'PER_ROOM', costPrice: 3000, sellPrice: 3800, quantity: 1, nights: 5, partyKey: 'p' },
    { key: 'h2', serviceType: 'HOTEL', description: 'Ganga View — room, 5 nights', pricingBasis: 'PER_ROOM', costPrice: 3000, sellPrice: 3800, quantity: 1, nights: 5, partyKey: 'k' },
    { key: 'bus', serviceType: 'VEHICLE', description: 'Tempo traveller for darshan', pricingBasis: 'PER_GROUP', costPrice: 18000, sellPrice: 24000 },
  ],
});
await owner('POST', `/v2/quotations/${q.id}/send`);
const accepted = await owner('POST', `/v2/quotations/${q.id}/accept`, { splitByParty: true });
const contract = await owner('GET', `/v2/contracts/${accepted.bookings[0]}`);
const tripId = contract.tripId;
await owner('PUT', `/v2/trips/${tripId}`, { tourName: 'Kashi Yatra' });
await owner('PUT', `/v2/trips/${tripId}/pickup-points`, { points: [
  { name: 'Belagavi — Central Bus Stand', landmark: 'Near platform 3', pickupAt: `${day(5)}T21:30` },
  { name: 'Sangli — Vishrambag Chowk', pickupAt: `${day(5)}T23:45` },
] }).catch(e2 => console.log(`  pickup points: ${e2.message}`));

console.log('A payment from the Patil family…');
const patil = (await Promise.all(accepted.bookings.map(id => owner('GET', `/v2/contracts/${id}`)))).find(c => /Patil/.test(c.partyName ?? ''));
const accounts = as(await signIn({ email: 'accounts@gktravels.local', password: STAFF_PASS }));
await accounts('POST', '/v2/receipts', { contractId: patil.id, amount: 20000, mode: 'UPI', receivedAt: day(0), reference: 'UPI sample' });

console.log('More enquiries and a task…');
for (const [name, phone, destination, source] of [['Anand Deshpande', '9812345670', 'Goa', 'PHONE'], ['Meera Joshi', '9823456780', 'Rameshwaram', 'REFERRAL'], ['Kiran Naik', '9834567890', 'Shirdi', 'WEBSITE']]) {
  await owner('POST', '/v2/enquiries', { newCustomer: { name, phone }, source, destination, adults: 2, departureDate: day(30), returnDate: day(34) });
}
const team = await owner('GET', '/v2/me/team');
const sunil = (team.items ?? team).find(u => (u.name ?? '').startsWith('Sunil'));
await owner('POST', '/v2/tasks', { title: 'Confirm the Ganga View rooming list', priority: 'high', tripId, assignedToUserId: sunil?.id ?? null });

const link = await owner('POST', '/v2/portal-links', { customerId: e.customer.id, days: 90, label: 'Sample link' });

console.log('\nDone. Sign in at http://localhost:3000');
console.log('  Owner      owner@gktravels.local    / Owner@12345');
console.log('  Sales      sales@gktravels.local    / Staff@12345');
console.log('  Accounts   accounts@gktravels.local / Staff@12345');
console.log('  Operations ops@gktravels.local      / Staff@12345');
console.log(`\nSample trip: http://localhost:3000/trips/${tripId}`);
console.log(`Ramesh Patil's own page: ${link.url ?? `http://localhost:3000${link.path}`}`);
