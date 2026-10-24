const axios = require('axios');

async function testLiveReset() {
  const baseURL = 'http://localhost:3001/api';

  console.log('1. Logging in as admin...');
  const loginRes = await axios.post(`${baseURL}/auth/login`, {
    email: 'admin@bunyan.sa',
    password: 'Password123!',
  });
  const token = loginRes.data?.data?.tokens?.accessToken;
  console.log('Login successful, token acquired:', token ? 'YES' : 'NO');

  const headers = { Authorization: `Bearer ${token}` };

  console.log('2. Requesting audit cleanup preview...');
  const previewRes = await axios.post(
    `${baseURL}/audit-logs/cleanup/preview`,
    { olderThanDays: 90 },
    { headers }
  );
  console.log('Preview data:', previewRes.data?.data);

  console.log('3. Calling Reset Test Audit Logs in development...');
  const resetRes = await axios.post(
    `${baseURL}/audit-logs/reset-test-logs`,
    { confirmationToken: 'RESET_TEST_AUDIT_LOGS' },
    { headers }
  );
  console.log('Reset response:', resetRes.data);

  console.log('4. Checking Audit Logs after Reset...');
  const afterLogsRes = await axios.get(`${baseURL}/audit-logs?limit=50`, { headers });
  console.log(`Remaining audit logs count: ${afterLogsRes.data?.data?.total}`);
  console.log('Recent audit log items after reset:');
  afterLogsRes.data?.data?.items.forEach((item) => {
    console.log(`- [${item.action}] ${item.entityType}: ${item.description}`);
  });
}

testLiveReset().catch((err) => {
  console.error('Error in live test:', err.response?.data || err.message);
  process.exit(1);
});
