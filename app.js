// Variables globales
let apiKey = '';
let apiSecret = '';
let updateInterval;
let allPairs = [];
let selectedPairs = [];
let lastData = {};
let recentAlerts = {}; // Registro de alertas recientes

const telegramToken = '7876073170:AAF08SOSv15JqDMaGbYNF1zkoz0EMRTXSQ8'; // Reemplaza con tu token de Telegram


// Elementos DOM
const apiForm = document.getElementById('api-form');
const dashboard = document.getElementById('dashboard');
const apiKeyInput = document.getElementById('api-key');
const apiSecretInput = document.getElementById('api-secret');
const saveApiBtn = document.getElementById('save-api');
const changeApiBtn = document.getElementById('change-api');
const refreshBtn = document.getElementById('refresh-btn');
const connectionStatus = document.querySelector('.status-text');
const updateTime = document.querySelector('.update-time');
const dataBody = document.getElementById('data-body');
const alertsList = document.getElementById('alerts-list');
const notification = document.getElementById('notification');
const notificationContent = document.getElementById('notification-content');
const closeNotification = document.querySelector('.close-notification');

// Configuración inicial
document.addEventListener('DOMContentLoaded', () => {
    // Comprobar si ya hay credenciales guardadas
    const savedApiKey = localStorage.getItem('binance_api_key');
    const savedApiSecret = localStorage.getItem('binance_api_secret');
    const savedTelegramUsername = localStorage.getItem('telegram_username'); // Recuperar el nombre de usuario o grupo
    const savedInitiatorName = localStorage.getItem('initiator_name'); // Recuperar el nombre del iniciador

    if (savedApiKey && savedApiSecret && savedTelegramUsername && savedInitiatorName) {
        apiKey = savedApiKey;
        apiSecret = savedApiSecret;
        document.getElementById('telegram-username').value = savedTelegramUsername; // Llenar el campo en el formulario
        document.getElementById('initiator-name').value = savedInitiatorName; // Llenar el campo del nombre del iniciador
        apiForm.classList.add('hidden');
        dashboard.classList.remove('hidden');
        init();
    }
    
    // Event listeners
    saveApiBtn.addEventListener('click', saveApiCredentials);
    changeApiBtn.addEventListener('click', showApiForm);
    refreshBtn.addEventListener('click', refreshData);
    closeNotification.addEventListener('click', hideNotification);
    
    // Solicitar permiso para notificaciones
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
});

// Funciones principales

function normalizeText(text) {
    // Si text es undefined, null o no es una cadena, devolver una cadena vacía
    if (typeof text !== 'string' || !text) {
        return '';
    }

    // Eliminar emojis y otros caracteres no alfanuméricos
    const normalizedText = text.replace(/[^\w\s]/gi, '').toLowerCase();
    return normalizedText;
}

async function saveApiCredentials() {
    const key = apiKeyInput.value.trim();
    const secret = apiSecretInput.value.trim();
    const telegramUsername = document.getElementById('telegram-username').value.trim(); // Obtener el nombre de usuario o grupo
    const initiatorName = document.getElementById('initiator-name').value.trim(); // Capturar el nombre del iniciador

    if (!key || !secret || !telegramUsername || !initiatorName) {
        alert('Por favor ingresa la API Key, el API Secret, el nombre de usuario o grupo de Telegram y tu nombre.');
        return;
    }
    
    // Validar el nombre de usuario o grupo de Telegram
    const isValidUsername = await validateTelegramUsername(telegramUsername);
    if (!isValidUsername) {
        alert('El nombre de usuario o grupo de Telegram no es válido. Asegúrate de que el bot esté añadido al grupo o que el usuario exista.');
        return;
    }

     // Guardar credenciales y nombre del iniciador
     apiKey = key;
     apiSecret = secret;
     localStorage.setItem('binance_api_key', apiKey);
     localStorage.setItem('binance_api_secret', apiSecret);
     localStorage.setItem('telegram_username', telegramUsername);
     localStorage.setItem('initiator_name', initiatorName); // Guardar el nombre del iniciador
     
    // Cambiar a la vista del dashboard
    apiForm.classList.add('hidden');
    dashboard.classList.remove('hidden');
    
    // Inicializar
    init();
}

function showApiForm() {
    clearInterval(updateInterval);
    dashboard.classList.add('hidden');
    apiForm.classList.remove('hidden');
    apiKeyInput.value = apiKey;
    apiSecretInput.value = apiSecret;
}

