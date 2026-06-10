export const config = { runtime: 'edge' };
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req) {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    
    const { action, userId, taskText, triggerAt } = await req.json();

    if (action === 'add') {
        const { data, error } = await supabase
            .from('reminders')
            .insert([{ user_id: userId, topic_id: 'global', task_text: taskText, trigger_at: triggerAt }]);
        
        return new Response(JSON.stringify({ data, error }), { status: 200 });
    }

    if (action === 'get') {
        const { data } = await supabase
            .from('reminders')
            .select('*')
            .eq('user_id', userId)
            .order('trigger_at', { ascending: true });
        return new Response(JSON.stringify(data), { status: 200 });
    }
}
