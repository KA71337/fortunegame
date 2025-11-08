// ===== FortuneGame Server (Render-ready) =====
const http = require("http");
const WebSocket = require("ws");

// HTTP-сервер, чтобы Render "видел" приложение
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("✅ FortuneGame server is running!\n");
});

// WebSocket поверх HTTP
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("🔗 Новый игрок подключился!");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "register") {
        const name = data.name.trim();
        if (!name) {
          ws.send(JSON.stringify({ type: "error", message: "Введите имя!" }));
          return;
        }
        ws.send(JSON.stringify({ type: "registered", name, balance: 0 }));
        console.log(`✅ Зарегистрировался: ${name}`);
      }
    } catch (e) {
      console.error("Ошибка:", e);
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 FortuneGame сервер запущен на порту ${PORT}`);
});