async function validateTelegramUsername(username) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${telegramToken}/getUpdates`);
        const data = await response.json();

        if (data.ok && data.result.length > 0) {
            // Normalizar el nombre ingresado por el usuario
            const normalizedUsername = normalizeText(username);

            // Buscar el nombre de usuario o grupo en las actualizaciones
            const isValid = data.result.some(update => {
                const chat = update.message?.chat;
                if (!chat) return false;

                // Normalizar el nombre del chat (usuario o grupo)
                const chatName = chat.username || chat.title || '';
                const normalizedChatName = normalizeText(chatName);

                // Comparar los nombres normalizados
                return normalizedChatName === normalizedUsername;
            });

            return isValid;
        }
        return false;
    } catch (error) {
        console.error('Error validando el nombre de usuario o grupo de Telegram:', error);
        return false;
    }
}

function init() {
    // Actualizar el estado
    connectionStatus.textContent = 'Conectando...';
    
    // Obtener todos los pares de Binance y empezar el análisis
    fetchAllPairs()
        .then(pairs => {
            allPairs = pairs;
            connectionStatus.textContent = 'Conectado';
            connectionStatus.classList.add('connected');

            // Actualizar contador de pares
            document.querySelector('.total-pairs').textContent = allPairs.length;
            
            /// Obtener el nombre de usuario o grupo de Telegram guardado
            const telegramUsername = localStorage.getItem('telegram_username');

            // Obtener el nombre del iniciador desde localStorage
            const initiatorName = localStorage.getItem('initiator_name'); // Recuperar el nombre del iniciador

            // Verificar si el nombre del iniciador está definido
            if (!initiatorName) {
                console.error('Nombre del iniciador no definido.');
                return;
            }
            
            // Enviar mensaje de inicio por Telegram
            const totalPairs = allPairs.length;
            const message = `La aplicación se ha iniciado correctamente. Se han analizado ${totalPairs} pares.\nAplicación iniciada por: ${initiatorName}`;            
            sendTelegramMessage(message, telegramUsername);

            // Realizar la primera actualización
            refreshData();
            
            // Configurar actualización periódica (cada minuto)
            updateInterval = setInterval(refreshData, 60000);
        })
        .catch(error => {
            console.error('Error al conectar con Binance:', error);
            connectionStatus.textContent = 'Error de conexión';
            alert('Error al conectar con Binance. Verifica tus credenciales API.');
        });
}

async function fetchAllPairs() {
    try {
        const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
        const data = await response.json();
        
        // Filtrar solo los pares perpetuos que terminan en USDT
        return data.symbols
            .filter(symbol => symbol.contractType === 'PERPETUAL' && symbol.symbol.endsWith('USDT') && symbol.status === 'TRADING')
            .map(symbol => symbol.symbol);
    } catch (error) {
        console.error('Error al obtener pares:', error);
        throw error;
    }
}

async function refreshData() {
    try {
        dataBody.innerHTML = '<tr><td colspan="5" class="loading">Cargando datos...</td></tr>';
        
        // Actualizar la hora
        const now = new Date();
        updateTime.textContent = now.toLocaleTimeString();
        
        // Procesar todos los pares
        const results = await Promise.all(allPairs.map(async (pair) => {
            try {
                // Obtener los datos de las velas
                const klines = await fetchKlines(pair, '5m', 100);
                
                // Calcular indicadores
                const { closes, rsi, ema10, distanceToEma10Percent, hasDivergence } = calculateIndicators(klines);
                
                // Guardar los datos
                lastData[pair] = {
                    closes,
                    rsi: rsi[rsi.length - 1],
                    ema10: ema10[ema10.length - 1],
                    distanceToEma10Percent,
                    hasDivergence
                };
                
                // Devolver los resultados solo si el RSI es mayor que 70
                if (rsi[rsi.length - 1] > 70) {
                    return {
                        pair,
                        rsi: rsi[rsi.length - 1],
                        ema10: ema10[ema10.length - 1],
                        distanceToEma10Percent,
                        hasDivergence
                    };
                }
                return null;
            } catch (error) {
                console.error(`Error procesando ${pair}:`, error);
                return null;
            }
        }));
        
        // Filtrar resultados válidos (RSI > 70)
        selectedPairs = results.filter(result => result !== null);
        
        // Actualizar la tabla
        updateTable();
        
        // Comprobar alertas
        checkForAlerts();
    } catch (error) {
        console.error('Error al actualizar datos:', error);
        connectionStatus.textContent = 'Error de actualización';
        connectionStatus.classList.remove('connected');
    }
}

async function fetchKlines(symbol, interval, limit) {
    try {
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        return data.map(kline => ({
            openTime: kline[0],
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5]),
            closeTime: kline[6]
        }));
    } catch (error) {
        console.error(`Error fetching klines for ${symbol}:`, error);
        throw error;
    }
}

function calculateIndicators(klines) {
    // Extraer datos necesarios
    const closes = klines.map(k => k.close);
    const highs = klines.map(k => k.high);
    
    // Calcular RSI - Corrigiendo el acceso a la librería
    const rsi = calculateRSI(closes, 14);
    
    // Calcular EMA de 10 periodos
    const ema10 = calculateEMA(closes, 10);
    
    // Calcular la distancia del precio de cierre actual a la EMA10 en porcentaje
    const currentClose = closes[closes.length - 1];
    const currentEma10 = ema10[ema10.length - 1];
    const distanceToEma10Percent = ((currentClose - currentEma10) / currentEma10) * 100;
    
    // Verificar si hay divergencia en RSI
    const hasDivergence = checkForDivergence(klines, rsi, ema10);
    
    return {
        closes,
        rsi,
        ema10,
        distanceToEma10Percent,
        hasDivergence
    };
}

// Función para calcular RSI manualmente
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) {
        // Necesitamos al menos period + 1 datos para calcular el primer RSI
        return Array(prices.length).fill(0);
    }
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
        changes.push(prices[i] - prices[i - 1]);
    }
    
    const rsiValues = [];
    
    // Rellenamos con ceros hasta tener suficientes datos
    for (let i = 0; i < period; i++) {
        rsiValues.push(0);
    }
    
    // Calculamos las ganancias y pérdidas iniciales
    let gains = 0;
    let losses = 0;
    
    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) {
            gains += changes[i];
        } else {
            losses -= changes[i];
        }
    }
    
    // Calculamos la primera media de ganancias y pérdidas
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    // Calculamos el primer RSI
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let rsi = 100 - (100 / (1 + rs));
    rsiValues.push(rsi);
    
    // Calculamos el resto de valores RSI
    for (let i = period; i < changes.length; i++) {
        const change = changes[i];
        let gain = 0;
        let loss = 0;
        
        if (change > 0) {
            gain = change;
        } else {
            loss = -change;
        }
        
        // Utilizamos la fórmula de suavizado
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        
        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
        rsiValues.push(rsi);
    }
    
    return rsiValues;
}

// Función para calcular EMA manualmente
function calculateEMA(prices, period) {
    const k = 2 / (period + 1);
    const emaValues = [];
    
    // Usar SMA como primer valor
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += prices[i];
    }
    
    // Rellenamos con ceros hasta tener suficientes datos
    for (let i = 0; i < period - 1; i++) {
        emaValues.push(0);
    }
    
    // Calculamos el primer EMA (que es un SMA)
    let previousEMA = sum / period;
    emaValues.push(previousEMA);
    
    // Calculamos los demás EMAs
    for (let i = period; i < prices.length; i++) {
        const currentEMA = (prices[i] * k) + (previousEMA * (1 - k));
        emaValues.push(currentEMA);
        previousEMA = currentEMA;
    }
    
    return emaValues;
}

function checkForDivergence(klines, rsi, ema10) {
    const currentIndex = klines.length - 1;
    const currentRsi = rsi[currentIndex];
    const currentHigh = klines[currentIndex].high;
    const currentClose = klines[currentIndex].close;
    const currentEma10 = ema10[currentIndex];
    
    // Calcular el rango de precio en porcentaje hasta la EMA10
    const distanceToEma10Percent = ((currentClose - currentEma10) / currentEma10) * 100;
    
    // Si la distancia a EMA10 no es mayor a 1%, no hay divergencia
    if (distanceToEma10Percent <= 1) {
        return false;
    }
    
    // Encontrar la última vela que cerró por debajo o igual a la EMA10 (mirando las últimas 20 velas)
    let startIndex = Math.max(0, currentIndex - 20);
    let lastBelowEmaIndex = -1;
    
    for (let i = currentIndex - 1; i >= startIndex; i--) {
        if (klines[i].close <= ema10[i]) {
            lastBelowEmaIndex = i;
            break;
        }
    }
    
    // Si no encontramos ninguna, comenzamos desde la vela 20 hacia atrás
    if (lastBelowEmaIndex === -1) {
        lastBelowEmaIndex = startIndex;
    } else {
        // Comenzamos desde la vela siguiente a la que cruzó o tocó la EMA10
        lastBelowEmaIndex++;
    }
    
    // Buscar el pico más alto de RSI desde ese punto
    let highestRsiIndex = lastBelowEmaIndex;
    let highestRsi = rsi[lastBelowEmaIndex];
    
    for (let i = lastBelowEmaIndex; i < currentIndex; i++) {
        if (rsi[i] > highestRsi) {
            highestRsi = rsi[i];
            highestRsiIndex = i;
        }
    }
    
    // Obtener el precio máximo de esa vela con el RSI más alto
    const peakHighPrice = klines[highestRsiIndex].high;
    
    // Verificar si ese pico está a más de 4 velas de distancia de la vela actual
    const distanceInCandles = currentIndex - highestRsiIndex;
    if (distanceInCandles <= 4) {
        return false;
    }
    
    // Verificar que el precio máximo actual sea mayor al precio máximo 
    // de la vela del pico de RSI y todas las velas entre ese pico y la actual
    let maxPriceSincePeak = peakHighPrice;

    // Revisar todas las velas desde el pico hasta la actual (sin incluir la actual)
    for (let i = highestRsiIndex; i < currentIndex; i++) {
        maxPriceSincePeak = Math.max(maxPriceSincePeak, klines[i].high);
    }

    // Verificar divergencia:
    // El precio máximo actual es mayor al precio máximo de todas las velas desde el pico del RSI
    // Y el RSI actual es menor al pico detectado
    if (currentHigh > maxPriceSincePeak && currentRsi < highestRsi) {
        return true;
    }
    
    return false;
}

function updateTable() {
    // Limpiar la tabla
    dataBody.innerHTML = '';
    
    if (selectedPairs.length === 0) {
        dataBody.innerHTML = '<tr><td colspan="5">No hay pares con RSI > 70</td></tr>';
        return;
    }
    
    // Actualizar contador de pares con RSI > 70
    document.getElementById('rsi-counter').textContent = selectedPairs.length;

    // Ordenar por distancia a ema10 descendente
    selectedPairs.sort((a, b) => b.distanceToEma10Percent - a.distanceToEma10Percent);
    
    // Actualizar la tabla
    selectedPairs.forEach(data => {
        const row = document.createElement('tr');
        if (data.hasDivergence) {
            row.classList.add('divergence-true');
        }
        
        row.innerHTML = `
            <td>${data.pair}</td>
            <td>${data.rsi.toFixed(2)}</td>
            <td>${data.ema10.toFixed(8)}</td>
            <td>${data.distanceToEma10Percent.toFixed(2)}%</td>
            <td>${data.hasDivergence ? '✓' : '✗'}</td>
        `;
        
        dataBody.appendChild(row);
    });
}

function checkForAlerts() {
    // Comprobar si algún par tiene divergencia y distancia a EMA10 > 1%
    const alertPairs = selectedPairs.filter(data => 
        data.hasDivergence && data.distanceToEma10Percent > 1
    );
    
    alertPairs.forEach(data => {
        // Crear alerta
        createAlert(data);
    });
}

function createAlert(data) {
    const pair = data.pair;
    const currentTime = Date.now();
    
    // Verificar si ya se alertó sobre este par en los últimos 5 minutos
    if (recentAlerts[pair] && (currentTime - recentAlerts[pair]) < 5 * 60 * 1000) {
        console.log(`Alerta suprimida para ${pair}: ya se alertó en los últimos 5 minutos`);
        return; // No ejecutar la alerta
    }
    
    // Registrar esta alerta
    recentAlerts[pair] = currentTime;
    
    // Crear elemento de alerta para la lista
    const alertItem = document.createElement('div');
    alertItem.className = 'alert-item';
    
    const now = new Date();
    const timeString = now.toLocaleString();
    
    alertItem.innerHTML = `
        <p><strong>Par:</strong> ${data.pair}</p>
        <p><strong>RSI:</strong> ${data.rsi.toFixed(2)}</p>
        <p><strong>Distancia a EMA10:</strong> ${data.distanceToEma10Percent.toFixed(2)}%</p>
        <p class="alert-time">${timeString}</p>
    `;
    
    // Agregar al inicio de la lista
    alertsList.insertBefore(alertItem, alertsList.firstChild);
    
    // Mostrar notificación
    showNotification(data, timeString);
    
    // Notificación del navegador si está permitido
    if (Notification.permission === 'granted') {
        const notification = new Notification('¡Alerta de Divergencia!', {
            body: `${data.pair} - RSI: ${data.rsi.toFixed(2)} - Distancia: ${data.distanceToEma10Percent.toFixed(2)}%`,
            icon: '/favicon.ico'
        });
        
        notification.onclick = function() {
            window.focus();
            this.close();
        };
    }

    // Enviar notificación por Telegram
    const telegramMessage = `¡Alerta de Divergencia!\nPar: ${data.pair}\nRSI: ${data.rsi.toFixed(2)}\nDistancia a EMA10: ${data.distanceToEma10Percent.toFixed(2)}%\nHora: ${timeString}`;
    sendTelegramMessage(telegramMessage);
}

function showNotification(data, timeString) {
    notificationContent.innerHTML = `
        <p><strong>Par:</strong> ${data.pair}</p>
        <p><strong>RSI:</strong> ${data.rsi.toFixed(2)}</p>
        <p><strong>Distancia a EMA10:</strong> ${data.distanceToEma10Percent.toFixed(2)}%</p>
        <p class="alert-time">${timeString}</p>
    `;
    
    notification.classList.remove('hidden');
    notification.classList.add('show');
    
    // Auto-ocultar después de 10 segundos
    setTimeout(() => {
        hideNotification();
    }, 10000);
}

function hideNotification() {
    notification.classList.remove('show');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 300);
}

// Función para realizar una solicitud firmada a la API de Binance (si es necesario)
async function signedRequest(endpoint, params = {}) {
    const timestamp = Date.now();
    const queryString = Object.entries({...params, timestamp})
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
    
    const signature = CryptoJS.HmacSHA256(queryString, apiSecret).toString();
    
    const url = `https://fapi.binance.com${endpoint}?${queryString}&signature=${signature}`;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-MBX-APIKEY': apiKey
        }
    });
    
    return response.json();
}

