const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const rateLimit = require("express-rate-limit");
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = process.env.PORT || 3000;

// Middleware de logging
app.use((req, res, next) => {
    console.log('===== Nouvelle Requête =====');
    console.log('Méthode:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', req.headers);
    console.log('Body:', typeof req.body === 'object' ? JSON.stringify(req.body, null, 2) : req.body);
    next();
});

app.set('trust proxy', 1);

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Trop de requêtes de cette IP, veuillez réessayer après 15 minutes"
});

app.use(apiLimiter);
app.use(express.json());
app.use(express.text());
app.use(bodyParser.urlencoded({ extended: true }));

const clients = new Set();
let lastSignals = {};

const knownSymbols = ['GOLD', 'XAUUSD'];

function normalizeSymbol(symbol) {
    if (!symbol) return 'UNKNOWN';
    
    symbol = symbol.toUpperCase();
    
    const symbolMap = {
        'XAUUSD': 'GOLD',
        'GOLD': 'XAUUSD'
    };

    return symbolMap[symbol] || symbol;
}

function isValidSignal(data) {
    const requiredFields = ['action', 'symbol', 'price'];
    for (const field of requiredFields) {
        if (!data[field]) {
            console.log(`Signal invalide - champ manquant: ${field}`);
            return false;
        }
    }
    
    const validActions = ['BUY', 'SELL', 'CLOSE'];
    if (!validActions.includes(data.action.toUpperCase())) {
        console.log(`Action invalide: ${data.action}`);
        return false;
    }
    
    return true;
}

function processTradeSignal(data) {
    console.log('Traitement du signal:', JSON.stringify(data, null, 2));

    try {
        if (data.action === 'check_signal') {
            if (!data.symbols || !Array.isArray(data.symbols)) {
                throw new Error("La liste des symboles est manquante ou invalide");
            }

            return data.symbols.map(symbol => {
                const normalizedSymbol = normalizeSymbol(symbol);
                const lastSignal = lastSignals[normalizedSymbol];
                
                if (lastSignal && (new Date() - new Date(lastSignal.timestamp)) < 300000) {
                    delete lastSignals[normalizedSymbol];
                    return lastSignal;
                }
                
                return {
                    action: 'WAIT',
                    symbol: normalizedSymbol,
                    id: Date.now(),
                    price: 0,
                    sl: 0,
                    tp: 0,
                    positionSize: 1,
                    timestamp: new Date().toISOString()
                };
            });
        }

        if (!isValidSignal(data)) {
            throw new Error("Signal invalide - validation échouée");
        }

        let processedData = {
            action: (data.Action || data.action || '').toUpperCase(),
            symbol: normalizeSymbol(data.Symbol || data.symbol || ''),
            id: data.ID || data.id || Date.now(),
            price: parseFloat(data.Prix || data.price || 0),
            sl: parseFloat(data.SL || data.sl || 0),
            tp: parseFloat(data.TP || data.tp || 0),
            positionSize: parseFloat(data.positionSize || data.size || 1),
            timestamp: new Date().toISOString()
        };

        if (processedData.symbol !== 'UNKNOWN') {
            lastSignals[processedData.symbol] = processedData;
            console.log('Signal traité avec succès:', processedData);
        }

        return [processedData];
    } catch (error) {
        console.error('Erreur lors du traitement du signal:', error);
        throw error;
    }
}

// Gestion des WebSocket
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Nouvelle connexion WebSocket établie - Total clients:', clients.size);

    // Envoyer un message de confirmation
    ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connecté au serveur de trading',
        timestamp: new Date().toISOString()
    }));

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Connexion WebSocket fermée - Total clients:', clients.size);
    });
    
    ws.on('error', (error) => {
        console.error('Erreur WebSocket:', error);
    });
});

// Route Webhook
app.post('/webhook/tradingview/:secret', (req, res) => {
    console.log('\n=== Requête Webhook Reçue ===');
    console.log('Secret reçu:', req.params.secret);
    console.log('Secret attendu:', process.env.WEBHOOK_SECRET);
    console.log('Body:', typeof req.body === 'object' ? JSON.stringify(req.body, null, 2) : req.body);

    const { secret } = req.params;
    
    if (secret !== process.env.WEBHOOK_SECRET) {
        console.log('Tentative d\'accès non autorisée au webhook');
        return res.status(401).json({ error: 'Non autorisé' });
    }

    try {
        const signals = processTradeSignal(req.body);
        console.log('Signaux traités:', JSON.stringify(signals, null, 2));
        
        let clientsNotified = 0;
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(signals));
                clientsNotified++;
            }
        });

        console.log(`Signaux envoyés à ${clientsNotified} clients`);

        res.status(200).json({ 
            message: 'Signaux traités et envoyés avec succès', 
            signals: signals,
            clientsNotified
        });
    } catch (error) {
        console.error('Erreur lors du traitement du signal:', error);
        res.status(400).json({ 
            error: 'Erreur de traitement du signal', 
            details: error.message 
        });
    }
});

// Routes d'information
app.get('/', (req, res) => {
    res.json({
        message: "API de trading Gold",
        endpoints: {
            webhook: "/webhook/tradingview/:secret (POST)",
            test: "/test (GET)"
        },
        symbols: knownSymbols,
        version: "2.0.0",
        wsClients: clients.size
    });
});

app.get('/test', (req, res) => {
    console.log('Test request received');
    res.json({ 
        status: 'OK',
        timestamp: new Date().toISOString(),
        symbols: knownSymbols,
        activeConnections: clients.size,
        lastSignalsCount: Object.keys(lastSignals).length,
        environment: {
            node: process.version,
            platform: process.platform,
            memory: process.memoryUsage()
        }
    });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
    console.error('Erreur non gérée:', err);
    res.status(500).json({ 
        error: 'Erreur interne du serveur', 
        details: err.message
    });
});

// Démarrage du serveur
server.listen(port, () => {
    console.log(`\n=== Démarrage du Serveur ===`);
    console.log(`Serveur démarré sur le port ${port}`);
    console.log('Symboles supportés:', knownSymbols);
    console.log('WebSocket activé');
    console.log('Environnement:', process.env.NODE_ENV);
});

// Gestion des arrêts propres
process.on('SIGTERM', () => {
    console.log('Signal SIGTERM reçu: arrêt du serveur HTTP');
    server.close(() => {
        console.log('Serveur HTTP arrêté');
        process.exit(0);
    });
});

process.on('uncaughtException', (err) => {
    console.error('Erreur non capturée:', err);
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promesse rejetée non gérée:', reason);
});

module.exports = app;