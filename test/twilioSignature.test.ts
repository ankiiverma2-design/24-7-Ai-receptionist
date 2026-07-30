import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTwilioSignature,
  isValidTwilioSignature,
} from '../src/telephony/twilioSignature.ts';

// Canonical example from Twilio's documented signature algorithm.
const AUTH_TOKEN = '12345';
const URL = 'https://mycompany.com/myapp.php?foo=1&bar=2';
const PARAMS = { Digits: '1234', To: '+18005551212', From: '+14158675309', Caller: '+14158675309', CallSid: 'CA1234567890ABCDE' };
// Canonical value from Twilio's documented signature example.
const EXPECTED = 'RSOYDt4T1cUTdK1PDd93/VVr8B8=';

test('computes the documented Twilio signature', () => {
  assert.equal(computeTwilioSignature(AUTH_TOKEN, URL, PARAMS), EXPECTED);
});

test('validates a correct signature and rejects a bad one', () => {
  assert.equal(isValidTwilioSignature(AUTH_TOKEN, URL, PARAMS, EXPECTED), true);
  assert.equal(isValidTwilioSignature(AUTH_TOKEN, URL, PARAMS, 'wrong'), false);
  assert.equal(isValidTwilioSignature(AUTH_TOKEN, URL, PARAMS, undefined), false);
});

test('signature changes when params change', () => {
  const other = computeTwilioSignature(AUTH_TOKEN, URL, { ...PARAMS, Digits: '9999' });
  assert.notEqual(other, EXPECTED);
});
