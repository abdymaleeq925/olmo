export function parseDate(str) {
    if (!str) return null;
    const [d, m, y] = str.split(".");
    return new Date(`${y}-${m}-${d}T03:00:00`);
}

export function parseNumber(value) {
    if (typeof value === 'number') return value;
    const cleaned = String(value || "").replace(/\s/g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

export function extractBuyerName(buyerString) {
    if (!buyerString) return null;
    const withoutPrefix = buyerString.replace("Покупатель: ", "");
    const innIndex = withoutPrefix.indexOf("ИНН");
    if (innIndex === -1) return withoutPrefix.trim();
    return withoutPrefix.substring(0, innIndex).trim();
}

export function extractConstructionName(buyerString) {
    if (!buyerString) return null;
    return buyerString.replace("Объект: ", "").trim();
}

export function translateGoogleError(errorMessage) {
    if (!errorMessage) return "Неизвестная ошибка";

    let cleanMessage = errorMessage;
    try {
        if (errorMessage.startsWith("{")) {
            const parsed = JSON.parse(errorMessage);
            cleanMessage = parsed.error?.message || parsed.message || errorMessage;
        }
    } catch (e) {
        cleanMessage = errorMessage;
    }

    const errorTranslations = {
        invalid_grant: "Сессия истекла. Пожалуйста, войдите в аккаунт снова.",
        permission_denied: "Доступ запрещен. Убедитесь, что у вас есть права на редактирование этой таблицы.",
        notfound: "Запрашиваемый ресурс (файл или лист) не найден.",
        rateLimitExceeded: "Слишком много запросов. Подождите немного.",
        access_denied: "Вы отменили авторизацию или доступ ограничен.",
        UNAUTHENTICATED: "Ошибка авторизации. Проверьте логин.",
        RESOURCE_EXHAUSTED: "Превышен лимит запросов. Подождите пару минут."

    };

    for (const [key, translation] of Object.entries(errorTranslations)) {
        if (cleanMessage.toLowerCase().includes(key.toLowerCase())) {
            return translation;
        }
    }

    return cleanMessage;
}

export function validateForm(form, items) {
    const requiredFields = ['orderType', 'buyer', 'constructionName'];
    const hasFields = requiredFields.every(field => !!form[field]);
    const hasItems = items.length > 0 && items.every(item => item.quantity > 0);

    return hasFields && hasItems;
}
