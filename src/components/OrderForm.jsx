import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function OrderForm({
    orderProform,
    updateOrderProform,
    isEditingExisting,
    iinError,
    bankAccountError,
    filteredBuyers,
    ui,
    setUi,
    buyersList
}) {
    const updateUi = (updates) => setUi(prev => ({ ...prev, ...updates }));
    return (
        <div className="grid grid-cols-1 items-end md:grid-cols-3 gap-4 mb-4">
            <div>
                <Label htmlFor="orderNumber" className="mb-2">
                    {orderProform.orderType === "Накладная"
                        ? "Номер накладной"
                        : "Номер счета на оплату"}
                </Label>
                <Input
                    id="orderNumber"
                    type="text"
                    value={orderProform.proformNumber}
                    disabled={isEditingExisting}
                    autoComplete="off"
                    onChange={(e) => updateOrderProform({ proformNumber: e.target.value })}
                />
            </div>

            {orderProform.orderType === "Накладная" ? (
                <div>
                    <Label htmlFor="orderDate" className="mb-2">Дата заказа</Label>
                    <Input
                        id="orderDate"
                        type="date"
                        value={orderProform.proformDate}
                        disabled={isEditingExisting}
                        onChange={(e) => updateOrderProform({ proformDate: e.target.value })}
                        className="block"
                    />
                </div>
            ) : (
                <>
                    <div>
                        <Label htmlFor="orderPeriodStart" className="mb-2">Период (с)</Label>
                        <Input
                            id="orderPeriodStart"
                            type="date"
                            value={orderProform.orderPeriodStart}
                            disabled={isEditingExisting}
                            onChange={(e) => updateOrderProform({ orderPeriodStart: e.target.value })}
                        />
                    </div>
                    <div>
                        <Label htmlFor="orderPeriodEnd" className="mb-2">Период (по)</Label>
                        <Input
                            id="orderPeriodEnd"
                            type="date"
                            value={orderProform.orderPeriodEnd}
                            disabled={isEditingExisting}
                            onChange={(e) => updateOrderProform({ orderPeriodEnd: e.target.value })}
                        />
                    </div>
                </>
            )}

            <div>
                <Label htmlFor="buyer" className="mb-2">Покупатель</Label>
                <Popover open={ui.popover1} onOpenChange={(val) => updateUi({ popover1: val })}>
                    <PopoverTrigger asChild>
                        <div>
                            <Input
                                id="buyer"
                                type="text"
                                value={orderProform.buyer}
                                autoComplete="off"
                                disabled={isEditingExisting}
                                onChange={(e) => {
                                    updateOrderProform({ buyer: e.target.value });
                                    updateUi({ popover1: true });
                                }}
                                onClick={() => updateUi({ popover1: true })}
                            />
                        </div>
                    </PopoverTrigger>
                    <PopoverContent className="p-4" align="start">
                        {filteredBuyers.length > 0 && (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {filteredBuyers.map((buyer) => (
                                    <div
                                        key={buyer.name}
                                        className="p-2 hover:bg-gray-100 rounded cursor-pointer"
                                        onClick={() => {
                                            updateOrderProform({
                                                buyer: buyer.name,
                                                iin: buyer.iin,
                                                bankAccount: buyer.bankAccount,
                                                bankName: buyer.bankName,
                                            });
                                            updateUi({ popover1: false });
                                        }}
                                    >
                                        <span className="text-md">{buyer.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </PopoverContent>
                </Popover>
            </div>

            <div>
                <Label htmlFor="iin" className="mb-2">ИИН</Label>
                <Input
                    id="iin"
                    type="text"
                    value={orderProform.iin}
                    maxLength={14}
                    disabled={isEditingExisting}
                    onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        updateOrderProform({ iin: value });
                    }}
                />
                {iinError && <div className="text-red-500 text-xs mt-1">{iinError}</div>}
            </div>

            <div>
                <Label htmlFor="bankAccount" className="mb-2">Р/С</Label>
                <Input
                    id="bankAccount"
                    type="text"
                    value={orderProform.bankAccount}
                    maxLength={16}
                    disabled={isEditingExisting}
                    onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        updateOrderProform({ bankAccount: value });
                    }}
                />
                {bankAccountError && <div className="text-red-500 text-xs mt-1">{bankAccountError}</div>}
            </div>

            <div>
                <Label htmlFor="bankName" className="mb-2">Название Банка</Label>
                <Input
                    id="bankName"
                    type="text"
                    value={orderProform.bankName}
                    disabled={isEditingExisting}
                    onChange={(e) => updateOrderProform({ bankName: e.target.value })}
                />
            </div>

            {orderProform.buyer.length > 0 && (
                <div>
                    <Label htmlFor="constructionName" className="mb-2">Название объекта</Label>
                    <Popover open={ui.popover2} onOpenChange={(val) => updateUi({ popover2: val })}>
                        <PopoverTrigger asChild>
                            <div>
                                <Input
                                    id="constructionName"
                                    type="text"
                                    value={orderProform.constructionName}
                                    autoComplete="off"
                                    disabled={isEditingExisting}
                                    onChange={(e) => {
                                        updateOrderProform({ constructionName: e.target.value });
                                        updateUi({ popover2: true });
                                    }}
                                    onClick={() => updateUi({ popover2: true })}
                                    placeholder="Введите название объекта"
                                />
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="p-4" align="start">
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {buyersList
                                    .find((b) => orderProform.buyer === b.name)
                                    ?.constructions?.map((construction) => (
                                        <div
                                            key={construction}
                                            className="p-2 hover:bg-gray-100 rounded cursor-pointer"
                                            onClick={() => {
                                                updateOrderProform({ constructionName: construction });
                                                updateUi({ popover2: false });
                                            }}
                                        >
                                            <span className="text-sm">{construction}</span>
                                        </div>
                                    ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            )}
        </div>
    );
}
