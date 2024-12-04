const crypto = require('crypto');

function generateWebhookSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

const secret = generateWebhookSecret();
console.log('Votre nouveau WEBHOOK_SECRET :', secret);