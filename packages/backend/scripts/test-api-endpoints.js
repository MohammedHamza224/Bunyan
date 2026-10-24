const axios = require('axios');

async function testApi() {
  const baseURL = 'http://localhost:3001/api';

  console.log('1. Logging in as admin@contractorflow.local...');
  const loginRes = await axios.post(`${baseURL}/auth/login`, {
    email: 'admin@contractorflow.local',
    password: 'Password123!',
  });
  console.log('Login Response:', loginRes.data);
  const token = loginRes.data?.data?.tokens?.accessToken;
  console.log('Using Token:', token ? token.substring(0, 20) + '...' : 'undefined');

  const headers = { Authorization: `Bearer ${token}` };

  console.log('\n2. Testing GET /organizations/bank-accounts...');
  const banksRes = await axios.get(`${baseURL}/organizations/bank-accounts`, { headers });
  console.log('Bank accounts count:', banksRes.data?.data?.length);
  banksRes.data?.data?.forEach((b) => {
    console.log(` - [ID: ${b.id}] ${b.bankNameAr} / ${b.bankNameEn} | Default: ${b.isDefault} | IBAN: ${b.iban}`);
  });

  console.log('\n3. Testing GET /invoices/cmvk8cwjl0033x4f21q2d65w6...');
  const invRes = await axios.get(`${baseURL}/invoices/cmvk8cwjl0033x4f21q2d65w6`, { headers });
  const inv = invRes.data?.data;
  console.log('Invoice Ref:', inv.referenceNo);
  console.log('Default Bank attached:', inv.defaultBankAccount ? `${inv.defaultBankAccount.bankNameAr} (${inv.defaultBankAccount.iban})` : 'None');
  console.log('Payments count:', inv.payments?.length);
  inv.payments?.forEach((p) => {
    console.log(` - Payment: ${p.method} | Amount: ${p.amount} | Receiving Bank: ${p.bankAccount?.bankNameAr || 'N/A'}`);
  });

  console.log('\n4. Testing GET /invoices/cmvk8cwjl0033x4f21q2d65w6/pdf-data...');
  const pdfRes = await axios.get(`${baseURL}/invoices/cmvk8cwjl0033x4f21q2d65w6/pdf-data`, { headers });
  const pdfData = pdfRes.data?.data;
  console.log('PDF Data Invoice Ref:', pdfData.referenceNo);
  console.log('PDF Data defaultBankAccount:', pdfData.defaultBankAccount?.bankNameAr);
  console.log('PDF Data payments:', pdfData.payments?.length);

  console.log('\n5. Testing GET /payments...');
  const payRes = await axios.get(`${baseURL}/payments`, { headers });
  console.log('Total recorded payments in org:', payRes.data?.data?.total);
  payRes.data?.data?.items?.forEach((p) => {
    console.log(` - [ID: ${p.id}] ${p.method} ${p.amount} SAR | Ref: ${p.referenceNo || 'None'} | Bank: ${p.bankAccount?.bankNameAr || 'N/A'}`);
  });

  console.log('\nALL API ENDPOINTS TESTED AND VERIFIED SUCCESSFULLY!');
}

testApi().catch((err) => {
  console.error('API Test Error:', err.response?.data || err.message);
  process.exit(1);
});
