-- Таблица рекордов «Пути джуна». Разворачивается один раз:
--   npx wrangler d1 create junior-way-board
--   npx wrangler d1 execute junior-way-board --remote --file worker/schema.sql
--
-- Одна таблица забегов на всё: и недельный топ, и топ задачи дня.
-- Ничего не удаляется - «недельный сброс» это просто другой bucket,
-- а прошлые недели остаются архивом бесплатно.
CREATE TABLE IF NOT EXISTS runs (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Кто играл: "tg:<хеш id>" или "wa:<хеш id>". Хеш с солью, потому что
  -- сырой id пользователя хранить незачем: для таблицы он не нужен.
  who     TEXT    NOT NULL,
  -- Как показывать. Имя из Telegram или ник из workaem; в анонимном
  -- режиме - «Джун #1a2b».
  name    TEXT    NOT NULL,
  -- Откуда пришла личность: tg или wa. Гости сюда не попадают вовсе.
  source  TEXT    NOT NULL,
  -- career - карьера с первого уровня, daily - задача дня.
  mode    TEXT    NOT NULL,
  -- Ключ таблицы: "2026-W37" для карьеры, "2026-09-09" для задачи дня.
  bucket  TEXT    NOT NULL,
  score   INTEGER NOT NULL,
  skills  INTEGER NOT NULL,
  levels  INTEGER NOT NULL,
  deaths  INTEGER NOT NULL,
  combo   INTEGER NOT NULL,
  frames  INTEGER NOT NULL,
  at      INTEGER NOT NULL
);

-- Под запрос топа: где ищем и по чему сортируем.
CREATE INDEX IF NOT EXISTS runs_board ON runs (mode, bucket, score DESC);
-- Под рейт-лимит и личную историю.
CREATE INDEX IF NOT EXISTS runs_who ON runs (who, at DESC);

-- Общие счётчики: то, что показывается всем и не портится накруткой
-- одного результата.
CREATE TABLE IF NOT EXISTS totals (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
