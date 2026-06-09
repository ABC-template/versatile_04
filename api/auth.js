// api/auth.js
/**
 * Валидация строки initData от Telegram с использованием Web Crypto API (Edge-совместимо)
 */
async function verifyTelegramInitData(initData, botToken) {
    if (!initData || !botToken) return false;
    
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return false;

    // Сортируем все ключи в алфавитном порядке (исключая сам хэш)
    const keys = Array.from(urlParams.keys()).filter(key => key !== 'hash').sort();
    const dataCheckString = keys.map(key => `${key}=${urlParams.get(key)}`).join('\n');

    const encoder = new TextEncoder();

    // Шаг 1: Вычисляем секретный ключ на основе токена бота: HMAC-SHA256("WebAppData", botToken)
    const webAppDataKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode('WebAppData'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const secretKeyBuffer = await crypto.subtle.sign(
        'HMAC',
        webAppDataKey,
        encoder.encode(botToken)
    );

    // Шаг 2: Подписываем строку данных сгенерированным секретным ключом
    const secretKey = await crypto.subtle.importKey(
        'raw',
        secretKeyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        secretKey,
        encoder.encode(dataCheckString)
    );

    // Шаг 3: Переводим полученную сигнатуру в hex-строку
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const calculatedHash = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return calculatedHash === hash;
}

export default async function handler(req) {
    // Разрешаем только POST запросы для безопасности передачи initData
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
            status: 405, headers: { 'Content-Type': 'application/json' } 
        });
    }

    try {
        const { initData } = await req.json();
        const botToken = process.env.BOT_TOKEN;
        const channelId = process.env.CHANNEL_ID;
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Важно использовать Service Role для обхода RLS при авторизации

        // 1. ПРОВЕРКА КРИПТОГРАФИЧЕСКОЙ ПОДЛИННОСТИ ЗАПРОСА
        const isValid = await verifyTelegramInitData(initData, botToken);
        if (!isValid) {
            return new Response(JSON.stringify({ error: 'Несанкционированный доступ: подделка сессии или истекший токен.' }), { 
                status: 401, headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Извлекаем параметры пользователя из проверенной строки
        const urlParams = new URLSearchParams(initData);
        const userRaw = urlParams.get('user');
        if (!userRaw) {
            return new Response(JSON.stringify({ error: 'Данные пользователя Telegram отсутствуют.' }), { 
                status: 400, headers: { 'Content-Type': 'application/json' } 
            });
        }

        const tgUser = JSON.parse(userRaw);
        const telegramId = tgUser.id;
        const username = tgUser.username || `user_${telegramId}`;
        const userLang = tgUser.language_code || 'ru';

        // 2. ПРОВЕРКА ПОДПИСКИ НА КАНАЛ В TELEGRAM
        const tgCheckUrl = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${telegramId}`;
        let isMember = false;
        let isTgAdmin = false;

        try {
            const tgRes = await fetch(tgCheckUrl);
            const tgData = await tgRes.json();
            if (tgData.ok) {
                const status = tgData.result.status;
                isMember = ['member', 'administrator', 'creator', 'owner'].includes(status);
                isTgAdmin = ['administrator', 'creator'].includes(status);
            }
        } catch (tgErr) {
            console.error('Ошибка проверки подписки в API Telegram:', tgErr.message);
            // В случае падения самого Telegram, аккуратно пропускаем дальше, доверяя статусу из бд
        }

        // 3. СИНХРОНИЗАЦИЯ И БИЗНЕС-ЛОГИКА С SUPABASE (Через REST API)
        const supabaseHeaders = {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
        };

        // Шаг А: Ищем пользователя в таблице public.users
        const selectUrl = `${supabaseUrl}/rest/v1/users?telegram_id=eq.${telegramId}`;
        const selectRes = await fetch(selectUrl, { headers: supabaseHeaders });
        const dbUsers = await selectRes.json();
        
        let finalUserRecord = null;

        // Определяем базовую роль по подписке (если пользователя нет или его роль динамическая)
        let determinedRole = 'guest';
        let determinedLimit = 0;

        if (isTgAdmin) {
            determinedRole = 'admin';
            determinedLimit = 9999;
        } else if (isMember) {
            determinedRole = 'trial';
            determinedLimit = 40; // Твой новый лимит с пагинацией
        }

        if (dbUsers && dbUsers.length > 0) {
            // Пользователь найден в базе данных
            const existingUser = dbUsers[0];
            
            // Защищаем постоянные роли (admin, premium, standard), чтобы подписка их случайно не сбросила
            if (['admin', 'premium', 'standard'].includes(existingUser.role)) {
                determinedRole = existingUser.role;
                determinedLimit = existingUser.daily_limit || determinedLimit;
            } else {
                // Если роль динамическая (trial/guest) — актуализируем её по текущему состоянию подписки
                determinedLimit = determinedRole === 'trial' ? 40 : 0;
            }

            // Обновляем запись (username, язык системы, текущую роль и лимиты)
            const updateUrl = `${supabaseUrl}/rest/v1/users?telegram_id=eq.${telegramId}`;
            const updateRes = await fetch(updateUrl, {
                method: 'PATCH',
                headers: supabaseHeaders,
                body: JSON.stringify({
                    username: username,
                    user_lang: userLang,
                    role: determinedRole,
                    daily_limit: determinedLimit,
                    updated_at: new Date().toISOString()
                })
            });

            finalUserRecord = {
                telegram_id: telegramId,
                username: username,
                role: determinedRole,
                dailyLimit: determinedLimit,
                user_lang: userLang
            };
        } else {
            // Пользователя нет в базе — регистрируем нового (INSERT)
            const insertUrl = `${supabaseUrl}/rest/v1/users`;
            await fetch(insertUrl, {
                method: 'POST',
                headers: {
                    ...supabaseHeaders,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    telegram_id: telegramId,
                    username: username,
                    user_lang: userLang,
                    role: determinedRole,
                    daily_limit: determinedLimit,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
            });

            finalUserRecord = {
                telegram_id: telegramId,
                username: username,
                role: determinedRole,
                dailyLimit: determinedLimit,
                user_lang: userLang
            };
        }

        // 4. СБОРКА ОКОНЧАТЕЛЬНОГО СТАТУСА ДЛЯ ФРОНТЕНДА
        const responseBody = {
            success: true,
            isMember: isMember,
            user: finalUserRecord,
            serverModels: {
                gemini: !!process.env.ROUTER_KEY0, // Проверяем наличие основного пула ключей OpenRouter
                deepseek: !!process.env.ROUTER_KEY0,
                gpt: true
            }
        };

        return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store, max-age=0'
            }
        });

    } catch (err) {
        console.error('Критический сбой на эндпоинте /api/auth:', err.message);
        return new Response(JSON.stringify({ error: 'Внутренняя ошибка сервера авторизации', details: err.message }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });
    }
}
