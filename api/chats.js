import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const botToken = process.env.BOT_TOKEN;

// Безопасный валидатор строки инициализации Telegram
async function verifyTelegramInitData(initDataStr, token) {
    if (!initDataStr) return null;
    try {
        const params = new URLSearchParams(initDataStr);
        const hash = params.get('hash');
        if (!hash) return null;
        params.delete('hash');

        const sortedParams = Array.from(params.entries())
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join('\n');

        const encoder = new TextEncoder();
        const secretKey = await crypto.subtle.importKey(
            'raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const botKeyBuffer = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(token));
        const hmacKey = await crypto.subtle.importKey(
            'raw', botKeyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const dataSignature = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(sortedParams));
        const hexSignature = Array.from(new Uint8Array(dataSignature))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        if (hexSignature !== hash) return null;
        const userParam = params.get('user');
        return userParam ? JSON.parse(userParam) : null;
    } catch (e) {
        return null;
    }
}

export default async function handler(req) {
    if (req.method === 'OPTIONS') return new Response('OK', { status: 200 });
    if (req.method !== 'GET' && req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    try {
        let initDataStr = '';
        let histories = null;

        if (req.method === 'POST') {
            const body = await req.json();
            initDataStr = body.initData;
            histories = body.histories;
        } else if (req.method === 'GET') {
            const { searchParams } = new URL(req.url);
            initDataStr = searchParams.get('initData');
        }

        // Извлекаем и проверяем юзера
        const tgUser = await verifyTelegramInitData(initDataStr, botToken);
        const isLocalhost = req.headers.get('host')?.includes('localhost') || req.headers.get('host')?.includes('127.0.0.1');
        let userId = tgUser?.id;

        if (!userId && isLocalhost) userId = 999999; // Mock дев-режим

        if (!userId) {
            return new Response(JSON.stringify({ error: 'Сбой верификации данных сессии' }), { 
                status: 401, headers: { 'Content-Type': 'application/json' } 
            });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // --- МЕТОД GET: СКАЧИВАНИЕ ЧАТОВ ---
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('user_chats')
                .select('histories')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 означает, что строки еще нет
                return new Response(JSON.stringify({ error: error.message }), { status: 500 });
            }

            return new Response(JSON.stringify({ histories: data?.histories || {} }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- МЕТОД POST: СОХРАНЕНИЕ ЧАТОВ ---
        if (req.method === 'POST') {
            if (!histories) {
                return new Response(JSON.stringify({ error: 'Пустой объект истории' }), { status: 400 });
            }

            const { error } = await supabase
                .from('user_chats')
                .upsert({
                    user_id: userId,
                    histories: histories,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) {
                return new Response(JSON.stringify({ error: error.message }), { status: 500 });
            }

            return new Response(JSON.stringify({ success: true }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });
    }
}
