// api/organizer/scheduler.js
export const config = { runtime: 'edge' };

export default async function handler(req, res) {
  const { action, userId, taskText, triggerAt } = await req.json();
  
  // Здесь будет логика работы с Supabase (таблица reminders)
  // Мы используем Service Role Key для записи
  // ... (реализацию напишем, когда утвердим интерфейс)
}
