export const config = { runtime: 'edge' };
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    const { action, userId, taskText, triggerAt } = req.body;

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        if (action === 'add') {
            // ВАЖНО: приводим userId к числу, так как в базе int8
            const { data, error } = await supabase
                .from('reminders')
                .insert([{ 
                    user_id: parseInt(userId), 
                    topic_id: 'global', 
                    task_text: taskText, 
                    trigger_at: triggerAt 
                }]);
            
            if (error) {
                console.error("DEBUG: Supabase INSERT Error:", JSON.stringify(error, null, 2));
                return res.status(400).json({ error: error.message, details: error.details });
            }
            return res.status(200).json({ data });
        }
        // ... остальной код
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
