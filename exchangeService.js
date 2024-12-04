const axios = require('axios');

const BASE_URL = 'https://www.alphavantage.co/query';
const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

async function getTicker(symbol) {
    try {
        const response = await axios.get(BASE_URL, {
            params: {
                function: 'GLOBAL_QUOTE',
                symbol: symbol,
                apikey: API_KEY
            }
        });
        
        const data = response.data['Global Quote'];
        return {
            symbol: data['01. symbol'],
            price: parseFloat(data['05. price']),
            volume: parseFloat(data['06. volume']),
            latestTradingDay: data['07. latest trading day'],
            previousClose: parseFloat(data['08. previous close']),
            change: parseFloat(data['09. change']),
            changePercent: data['10. change percent']
        };
    } catch (error) {
        console.error(`Erreur lors de la récupération du ticker pour ${symbol}:`, error);
        throw error;
    }
}

// Note: Alpha Vantage n'offre pas de fonctionnalité pour placer des ordres.
// Cette fonction est laissée comme un exemple, mais ne fonctionnera pas réellement.
async function placeOrder(symbol, type, side, amount, price = null) {
    throw new Error("La fonction placeOrder n'est pas disponible avec Alpha Vantage");
}

module.exports = { getTicker, placeOrder };