const crypto = require('crypto');

function generateApiKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

const apiKey = generateApiKey();
console.log('Votre nouvelle API_KEY :', apiKey);
console.log('Ajoutez cette ligne à votre fichier .env :');
console.log(`API_KEY=${apiKey}`);