// js/modules/scheduler.js

window.initSchedulerModule = async () => {
    const container = document.getElementById('scheduler-content');
    // Рендерим интерфейс формы и контейнера для списка
    container.innerHTML = `
        <div style="padding: 15px; color: var(--text-color);">
            <div style="margin-bottom: 15px;">
                <input type="text" id="task-text" placeholder="Название задачи..." style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 10px; border: 1px solid var(--hint-color); background: var(--bg-color); color: var(--text-color);">
                <input type="datetime-local" id="task-date" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 10px; border: 1px solid var(--hint-color); background: var(--bg-color); color: var(--text-color);">
                <button onclick="window.saveTask()" style="width: 100%; padding: 12px; background: var(--button-color); color: white; border: none; border-radius: 10px; font-weight: bold;">Добавить задачу</button>
            </div>
            <div id="tasks-list" style="border-top: 1px solid rgba(0,0,0,0.1); pt: 10px;">
                <p style="text-align: center; color: var(--hint-color);">Загрузка задач...</p>
            </div>
        </div>
    `;
    window.loadTasks();
};

window.saveTask = async () => {
    const text = document.getElementById('task-text').value;
    const date = document.getElementById('task-date').value;
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
    
    if (!text || !date) {
        alert("Заполните оба поля!");
        return;
    }

    if (!user || !user.id) {
        alert("Ошибка: Пользователь не определен");
        return;
    }

    try {
        console.log("Отправка задачи:", { text, date, userId: user.id });

        const response = await fetch('/api/organizer/scheduler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', userId: user.id, taskText: text, triggerAt: date })
        });

        // Проверяем, ответил ли сервер успехом
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Сервер ответил ошибкой ${response.status}: ${errText}`);
        }

        const result = await response.json();
        console.log("Успешно сохранено:", result);
        
        // Очищаем и обновляем список ТОЛЬКО если запрос прошел успешно
        document.getElementById('task-text').value = '';
        window.loadTasks();
        
    } catch (e) {
        console.error("Критическая ошибка сохранения:", e);
        alert("Не удалось сохранить задачу: " + e.message);
    }
};

window.loadTasks = async () => {
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (!user) return;

    const response = await fetch('/api/organizer/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', userId: user.id })
    });
    
    const tasks = await response.json();
    const list = document.getElementById('tasks-list');
    
    if (tasks.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--hint-color); margin-top: 20px;">Задач пока нет</p>';
        return;
    }

    list.innerHTML = tasks.map(t => `
        <div style="padding: 12px; border-bottom: 1px solid rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-weight: 500;">${t.task_text}</div>
                <div style="font-size: 11px; color: var(--hint-color);">${new Date(t.trigger_at).toLocaleString()}</div>
            </div>
        </div>
    `).join('');
};
