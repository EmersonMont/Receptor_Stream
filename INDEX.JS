const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Clientes WebSocket conectados (browsers)
const clients = new Set();

// Configuração do áudio - ajuste conforme o app Android
const SAMPLE_RATE = 44100; // Taxa de amostragem
const CHANNELS = 1; // Mono

// Aceitar JSON e dados binários
app.use(express.json({ limit: "50mb" }));
app.use(express.raw({ type: "application/octet-stream", limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Servir página HTML do player
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎧 Audio Stream - Receptor</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
        }
        
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            max-width: 600px;
            width: 90%;
        }
        
        h1 {
            font-size: 2rem;
            margin-bottom: 10px;
            background: linear-gradient(90deg, #00d9ff, #00ff88);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .subtitle {
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 30px;
        }
        
        .status {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 15px 25px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 50px;
            margin-bottom: 30px;
        }
        
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #ff4444;
            animation: pulse 2s infinite;
        }
        
        .status-dot.connected {
            background: #00ff88;
        }
        
        .status-dot.streaming {
            background: #00d9ff;
            animation: pulse-fast 0.5s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        @keyframes pulse-fast {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.2); }
        }
        
        .visualizer {
            height: 120px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 15px;
            margin-bottom: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 3px;
            padding: 20px;
            overflow: hidden;
        }
        
        .bar {
            width: 8px;
            background: linear-gradient(to top, #00ff88, #00d9ff);
            border-radius: 4px;
            transition: height 0.05s ease;
            min-height: 5px;
        }
        
        .info-box {
            background: rgba(0, 0, 0, 0.2);
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 20px;
        }
        
        .info-title {
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 10px;
        }
        
        .info-value {
            font-size: 1.5rem;
            font-weight: bold;
            color: #00d9ff;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .stat-box {
            background: rgba(0, 0, 0, 0.2);
            padding: 15px;
            border-radius: 10px;
        }
        
        .stat-value {
            font-size: 1.2rem;
            font-weight: bold;
            color: #00d9ff;
        }
        
        .stat-label {
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.5);
        }
        
        .btn {
            padding: 15px 40px;
            font-size: 1.1rem;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            transition: all 0.3s ease;
            background: linear-gradient(90deg, #00d9ff, #00ff88);
            color: #1a1a2e;
            font-weight: bold;
            margin: 5px;
        }
        
        .btn:hover {
            transform: scale(1.05);
            box-shadow: 0 5px 20px rgba(0, 217, 255, 0.4);
        }
        
        .btn.secondary {
            background: rgba(255, 255, 255, 0.1);
            color: white;
        }
        
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        
        .volume-control {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
            margin-top: 20px;
        }
        
        .volume-control input {
            width: 150px;
        }
        
        .log-area {
            background: rgba(0, 0, 0, 0.4);
            border-radius: 10px;
            padding: 15px;
            margin-top: 20px;
            max-height: 150px;
            overflow-y: auto;
            text-align: left;
            font-family: monospace;
            font-size: 0.8rem;
        }
        
        .log-entry {
            color: #00ff88;
            margin-bottom: 5px;
        }
        
        .screen-status-box {
            background: rgba(0, 0, 0, 0.3);
            border: 2px solid rgba(255, 255, 255, 0.2);
            padding: 20px;
            border-radius: 15px;
            margin-top: 20px;
            text-align: center;
        }
        
        .screen-label {
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 10px;
        }
        
        .screen-value {
            font-size: 2rem;
            font-weight: bold;
            transition: all 0.3s ease;
        }
        
        .screen-value.on {
            color: #00ff88;
            text-shadow: 0 0 10px #00ff88;
        }
        
        .screen-value.off {
            color: #ff4444;
            text-shadow: 0 0 10px #ff4444;
        }
        
        .screen-time {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.5);
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎧 Audio Stream</h1>
        <p class="subtitle">Receptor de Áudio em Tempo Real</p>
        
        <div class="status">
            <div class="status-dot" id="statusDot"></div>
            <span id="statusText">Desconectado</span>
        </div>
        
        <div class="visualizer" id="visualizer"></div>
        
        <div class="stats">
            <div class="stat-box">
                <div class="stat-value" id="packetCount">0</div>
                <div class="stat-label">Pacotes</div>
            </div>
            <div class="stat-box">
                <div class="stat-value" id="bytesReceived">0 KB</div>
                <div class="stat-label">Dados</div>
            </div>
            <div class="stat-box">
                <div class="stat-value" id="lastUpdate">--:--:--</div>
                <div class="stat-label">Última</div>
            </div>
        </div>
        
        <div>
            <button class="btn" id="connectBtn" onclick="toggleConnection()">Conectar</button>
            <button class="btn secondary" id="playBtn" onclick="startAudio()" disabled>▶️ Iniciar Áudio</button>
        </div>
        
        <div class="volume-control">
            <span>🔊</span>
            <input type="range" id="volume" min="0" max="100" value="50">
            <span id="volumeValue">50%</span>
        </div>
        
        <div class="screen-status-box">
            <div class="screen-label">📱 ESTADO DA TELA</div>
            <div class="screen-value" id="screenStatus">--</div>
            <div class="screen-time" id="screenTime">Aguardando...</div>
        </div>
        
        <div class="log-area" id="logArea">
            <div class="log-entry">Aguardando conexão...</div>
        </div>
    </div>

    <script>
        let ws = null;
        let audioContext = null;
        let packetCount = 0;
        let bytesReceived = 0;
        let isConnected = false;
        let isPlaying = false;
        let gainNode = null;
        
        // Buffer para áudio
        let audioQueue = [];
        let isProcessing = false;
        
        // Configuração - deve corresponder ao app Android
        const SAMPLE_RATE = 44100;
        const CHANNELS = 1;
        
        // Criar barras do visualizador
        const visualizer = document.getElementById('visualizer');
        const bars = [];
        for (let i = 0; i < 40; i++) {
            const bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.height = '5px';
            visualizer.appendChild(bar);
            bars.push(bar);
        }
        
        function addLog(message) {
            const logArea = document.getElementById('logArea');
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.textContent = new Date().toLocaleTimeString() + ' - ' + message;
            logArea.appendChild(entry);
            logArea.scrollTop = logArea.scrollHeight;
            
            // Limitar a 50 entradas
            while (logArea.children.length > 50) {
                logArea.removeChild(logArea.firstChild);
            }
        }
        
        function updateStatus(status, text) {
            const dot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            
            dot.className = 'status-dot ' + status;
            statusText.textContent = text;
        }
        
        function updateVisualizer(audioData) {
            if (!audioData || audioData.length === 0) return;
            
            const step = Math.floor(audioData.length / bars.length);
            bars.forEach((bar, i) => {
                let sum = 0;
                for (let j = 0; j < step; j++) {
                    sum += Math.abs(audioData[i * step + j] || 0);
                }
                const avg = sum / step;
                const height = 5 + (avg * 100);
                bar.style.height = Math.min(height, 100) + 'px';
            });
        }
        
        function updateScreenStatus(screenOn, timestamp) {
            const screenElement = document.getElementById('screenStatus');
            const timeElement = document.getElementById('screenTime');
            
            if (screenOn) {
                screenElement.textContent = '✅ LIGADA';
                screenElement.className = 'screen-value on';
            } else {
                screenElement.textContent = '❌ DESLIGADA';
                screenElement.className = 'screen-value off';
            }
            
            const date = new Date(timestamp);
            timeElement.textContent = date.toLocaleTimeString('pt-BR');
        }
        
        function toggleConnection() {
            if (isConnected) {
                disconnect();
            } else {
                connect();
            }
        }
        
        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(protocol + '//' + window.location.host);
            
            ws.binaryType = 'arraybuffer';
            
            ws.onopen = () => {
                isConnected = true;
                updateStatus('connected', 'Conectado');
                document.getElementById('connectBtn').textContent = 'Desconectar';
                document.getElementById('playBtn').disabled = false;
                addLog('Conectado ao servidor WebSocket');
            };
            
            ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    // Dados binários de áudio
                    packetCount++;
                    document.getElementById('packetCount').textContent = packetCount;
                    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
                    updateStatus('streaming', 'Recebendo');
                    
                    bytesReceived += event.data.byteLength;
                    document.getElementById('bytesReceived').textContent = (bytesReceived / 1024).toFixed(1) + ' KB';
                    
                    if (isPlaying && audioContext) {
                        audioQueue.push(event.data);
                        processAudioQueue();
                    }
                    
                    // Visualizar
                    const view = new Float32Array(event.data);
                    updateVisualizer(view);
                    
                } else {
                    // Tentar parsear como JSON
                    try {
                        const data = JSON.parse(event.data);
                        
                        // Verificar se é mensagem de status da tela
                        if (data.type === 'screen-status') {
                            console.log('Status da tela recebido:', data);
                            updateScreenStatus(data.screenOn, data.timestamp);
                            addLog('📱 Tela ' + (data.screenOn ? '✅ LIGADA' : '❌ DESLIGADA'));
                            return;
                        }
                        
                        // Se não for status de tela, é áudio
                        packetCount++;
                        document.getElementById('packetCount').textContent = packetCount;
                        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
                        updateStatus('streaming', 'Recebendo');
                        
                        addLog('JSON: ' + JSON.stringify(data).substring(0, 100));
                        
                        if (data.audio) {
                            // Áudio em base64
                            const binaryStr = atob(data.audio);
                            const bytes = new Uint8Array(binaryStr.length);
                            for (let i = 0; i < binaryStr.length; i++) {
                                bytes[i] = binaryStr.charCodeAt(i);
                            }
                            
                            bytesReceived += bytes.length;
                            document.getElementById('bytesReceived').textContent = (bytesReceived / 1024).toFixed(1) + ' KB';
                            
                            if (isPlaying && audioContext) {
                                audioQueue.push(bytes.buffer);
                                processAudioQueue();
                            }
                        }
                    } catch (e) {
                        console.error('Erro ao processar mensagem:', e);
                        addLog('Erro: ' + e.message);
                    }
                }
            };
            
            ws.onclose = () => {
                isConnected = false;
                updateStatus('', 'Desconectado');
                document.getElementById('connectBtn').textContent = 'Conectar';
                addLog('Desconectado');
            };
            
            ws.onerror = (error) => {
                addLog('Erro: ' + error.message);
                updateStatus('', 'Erro');
            };
        }
        
        function disconnect() {
            if (ws) {
                ws.close();
            }
        }
        
        function startAudio() {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: SAMPLE_RATE
                });
                
                gainNode = audioContext.createGain();
                gainNode.connect(audioContext.destination);
                gainNode.gain.value = document.getElementById('volume').value / 100;
            }
            
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            
            isPlaying = !isPlaying;
            document.getElementById('playBtn').textContent = isPlaying ? '⏸️ Pausar Áudio' : '▶️ Iniciar Áudio';
            addLog(isPlaying ? 'Reprodução iniciada' : 'Reprodução pausada');
        }
        
        async function processAudioQueue() {
            if (isProcessing || audioQueue.length === 0) return;
            isProcessing = true;
            
            while (audioQueue.length > 0 && isPlaying) {
                const buffer = audioQueue.shift();
                await playPCMBuffer(buffer);
            }
            
            isProcessing = false;
        }
        
        async function playPCMBuffer(arrayBuffer) {
            if (!audioContext || !gainNode) return;
            
            try {
                // Converter PCM 16-bit para Float32
                const int16View = new Int16Array(arrayBuffer);
                const float32Data = new Float32Array(int16View.length);
                
                for (let i = 0; i < int16View.length; i++) {
                    float32Data[i] = int16View[i] / 32768.0;
                }
                
                // Criar AudioBuffer
                const audioBuffer = audioContext.createBuffer(CHANNELS, float32Data.length, SAMPLE_RATE);
                audioBuffer.getChannelData(0).set(float32Data);
                
                // Reproduzir
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(gainNode);
                source.start();
                
                // Aguardar duração do buffer
                const duration = float32Data.length / SAMPLE_RATE;
                await new Promise(resolve => setTimeout(resolve, duration * 900)); // 90% para evitar gaps
                
            } catch (e) {
                console.error('Erro ao reproduzir áudio:', e);
            }
        }
        
        // Volume control
        document.getElementById('volume').addEventListener('input', (e) => {
            const value = e.target.value;
            document.getElementById('volumeValue').textContent = value + '%';
            if (gainNode) {
                gainNode.gain.value = value / 100;
            }
        });
        
        // Resetar barras quando não há dados
        setInterval(() => {
            if (!isConnected) {
                bars.forEach(bar => bar.style.height = '5px');
            }
        }, 500);
    </script>
