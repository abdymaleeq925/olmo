import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { convert as convertNumberToWordsRu } from "number-to-words-ru";

export function SelectedItemsList({
    selectedItems,
    updateQuantity,
    updatePrice,
    updateCostPrice,
    removeItem,
    totalSum
}) {
    return (
        <Card className="mb-6 w-full border-none shadow-none">
            <CardHeader className="px-0">
                <CardTitle>Выбранные товары</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
                {selectedItems.length === 0 ? (
                    <p className="text-gray-500 italic">Нет выбранных товаров</p>
                ) : (
                    <div className="space-y-4">
                        {selectedItems.map((item) => (
                            <div
                                key={item.id}
                                className="flex flex-col justify-between items-start md:flex-row md:items-center border-b pb-4 gap-4"
                            >
                                <div className="flex-1">
                                    <h3 className="font-semibold text-gray-800">{item.name}</h3>
                                    <p className="text-sm text-gray-500">
                                        {item.name !== "Доставка" ? (
                                            <>
                                                {item.price ? Number(item.price) : 0} сом × {item.quantity} {item.measure} =
                                                <span className="font-bold text-gray-900 ml-1">
                                                    {(Number(item.price || 0) * Number(item.quantity || 0)).toLocaleString()} сом
                                                </span>
                                            </>
                                        ) : (
                                            <span className="font-bold text-gray-900">
                                                {Number(item.price || 0).toLocaleString()} сом
                                            </span>
                                        )}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-end gap-3 w-full md:w-auto">
                                    <div className="flex flex-col w-20">
                                        <Label className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Кол-во</Label>
                                        <Input
                                            type="number"
                                            className="h-9 text-center"
                                            value={item.quantity}
                                            onChange={(e) => updateQuantity(item.id, e.target.value)}
                                        />
                                    </div>

                                    <div className="flex flex-col w-24">
                                        <Label className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Цена</Label>
                                        <Input
                                            type="number"
                                            className="h-9 text-center"
                                            value={item.price}
                                            onChange={(e) => updatePrice(item.id, e.target.value)}
                                        />
                                    </div>

                                    {item.name !== "Доставка" && (
                                        <div className="flex flex-col w-24">
                                            <Label className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Себест.</Label>
                                            <Input
                                                type="number"
                                                className="h-9 text-center"
                                                value={item.costPrice}
                                                onChange={(e) => updateCostPrice(item.id, e.target.value)}
                                            />
                                        </div>
                                    )}

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => removeItem(item.id)}
                                    >
                                        Удалить
                                    </Button>
                                </div>
                            </div>
                        ))}

                        <div className="text-right pt-6">
                            <div className="text-sm text-gray-500 mb-1">Общая сумма:</div>
                            <div className="text-2xl font-bold text-gray-900">
                                {totalSum.toLocaleString()} сом
                            </div>
                            <div className="text-xs text-gray-400 mt-1 max-w-md ml-auto">
                                {convertNumberToWordsRu(Math.round(totalSum), {
                                    currency: {
                                        currencyNameCases: ["сом", "сома", "сом"],
                                        fractionalPartNameCases: ["тыйын", "тыйын", "тыйын"],
                                    },
                                    showNumberParts: { integer: true, fractional: false },
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
