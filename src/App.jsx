import { useState } from "react";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

import { AuthOverlay } from "./components/AuthOverlay";
import { OrderForm } from "./components/OrderForm";
import { ItemSearch } from "./components/ItemSearch";
import { SelectedItemsList } from "./components/SelectedItemsList";
import { InvoiceModal } from "./components/InvoiceModal";

import { useAuth } from "./hooks/useAuth";
import { useOrder } from "./hooks/useOrder";
import { useInvoiceFlow } from "./hooks/useInvoiceFlow";
import { buyersList } from "./materialData";

function App() {
  const { authState, login, logout } = useAuth();
  const {
    orderProform,
    setOrderProform,
    updateOrderProform,
    selectedItems,
    setSelectedItems,
    addItem,
    updateQuantity,
    updatePrice,
    updateCostPrice,
    removeItem,
    validation,
    filteredBuyers,
    sortedMaterialsList,
    isFormValid,
    totalSum,
    resetOrder
  } = useOrder();

  const [ui, setUi] = useState({ openSearch: false, popover1: false, popover2: false, convertToInvoice: false });

  const {
    submission,
    invoice,
    setInvoice,
    handleSubmit,
    handleLoad,
    handleReset
  } = useInvoiceFlow({
    authState,
    orderProform,
    selectedItems,
    setOrderProform,
    setSelectedItems,
    ui,
    resetOrder
  });

  if (!authState.token) {
    return <AuthOverlay isLoading={authState.isLoading} error={authState.error} onLogin={login} />;
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Olmo Invoice</h1>
        <Button className="cursor-pointer" variant="outline" size="sm" onClick={logout}>Выйти</Button>
      </div>

      <Card className="mb-8 overflow-hidden p-0 border-none shadow-xl ring-1 ring-gray-200">
        <CardHeader className="bg-gray-50 border-b p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Label className="font-semibold">Документ:</Label>
              <Select
                value={orderProform.orderType}
                disabled={invoice.isEditing}
                onValueChange={(v) => updateOrderProform({ orderType: v })}
              >
                <SelectTrigger className="w-48 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Накладная">Накладная</SelectItem>
                  <SelectItem value="Счет на оплату">Счет на оплату</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button className="cursor-pointer" variant="outline" size="sm" onClick={() => setInvoice(prev => ({ ...prev, isOpen: true }))}>Загрузить</Button>
              <Button className="cursor-pointer" variant="outline" size="sm" onClick={handleReset}>Новый</Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <OrderForm
            orderProform={orderProform}
            updateOrderProform={updateOrderProform}
            isEditingExisting={invoice.isEditing}
            iinError={validation.iinError}
            bankAccountError={validation.bankAccountError}
            filteredBuyers={filteredBuyers}
            ui={ui}
            setUi={setUi}
            buyersList={buyersList}
          />

          <div className="flex flex-col items-center gap-4 mt-8 pt-6 border-t">
            {invoice.isEditing && orderProform.buyer === "ЗАО 'Браво Плюс'" && (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="conv"
                  checked={ui.convertToInvoice}
                  onChange={e => setUi(prev => ({ ...prev, convertToInvoice: e.target.checked }))}
                />
                <Label htmlFor="conv">Сделать накладной</Label>
              </div>
            )}

            <Button
              size="lg"
              className="w-full md:w-64 h-12 text-lg font-semibold cursor-pointer"
              onClick={handleSubmit}
              disabled={submission.isSubmitting || !isFormValid}
            >
              {submission.isSubmitting ? "Отправка..." : invoice.isEditing ? "Сохранить изменения" : "Оформить"}
            </Button>

            {submission.status && <p className="text-green-600 font-medium animate-in fade-in">{submission.status}</p>}
            {submission.downloadUrl && (
              <a href={submission.downloadUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline font-medium">
                📥 Скачать Excel
              </a>
            )}
            {submission.error && <p className="text-red-500 text-sm">{submission.error}</p>}
          </div>
        </CardContent>
      </Card>

      {orderProform.orderType === "Накладная" && (
        <>
          <ItemSearch
            open={ui.openSearch}
            setOpen={(val) => setUi(prev => ({ ...prev, openSearch: val }))}
            sortedMaterialsList={sortedMaterialsList}
            onAddItem={addItem}
          />

          <SelectedItemsList
            selectedItems={selectedItems}
            updateQuantity={updateQuantity}
            updatePrice={updatePrice}
            updateCostPrice={updateCostPrice}
            removeItem={removeItem}
            totalSum={totalSum}
          />
        </>
      )}

      <InvoiceModal
        open={invoice.isOpen}
        onOpenChange={(val) => setInvoice(prev => ({ ...prev, isOpen: val }))}
        loadProform={invoice.number}
        setLoadProform={(val) => setInvoice(prev => ({ ...prev, number: val }))}
        onLoad={handleLoad}
        isLoading={invoice.isLoading}
        error={invoice.error}
      />
    </div>
  );
}

export default App;