</body>
</html>
  `);
});

// WebSocket - gerenciar conexões dos browsers
wss.on("connection", (ws) => {
  console.log("🌐 Novo cliente WebSocket conectado");
  clients.add(ws);

  ws.on("close", () => {
    console.log("🔌 Cliente WebSocket desconectado");
    clients.delete(ws);
  });
});

// Broadcast dados binários para todos os clientes WebSocket
function broadcastBinary(data) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Broadcast JSON para todos os clientes WebSocket
function broadcastJSON(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Endpoint principal para receber áudio
app.post("/audio", (req, res) => {
  //  console.log("==============================");
  // console.log("📥 ÁUDIO RECEBIDO");
  // console.log(`📡 IP Origem  : ${req.ip}`);
  //  console.log(`📦 Content-Type: ${req.headers["content-type"]}`);
  // console.log(`📊 Body type  : ${typeof req.body}`);

  if (Buffer.isBuffer(req.body)) {
    // Dados binários brutos (PCM)
    // console.log(`🎵 Tamanho    : ${req.body.length} bytes`);
    //  console.log("==============================");

    // Enviar direto para os clientes como binário
    broadcastBinary(req.body);
  } else if (typeof req.body === "object") {
    // JSON com dados de áudio
    console.log(`📋 Campos     : ${Object.keys(req.body).join(", ")}`);
    console.log("==============================");

    if (req.body.audio) {
      // Se tiver campo "audio", enviar como JSON para o cliente decodificar
      broadcastJSON({ audio: req.body.audio });
    } else if (req.body.data) {
      // Outro formato comum
      broadcastJSON({ audio: req.body.data });
    } else {
      // Enviar o objeto inteiro
      broadcastJSON(req.body);
    }
  }

  res.sendStatus(200);
});

// Endpoint alternativo /noise para compatibilidade
app.post("/noise", (req, res) => {
  console.log(
    "📢 /noise recebido:",
    JSON.stringify(req.body).substring(0, 200)
  );
  broadcastJSON(req.body);
  res.sendStatus(200);
});

// Endpoint para receber estado da tela do dispositivo
app.post("/screen-status", (req, res) => {
  const screenState =
    req.body.screenOn !== undefined ? req.body.screenOn : req.body.state;
  const isScreenOn = req.body.isScreenOn === true;

  console.log(req.body);

  //   console.log("==============================");
  //   console.log("📱 ESTADO DA TELA");
  //   console.log(`📡 IP Origem  : ${req.ip}`);
  //   console.log(`⏱️  Horário    : ${new Date().toLocaleTimeString('pt-BR')}`);
  //   console.log(`🔴 Status     : ${isScreenOn ? '✅ LIGADA' : '❌ DESLIGADA'}`);
  //   console.log(`📋 Dados      : ${JSON.stringify(req.body)}`);
  //   console.log("==============================");

  // Enviar para os clientes WebSocket
  broadcastJSON({
    type: "screen-status",
    screenOn: isScreenOn,
    timestamp: new Date().toISOString(),
    rawData: req.body,
  });

  res.json({
    success: true,
    message: `Tela ${isScreenOn ? "ligada" : "desligada"}`,
    timestamp: new Date().toISOString(),
  });
});

// Endpoint GET para testar o status da tela
app.get("/screen-status", (req, res) => {
  res.json({
    endpoint: "/screen-status",
    method: "POST",
    description: "Recebe o estado da tela do dispositivo",
    example: {
      screenOn: true,
    },
    alternative: {
      state: "on",
    },
  });
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Servidor escutando em http://0.0.0.0:" + PORT);
  console.log("📱 Para o emulador Android, use: http://10.0.2.2:" + PORT);
  console.log("🌐 Abra http://localhost:" + PORT + " no browser para ouvir");
  console.log("");
  console.log("📋 Endpoints disponíveis:");
  console.log("   POST /audio - recebe dados de áudio (binário ou JSON)");
  console.log("   POST /noise - recebe nível de ruído (JSON)");
  console.log(
    "   POST /screen-status - recebe estado da tela (screenOn: true/false)"
  );
  console.log("   GET  /screen-status - exibe informações do endpoint");
});
