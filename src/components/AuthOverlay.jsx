
import { Button as UiButton } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function AuthOverlay({ isLoading, error, onLogin }) {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen">
                <Loader2 className="h-10 w-10 animate-spin mb-4" />
                <p className="text-lg">Авторизация...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="max-w-xl w-full bg-white p-8 rounded-xl shadow-lg text-center">
                <h1 className="text-3xl font-bold mb-6">Система оформления Накладных и Счетов на оплату</h1>
                <p className="text-gray-600 mb-8">
                    Войдите через Google для дальнейшей работы
                </p>

                {error && (
                    <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <UiButton
                    size="lg"
                    className="w-full cursor-pointer h-12 text-lg"
                    onClick={onLogin}
                >
                    Войти через Google
                </UiButton>

                <p className="mt-6 text-xs text-gray-400">
                    Для работы требуются права на редактирование Google Таблиц
                </p>
            </div>
        </div>
    );
}
