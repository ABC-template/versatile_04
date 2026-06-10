window.initSchedulerModule = async () => {
    const container = document.getElementById('scheduler-content');
    container.innerHTML = `
        <div style="padding: 10px;">
            <input type="text" id="task-text" placeholder="Что напомнить?" style="width: 100%; padding: 8px; margin-bottom: 8px; border-radius: 8px; border: 1px solid #ccc;">
            <input type="datetime-local" id="task-date" style="width: 100%; padding: 8px; margin-bottom: 8px; border-radius: 8px; border: 1px solid #ccc;">
            <button onclick="window.saveTask()" style="width: 100%; padding: 10px; background: var(--button-color); color: white; border: none; border-radius: 8px;">Добавить задачу</button>
            <div id="tasks-list" style="margin-top: 15px;">Загрузка...</div>
        </div>
    `;
    window.loadTasks();
};

window.saveTask = async () => {
    const text = document.getElementById('task-text').value;
    const date = document.getElementById('task-date').value;
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;

    await fetch('/api/organizer/scheduler', {
        method: 'POST',
        body: JSON.stringify({ action: 'add', userId, taskText: text, triggerAt: date })
    });
    window.loadTasks();
};

window.loadTasks = async () => {
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    const response = await fetch('/api/organizer/scheduler', {
        method: 'POST',
        body: JSON.stringify({ action: 'get', userId })
    });
    const tasks = await response.json();
    const list = document.getElementById('tasks-list');
    list.innerHTML = tasks.map(t => `<div style="padding: 5px; border-bottom: 1px solid #eee;">${t.task_text} (${new Date(t.trigger_at).toLocaleString()})</div>`).join('');
};
