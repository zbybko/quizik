# 2. Cloudflare D1 для пользователей и usage-счётчиков

**Статус:** Принято (задокументировано задним числом; см. PR #4 и
`backend/migrations/0001_init.sql`).

## Контекст

Backend — Cloudflare Worker (см. [0003](0003-stripe-for-billing.md) про
контекст выбора биллинга в том же окружении). Нужно хранить:
- `users`: `id` (Clerk user_id), `email`, `plan` (`free`/`pro`),
  `stripe_customer_id`;
- `usage` / `anon_usage`: дневные счётчики запросов по `user_id`/`device_id` —
  простые upsert-инкременты вида `INSERT ... ON CONFLICT DO UPDATE SET
  count = count + 1`.

Раз бэкенд уже на Cloudflare Workers, инфраструктурно логично остаться в
экосистеме Cloudflare, а не поднимать отдельную БД с отдельным сетевым
маршрутом и биллингом.

## Рассмотренные варианты

1. **Cloudflare KV** — уже используется в проекте для rate-limit bucket'ов
   (`RATELIMIT_KV`). Простой key-value, eventually consistent.
   Минус: паттерн "прочитать count → инкрементировать → записать" на KV не
   атомарен и на конкурентных запросах теряет инкременты — для дневных
   лимитов подписки это неприемлемо (пользователь мог бы обойти лимит).
2. **Внешняя Postgres** (Supabase/Neon/etc). Полноценный SQL, привычнее
   Vue/Node-разработчику.
   Минус: лишний сетевой хоп из Worker isolate до внешней БД на каждый
   запрос (Worker'ы физически ближе к D1, который живёт в той же
   Cloudflare-сети), плюс отдельный вендор и его pricing/лимиты.
3. **Cloudflare D1** (SQLite на грани сети Cloudflare) — выбрано.
   `ON CONFLICT DO UPDATE` даёт атомарный upsert для счётчиков, схема
   тривиальная (3 таблицы, см. `0001_init.sql`), нет сетевого хопа наружу
   Cloudflare.

## Решение

D1 как единственное персистентное хранилище бэкенда: таблицы `users`,
`usage`, `anon_usage`. KV остаётся только для rate-limit bucket'ов (не
критичных к точности — читай `RATE_LIMIT_*` в `backend/src/index.ts`).

Для аналогии: это как выбрать SQLite поверх localStorage/IndexedDB в
браузерном приложении — оба edge-native для своей среды, но D1 даёт реальные
SQL-гарантии (транзакционность, constraints), которых KV как key-value стору
не хватает.

## Последствия

- Два dev/prod окружения — раздельные D1-базы (`quizik-db-dev` /
  `quizik-db`), настроены в `backend/wrangler.jsonc` per environment.
- Миграции — обычные `.sql`-файлы в `backend/migrations/`, накатываются
  через `wrangler d1 migrations apply`.
- D1 — относительно новый продукт Cloudflare (SQLite-based, не
  full Postgres) — часть advanced SQL-фич недоступна; для текущей схемы
  (upsert + point lookup по PK) этого достаточно.
