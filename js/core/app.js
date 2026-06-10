async function initApp() {
    const root = document.documentElement;

    // =========================================================================
    // 🛠️ [DEV MODE] БЛОК АВТОПОДБРОСА ДЛЯ ЛОКАЛЬНОЙ РАЗРАБОТКИ (LOCALHOST)
    // =========================================================================
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
        if (!window.Telegram) window.Telegram = {};
        if (!window.Telegram.WebApp) window.Telegram.WebApp = {};
        
        const tgMock = window.Telegram.WebApp;

        // Имитируем сырую строку initData для будущих проверок валидности
        if (!tgMock.initData) {
            tgMock.initData = "query_id=MOCK_DEV_QA&user=%7B%22id%22%3A999999%2C%22first_name%22%3A%22%D0%94%D0%B5%D0%B2%22%2C%22last_name%22%3A%22%D0%A2%D0%B5%D1%81%D1%82%D0%B5%D1%80%22%2C%22username%22%3A%22dev_tester%22%2C%22language_code%22%3A%22ru%22%7D&auth_date=1710000000&hash=mock_hash_for_local_testing";
        }

        // Имитируем объект раскрытых данных пользователя
        if (!tgMock.initDataUnsafe || !tgMock.initDataUnsafe.user) {
            tgMock.initDataUnsafe = {
                user: {
                    id: 999999,
                    first_name: "👨‍💻 Dev",
                    last_name: "Tester",
                    username: "dev_tester",
                    language_code: "ru",
                    photo_url: "https://gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                }
            };
        }

        if (!tgMock.platform) tgMock.platform = 'ios';

        // Эмулируем CloudStorage через localStorage, чтобы методы getItems/setItem не падали локально
        if (!tgMock.CloudStorage) {
            tgMock.CloudStorage = {
                getItems: (keys, callback) => {
                    const res = {};
                    keys.forEach(k => { res[k] = localStorage.getItem(`tg_mock_cloud_${k}`); });
                    if (callback) callback(null, res);
                },
                setItem: (key, value, callback) => {
                    localStorage.setItem(`tg_mock_cloud_${key}`, value);
                    if (callback) callback(null, true);
                }
            };
        }
        console.warn("⚠️ [Dev Mode]: Разработка на localhost. Подброшены mock-данные пользователя (ID: 999999)");
    }
    // =========================================================================

    const tg = window.Telegram?.WebApp;
    if (tg) {
        try { tg.ready(); tg.expand(); tg.setHeaderColor('bg_color'); } catch (e) { console.error("Ошибка активации Telegram SDK:", e); }
    }

    // Функция отвечает строго за верхнюю планку хедера (Safe Area)
    function setTelegramInsets() {
        try {
            if (!tg) { root.style.setProperty('--tg-content-safe-area-top', '0px'); root.style.setProperty('--tg-safe-bottom', '0px'); return; }
            const initDataStr = tg?.initData || "";
            const isMiniApp = !!(initDataStr && initDataStr.length > 0);
            const isMobilePlatform = tg?.platform === 'ios' || tg?.platform === 'android';
            let topInset = 0;
            if (isMiniApp && isMobilePlatform) {
                topInset = tg?.contentSafeAreaInset?.top || tg?.safeAreaInset?.top || 0;
                if (topInset < 50) topInset = 60; 
            } else { topInset = 0; }
            const bottomInset = isMiniApp ? (tg?.safeAreaInset?.bottom || 0) : 0;
            root.style.setProperty('--tg-content-safe-area-top', `${topInset}px`);
            root.style.setProperty('--tg-safe-bottom', `${bottomInset}px`);
        } catch (err) {
            console.error("Сбой расчета безопасных зон:", err);
            root.style.setProperty('--tg-content-safe-area-top', '0px'); root.style.setProperty('--tg-safe-bottom', '0px');
        }
    }

    // Мягкая инициализация отступов шапки
    setTelegramInsets();
    setTimeout(() => { setTelegramInsets(); }, 150);
    setTimeout(() => { setTelegramInsets(); }, 450);
    setTimeout(() => { setTelegramInsets(); }, 900);

    // СЛУШАТЕЛЬ СИСТЕМНОЙ КНОПКИ НАЗАД (БЕЗ КОНФЛИКТОВ С КЛАВИАТУРОЙ)
    if (tg) {
        try {
            tg.onEvent('backButtonClicked', () => { 
                if (typeof setTelegramInsets === 'function') setTelegramInsets(); 
            });
        } catch (e) { 
            console.error("Ошибка привязки кнопки Назад:", e); 
        }
    }

    const user = tg?.initDataUnsafe?.user;
    if (user) {
        const avatarUrl = user.photo_url || 'https://gravatar.com';
        document.getElementById('user-avatar').src = avatarUrl;
        document.getElementById('card-avatar').src = avatarUrl;
        document.getElementById('user-name').innerText = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    }

    const uid = user?.id;
    if (!uid) { 
        document.getElementById('limit-info').innerText = "Ошибка: ID не найден"; 
        if (typeof window.showGuest === 'function') {
            window.showGuest({ 
                msg: "Среда не распознана", 
                joke: "Пожалуйста, откройте мини-приложение внутри Telegram." 
            });
        }
        return; 
    }
    
    if (typeof window.loadLocalHistories === 'function') window.loadLocalHistories();

    if (tg?.CloudStorage) {
        tg.CloudStorage.getItems(['ai_user_keys', 'usage_data'], async (err, values) => {
            try { window.allUserKeys = JSON.parse(values?.ai_user_keys || '{}'); } catch(e) { window.allUserKeys = {}; }
            const today = new Date().toLocaleDateString();
            const usage = JSON.parse(values?.usage_data || '{}');
            window.usedToday = (usage.date === today) ? (usage.count || 0) : 0;
            if (typeof window.checkSubscriptionAndLoad === 'function') await window.checkSubscriptionAndLoad(uid);
        });
    } else {
        if (typeof window.checkSubscriptionAndLoad === 'function') await window.checkSubscriptionAndLoad(uid);
    }
}
// =========================================================================
// 🚀 ЗАПУСК ПРИЛОЖЕНИЯ
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});
