// ===== FortuneGame Server =====

// Импортируем зависимости
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

// Создаём HTTP-сервер (чтобы Render видел, что сервер жив)
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    // Простой ответ при заходе на сайт
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>✅ FortuneGame сервер работает!</h2>");
  } else {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

// Создаём WebSocket-сервер
const wss = new WebSocket.Server({ server });

// Хранилище игроков и балансов
let users = {}; // { name: { balance: number, ws: WebSocket } }

// Обработка подключений
wss.on("connection", (ws) => {
  console.log("🔗 Новый игрок подключился!");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      // === Регистрация пользователя ===
      if (data.type === "register") {
        const name = data.name.trim();

        // Проверяем, занято ли имя
        if (users[name]) {
          ws.send(JSON.stringify({ type: "error", message: "Имя уже занято!" }));
          return;
        }

        users[name] = { balance: 0, ws };
        ws.playerName = name;

        console.log(`✅ Зарегистрировался ${name}`);
        ws.send(JSON.stringify({ type: "registered", name, balance: 0 }));
      }

      // === Запрос баланса ===
      if (data.type === "getBalance") {
        const user = users[ws.playerName];
        if (user) {
          ws.send(JSON.stringify({ type: "balance", balance: user.balance }));
        }
      }

      // === Пополнение (только владелец OWNER) ===
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

// Запускаем сервер
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 FortuneGame сервер запущен на порту ${PORT}`);
});
