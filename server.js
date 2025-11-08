// ===== FortuneGame Server (для Render + Netlify) =====

// Импортируем зависимости
const http = require("http");
const WebSocket = require("ws");

// Создаём HTTP-сервер (Render требует, чтобы он что-то отвечал)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("✅ FortuneGame server is running!\n");
});

// Создаём WebSocket-сервер на базе HTTP
const wss = new WebSocket.Server({ server });

// Хранилище игроков и их балансов
let users = {}; // { name: { balance: number, ws: WebSocket } }

// Обработка новых подключений
wss.on("connection", (ws) => {
  console.log("🔗 Новый игрок подключился!");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // === Регистрация ===
      if (data.type === "register") {
        const name = data.name.trim();

        // Проверяем, не занято ли имя
        if (users[name]) {
          ws.send(JSON.stringify({ type: "error", message: "Имя уже занято!" }));
          return;
        }

        // Сохраняем пользователя
        users[name] = { balance: 0, ws };
        ws.playerName = name;

        console.log(`✅ Игрок зарегистрировался: ${name}`);
        ws.send(JSON.stringify({ type: "registered", name, balance: 0 }));
      }

      // === Запрос баланса ===
      if (data.type === "getBalance") {
        const user = users[ws.playerName];
        if (user) {
          ws.send(JSON.stringify({ type: "balance", balance: user.balance }));
        }
      }

      // === Пополнение (только OWNER) ===
      if (data.type === "addBalance" && ws.playerName === "OWNER") {
        const { target, amount } = data;
        if (users[target]) {
          users[target].balance += Number(amount);
          users[target].ws.send(
            JSON.stringify({ type: "balance", balance: users[target].balance })
          );
          ws.send(JSON.stringify({ type: "success", message: `Баланс ${target} пополнен на ${amount}` }));
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Игрок не найден" }));
        }
      }

      // === Вычитание (только OWNER) ===
      if (data.type === "removeBalance" && ws.playerName === "OWNER") {
        const { target, amount } = data;
        if (users[target]) {
          users[target].balance -= Number(amount);
          if (users[target].balance < 0) users[target].balance = 0;
          users[target].ws.send(
            JSON.stringify({ type: "balance", balance: users[target].balance })
          );
          ws.send(JSON.stringify({ type: "success", message: `С ${target} снято ${amount}` }));
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Игрок не найден" }));
        }
      }
    } catch (err) {
      console.error("❌ Ошибка обработки сообщения:", err);
    }
  });

  ws.on("close", () => {
    if (ws.playerName && users[ws.playerName]) {
      console.log(`❌ ${ws.playerName} отключился`);
      delete users[ws.playerName];
    }
  });
});

// ===== Запуск сервера =====
const PORT = process.env.PORT || 8080;

// 0.0.0.0 нужно для Render, чтобы порт был виден извне
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 FortuneGame сервер запущен на порту ${PORT}`);
});
