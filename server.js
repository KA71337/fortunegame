const http = require('http');
const WebSocket = require('ws');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const users = {}; 
// users[key] = { name, balance, history: [] }
// key = имя в нижнем регистре

let round = {
  players: [],   // { key, name, bet, color }
  status: 'collecting', // collecting | waitingOwner | spinning | finished
  winner: null
};

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function keyFromName(name) {
  return normalizeName(name).toLowerCase();
}

function broadcast(obj) {
  const data = JSON.stringify(obj);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

function sendState() {
  broadcast({
    type: 'state',
    users,
    round
  });
}

wss.on('connection', (ws) => {
  ws.userKey = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // === Регистрация / вход ===
    if (msg.type === 'register') {
      const nameNorm = normalizeName(msg.username);
      if (!nameNorm) {
        ws.send(JSON.stringify({ type: 'error', message: 'Введите имя' }));
        return;
      }

      const key = keyFromName(nameNorm);

      // Если этого имени ещё нет — создаём нового пользователя
      if (!users[key]) {
        users[key] = {
          name: nameNorm,
          balance: 0,
          history: []
        };
      }

      ws.userKey = key;

      ws.send(JSON.stringify({
        type: 'register_success',
        username: users[key].name
      }));
      return;
    }

    // === Подключение к игре (страница fortune.html) ===
    if (msg.type === 'join') {
      const key = keyFromName(msg.username);
      if (!users[key]) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Пользователь не найден. Зайдите заново.'
        }));
        return;
      }

      ws.userKey = key;

      ws.send(JSON.stringify({
        type: 'joined',
        you: users[key]
      }));

      ws.send(JSON.stringify({
        type: 'state',
        users,
        round
      }));

      return;
    }

    // Дальше — только для авторизованных
    if (!ws.userKey || !users[ws.userKey]) {
      ws.send(JSON.stringify({ type: 'error', message: 'Вы не авторизованы' }));
      return;
    }

    const user = users[ws.userKey];
    const isOwner = keyFromName(user.name) === 'owner';

    switch (msg.type) {

      // === СТАВКА ===
      case 'place_bet': {
        const amount = Number(msg.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          ws.send(JSON.stringify({ type: 'error', message: 'Неверная сумма' }));
          return;
        }

        if (user.balance < amount) {
          ws.send(JSON.stringify({ type: 'error', message: 'Недостаточно средств' }));
          return;
        }

        if (round.status === 'spinning') {
          ws.send(JSON.stringify({ type: 'error', message: 'Игра уже идёт' }));
          return;
        }

        if (round.status === 'finished') {
          round = { players: [], status: 'collecting', winner: null };
        }

        // Списываем средства
        user.balance = +(user.balance - amount).toFixed(2);

        // Удаляем старую ставку игрока (если была)
        round.players = round.players.filter(p => p.key !== ws.userKey);

        const colors = [
          '#ff7043', '#29b6f6', '#66bb6a', '#ab47bc',
          '#ffa000', '#26a69a', '#ec407a', '#8d6e63'
        ];
        const color = colors[round.players.length % colors.length];

        round.players.push({
          key: ws.userKey,
          name: user.name,
          bet: amount,
          color
        });

        round.status = round.players.length >= 2 ? 'waitingOwner' : 'collecting';

        sendState();
        break;
      }

      // === OWNER: пополнить / вычесть ===
      case 'admin_add':
      case 'admin_sub': {
        if (!isOwner) {
          ws.send(JSON.stringify({ type: 'error', message: 'Только OWNER' }));
          return;
        }

        const targetName = normalizeName(msg.target);
        const key = keyFromName(targetName);
        const amount = Number(msg.amount);

        if (!users[key]) {
          ws.send(JSON.stringify({ type: 'error', message: 'Игрок не найден' }));
          return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
          ws.send(JSON.stringify({ type: 'error', message: 'Неверная сумма' }));
          return;
        }

        const u = users[key];

        if (msg.type === 'admin_add') {
          u.balance = +(u.balance + amount).toFixed(2);
          (u.history ||= []).push(`+${amount.toFixed(2)} AZN (OWNER)`);
        } else {
          const real = Math.min(amount, u.balance);
          u.balance = +(u.balance - real).toFixed(2);
          (u.history ||= []).push(`-${real.toFixed(2)} AZN (OWNER)`);
        }

        sendState();
        break;
      }

      // === OWNER: старт игры ===
      case 'start_game': {
        if (!isOwner) {
          ws.send(JSON.stringify({ type: 'error', message: 'Только OWNER может начать игру' }));
          return;
        }

        if (round.players.length < 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Нужно минимум 2 игрока' }));
          return;
        }

        if (round.status !== 'waitingOwner') {
          ws.send(JSON.stringify({ type: 'error', message: 'Сначала соберите ставки' }));
          return;
        }

        round.status = 'spinning';
        broadcast({ type: 'round_spinning', round });

        const totalPot = round.players.reduce((s, p) => s + p.bet, 0);
        const winnerIndex = Math.floor(Math.random() * round.players.length);
        const winner = round.players[winnerIndex];

        const winUser = users[winner.key];
        if (winUser) {
          winUser.balance = +(winUser.balance + totalPot).toFixed(2);
          (winUser.history ||= []).push(`Победа +${totalPot.toFixed(2)} AZN`);
        }

        round.status = 'finished';
        round.winner = {
          name: winner.name,
          prize: totalPot,
          winnerIndex
        };

        // Отправляем результат (для анимации на клиенте есть winnerIndex)
        broadcast({
          type: 'game_result',
          round,
          users
        });

        // Готовим новый раунд
        round = { players: [], status: 'collecting', winner: null };
        sendState();
        break;
      }

      // === Запрос актуального состояния ===
      case 'request_state': {
        ws.send(JSON.stringify({ type: 'state', users, round }));
        break;
      }
    }
  });
});

const PORT = 8080;
server.listen(PORT, () => {
  console.log('FortuneGame server running on port', PORT);
});