// Función para enviar mensajes por Telegram
async function sendTelegramMessage(message, username = localStorage.getItem('telegram_username')) {
    try {
        // Validar el nombre de usuario o grupo
        if (!username) {
            console.error('Nombre de usuario o grupo no definido.');
            return;
        }

        // Normalizar el nombre de usuario o grupo
        const normalizedUsername = normalizeText(username);

        // Obtener el chat_id del nombre de usuario o grupo
        const response = await fetch(`https://api.telegram.org/bot${telegramToken}/getUpdates`);
        const data = await response.json();

        if (data.ok && data.result.length > 0) {
            const chat = data.result.find(update => {
                const chatInfo = update.message?.chat;
                if (!chatInfo) return false;

                // Normalizar el nombre del chat (usuario o grupo)
                const chatName = chatInfo.username || chatInfo.title || '';
                const normalizedChatName = normalizeText(chatName);

                // Comparar los nombres normalizados
                return normalizedChatName === normalizedUsername;
            });

            if (chat) {
                const chatId = chat.message.chat.id;
                const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
                const payload = {
                    chat_id: chatId,
                    text: message
                };

                await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
            } else {
                console.error('No se encontró el chat_id para el nombre de usuario o grupo:', username);
            }
        }
    } catch (error) {
        console.error('Error al enviar mensaje por Telegram:', error);
    }
}





// Función para cambiar entre modo claro y oscuro
function toggleDarkMode() {
    const body = document.body;
    body.classList.toggle('dark-mode');

    // Guardar la preferencia del usuario en localStorage
    const isDarkMode = body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);

    // Cambiar el texto del botón
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.textContent = isDarkMode ? 'Modo Claro' : 'Modo Oscuro';
}

// Cargar la preferencia del usuario al iniciar
document.addEventListener('DOMContentLoaded', () => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    if (savedDarkMode) {
        document.body.classList.add('dark-mode');
    }

    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.textContent = savedDarkMode ? 'Modo Claro' : 'Modo Oscuro';

    themeToggle.addEventListener('click', toggleDarkMode);
});