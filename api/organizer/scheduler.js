import { createClient } from '@supabase/supabase-js';

// Инициализация клиента Supabase
// Отключаем Realtime для совместимости с Vercel Serverless Functions
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { realtime: { enabled: false } }
);

export default async function handler(req, res) {
    // В Vercel API routes метод должен быть POST (согласно твоей логике на фронтенде)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Извлекаем тело запроса
    const { action, userId, taskText, triggerAt } = req.body;

    try {
        if (action === 'add') {
            // Вставка новой задачи
            const { data, error } = await supabase
                .from('reminders')
                .insert([{ 
                    user_id: parseInt(userId), 
                    topic_id: 'global', 
                    task_text: taskText, 
                    trigger_at: triggerAt 
                }])
                .select(); // ОБЯЗАТЕЛЬНО: получаем созданную запись обратно
            
            if (error) throw error;
            return res.status(200).json({ success: true, data });
        }

        if (action === 'get') {
            // Получение всех задач пользователя
            const { data, error } = await supabase
                .from('reminders')
                .select('*')
                .eq('user_id', parseInt(userId))
                .order('trigger_at', { ascending: true });
            
            if (error) throw error;
            return res.status(200).json({ data });
        }

        return res.status(400).json({ error: 'Unknown action' });

    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).json({ error: err.message });
    }
}
