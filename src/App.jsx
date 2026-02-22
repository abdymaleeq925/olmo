import { useState, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { convert as convertNumberToWordsRu } from "number-to-words-ru";
import { useDebounce } from "use-debounce";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "./components/ui/select";

import { loadInvoice, refreshToken, submitOrder, validateForm, translateGoogleError } from "./utils";
import { buyersList, materialData, sortMaterials } from "./materialData";
import { Loader2 } from "lucide-react";

function App() {

  const [token, setToken] = useState(null);
  const [orderProform, setOrderProform] = useState({
    orderType: "Накладная",
    orderPeriodStart: "",
    orderPeriodEnd: "",
    proformNumber: "",
    proformDate: "",
    buyer: "",
    constructionName: "",
    iin: "",
    bankAccount: "",
    bankName: "",
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [open, setOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const [error, setError] = useState(null);
  const [iinError, setIinError] = useState(null);
  const [bankAccountError, setBankAccountError] = useState(null);
  
  const [debouncedIin] = useDebounce(orderProform.iin, 1000);
  const [debouncedBankAccount] = useDebounce(orderProform.bankAccount, 1000);

  const [modalOpen, setModalOpen] = useState(false);
  const [loadProform, setLoadProform] = useState("");

  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isPopoverOpen2, setIsPopoverOpen2] = useState(false);

  const [filteredBuyers, setFilteredBuyers] = useState(buyersList);
  const [convertToInvoice, setConvertToInvoice] = useState(false);

  const sortedData = sortMaterials(materialData);
  const isValid = validateForm(orderProform, orderProform.orderType, iinError, bankAccountError);
  console.log("sortedData", sortedData);

  useEffect(() => {
    const cachedToken = localStorage.getItem("google_access_token");
    const cachedTime = localStorage.getItem("google_token_expiry");
    if (cachedToken && cachedTime) {
      const now = Date.now();
      const tokenTime = parseInt(cachedTime, 10);
      if (now - tokenTime < 43200000) {
        setToken(cachedToken);
      } else {
        localStorage.removeItem("google_access_token");
        localStorage.removeItem("google_token_expiry");
      }
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const accessToken = localStorage.getItem("google_access_token");
      const expiryTime = localStorage.getItem("google_token_expiry");

      if (!accessToken || !expiryTime) {
        handleLogout();
        return;
      }

      const isExpiring = parseInt(expiryTime, 10) - Date.now() < 5 * 60 * 1000;
      if (isExpiring) {
        await refreshToken();
      } else {
        setToken(accessToken);
      }
    };

    checkAuth();
    const interval = setInterval(checkAuth, 60 * 1000); // Каждую минуту
    return () => clearInterval(interval);
  }, []);

  const login = useGoogleLogin({
    clientId: import.meta.env.VITE_CLIENT_ID,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    onSuccess: async (codeResponse) => {
      try {
        setIsLoading(true);

        const tokenResponse = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              code: codeResponse.code,
              client_id: import.meta.env.VITE_CLIENT_ID,
              client_secret: import.meta.env.VITE_CLIENT_SECRET,
              redirect_uri: window.location.origin,
              grant_type: "authorization_code",
            }),
          }
        );

        const tokens = await tokenResponse.json();
        if (!tokenResponse.ok) {
          const errorMsg = translateGoogleError(tokens.error || "Ошибка получения токенов");
          throw new Error(errorMsg);
        }

        localStorage.setItem("google_access_token", tokens.access_token);
        localStorage.setItem(
          "google_refresh_token",
          tokens.refresh_token || ""
        );
        localStorage.setItem(
          "google_token_expiry",
          (Date.now() + tokens.expires_in * 1000).toString()
        );

        setToken(tokens.access_token);
        setError(null);
      } catch (error) {
        const errorMsg = translateGoogleError(error.message || "Ошибка авторизации");
        setError(errorMsg);
        console.error("Auth error:", error);
        handleLogout();
      } finally {
        setIsLoading(false);
      }
    },
    onError: (errorResponse) => {
      const errorMsg = translateGoogleError(errorResponse.error || "Неизвестная ошибка");
      setError(errorMsg);
      setIsLoading(false);
    },
    flow: "auth-code",
  });

  const handleLogin = () => {
    setIsLoading(true);
    setError(null);
    login();
  };

  const handleLogout = () => {
    setError(null);
    setToken(null);
    localStorage.removeItem("google_access_token");
    localStorage.removeItem("google_refresh_token");
    localStorage.removeItem("google_token_expiry");
  };

  const addItem = (item) => {
    const existingItem = selectedItems.find((i) => i.id === item.id);
    if (existingItem) {
      setSelectedItems(
        selectedItems.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setSelectedItems([...selectedItems, { ...item, quantity: 1 }]);
    }
  };

  const updateQuantity = (id, quantity) => {
    setSelectedItems(
      selectedItems.map((item) =>
        item.id === id ? { ...item, quantity: quantity } : item
      )
    );
  };

  const removeItem = (id) => {
    setSelectedItems(selectedItems.filter((item) => item.id !== id));
  };

  const totalSum = selectedItems.reduce((sum, item) => {
    return (
      sum +
      (item.name !== "Доставка"
        ? Number(item.price) * Number(item.quantity)
        : Number(item.price)) || 0
    );
  }, 0);

  const resetForm = () => {
    setOrderProform({
      orderType: "Накладная",
      proformNumber: "",
      proformDate: "",
      orderPeriodStart: "",
      orderPeriodEnd: "",
      buyer: "",
      constructionName: "",
      iin: "",
      bankAccount: "",
      bankName: "",
    });

    setSelectedItems([]);
    setError(null);
    setSubmissionStatus(null);
    setDownloadUrl(null);
    setIinError(null);
    setBankAccountError(null);
    setIsEditingExisting(false);
  };

  useEffect(() => {
    if (debouncedIin) {
      setIinError(/^\d{14}$/.test(debouncedIin) ? null : "ИИН — ровно 14 цифр");
    }
  }, [debouncedIin]);

  useEffect(() => {
    if (debouncedBankAccount) {
      setBankAccountError(/^\d{16}$/.test(debouncedBankAccount) ? null : "Р/с — ровно 16 цифр");
    }
  }, [debouncedBankAccount]);

  useEffect(() => {
    if (orderProform.buyer.length > 0) {
      const filtered = buyersList.filter((buyer) =>
        buyer.name.toLowerCase().includes(orderProform.buyer.toLowerCase())
      );
      setFilteredBuyers(filtered);
    } else {
      setFilteredBuyers(buyersList);
    }
  }, [orderProform.buyer]);

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await submitOrder(token, orderProform, selectedItems, setError, setIsSubmitting, setSubmissionStatus, setDownloadUrl, isEditingExisting, convertToInvoice);
    } catch (err) {
      console.error("Ошибка в handleSubmit:", err);
      const errorMsg = translateGoogleError(err.message);
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
      setIsLoading(false);
    }

  }

  const handleLoadProform = async () => {
    setConvertToInvoice(false);
    await loadInvoice(token, loadProform, setOrderProform, setSelectedItems, setError, setModalOpen, setIsLoadingInvoice, setIsEditingExisting);
  }

  return (
    <>
      {token ? (
        <div className="container mx-auto py-6 flex flex-col items-center">
          <div className="w-full flex justify-end mb-3">
            <Button variant="outline" className="cursor-pointer" onClick={handleLogout}>Выйти</Button>
          </div>
          <Card className="flex justify-between w-full lg:w-3/4 xl:w-1/2">
            <CardHeader>
              <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
                <div className="flex flex-col">
                  <Label htmlFor="orderType" className="mb-2">Тип документа</Label>
                  <Select
                    value={orderProform.orderType}
                    disabled={isEditingExisting}
                    onValueChange={(value) => {
                      setOrderProform((prev) => ({
                        ...prev,
                        orderType: value,
                      }));
                      setSubmissionStatus(null);
                      setDownloadUrl(null);
                    }}
                  >
                    <SelectTrigger className="w-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Накладная">Накладная</SelectItem>
                      <SelectItem value="Счет на оплату">Счет на оплату</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="cursor-pointer" variant="outline" onClick={() => setModalOpen(true)}>
                  Открыть накладную
                </Button>

                <Button
                  variant="outline"
                  onClick={resetForm}
                  className="cursor-pointer"
                >
                  Создать накладную
                </Button>
              </div>
            </CardHeader>

            <CardContent>
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
                    onChange={(e) =>
                      setOrderProform((prev) => ({
                        ...prev,
                        proformNumber: e.target.value,
                      }))
                    }
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
                      onChange={(e) =>
                        setOrderProform((prev) => ({
                          ...prev,
                          proformDate: e.target.value,
                        }))
                      }
                      className="block"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <Label htmlFor="orderPeriodStrt" className="mb-2">Период оплаты</Label>
                      <Input
                        id="orderPeriodStart"
                        type="date"
                        value={orderProform.orderPeriodStart}
                        disabled={isEditingExisting}
                        onChange={(e) =>
                          setOrderProform((prev) => ({
                            ...prev,
                            orderPeriodStart: e.target.value,
                          }))
                        }
                        className="w-full"
                      />
                    </div>
                    <div>
                      <Label htmlFor="orderPeriodEnd" className="mb-2">Период оплаты</Label>
                      <Input
                        id="orderPeriodEnd"
                        type="date"
                        value={orderProform.orderPeriodEnd}
                        disabled={isEditingExisting}
                        onChange={(e) =>
                          setOrderProform((prev) => ({
                            ...prev,
                            orderPeriodEnd: e.target.value,
                          }))
                        }
                        className="w-full"
                      />
                    </div>
                  </>
                )}
                <div>
                  <Label htmlFor="buyer" className="mb-2">Покупатель</Label>
                  <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                      <div>
                        <Input
                          id="buyer"
                          type="text"
                          value={orderProform.buyer}
                          autoComplete="off"
                          disabled={isEditingExisting}
                          onChange={(e) => {
                            setOrderProform((prev) => ({
                              ...prev,
                              buyer: e.target.value,
                            }));
                            setIsPopoverOpen(true);
                          }}
                          onClick={() => setIsPopoverOpen(true)}
                        />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-4"
                      align="start"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      {filteredBuyers.length > 0 && (
                        <div className="space-y-2">
                          {filteredBuyers.map((buyer) => (
                            <div
                              key={buyer.name}
                              className="p-2 hover:bg-gray-100 rounded cursor-pointer"
                              onClick={() => {
                                setOrderProform((prev) => ({
                                  ...prev,
                                  buyer: buyer.name,
                                  iin: buyer.iin,
                                  bankAccount: buyer.bankAccount,
                                  bankName: buyer.bankName,
                                }));
                                setIsPopoverOpen(false);
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
                      setOrderProform((prev) => ({
                        ...prev,
                        iin: value,
                      }));
                    }}
                  />
                  {iinError && (
                    <div className="text-red-500 text-xs mt-1">{iinError}</div>
                  )}
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
                      setOrderProform((prev) => ({
                        ...prev,
                        bankAccount: value,
                      }));
                    }}
                  />
                  {bankAccountError && (
                    <div className="text-red-500 text-xs mt-1">
                      {bankAccountError}
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="bankName" className="mb-2">Название Банка</Label>
                  <Input
                    id="bankName"
                    type="text"
                    value={orderProform.bankName}
                    disabled={isEditingExisting}
                    onChange={(e) =>
                      setOrderProform((prev) => ({
                        ...prev,
                        bankName: e.target.value,
                      }))
                    }
                  />
                </div>
                {orderProform.buyer.length > 0 && (
                  <div>
                    <Label htmlFor="constructionName">Название объекта</Label>
                    <Popover
                      open={isPopoverOpen2}
                      onOpenChange={setIsPopoverOpen2}
                    >
                      <PopoverTrigger asChild>
                        <div>
                          <Input
                            id="constructionName"
                            type="text"
                            value={orderProform.constructionName}
                            autoComplete="off"
                            disabled={isEditingExisting}
                            onChange={(e) => {
                              setOrderProform((prev) => ({
                                ...prev,
                                constructionName: e.target.value,
                              }));
                              setIsPopoverOpen2(true);
                            }}
                            onClick={() => setIsPopoverOpen2(true)}
                            placeholder="Введите название объекта"
                          />
                        </div>
                      </PopoverTrigger>
                      <PopoverContent
                        className="p-4"
                        align="start"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        {orderProform.buyer.length > 0 && (
                          <div className="space-y-2">
                            {buyersList
                              .find(
                                (potential) =>
                                  orderProform.buyer === potential.name
                              )
                              ?.constructions?.map((construction) => (
                                <div
                                  key={construction}
                                  className="p-2 hover:bg-gray-100 rounded cursor-pointer"
                                  onClick={() => {
                                    setOrderProform((prev) => ({
                                      ...prev,
                                      constructionName: construction,
                                    }));
                                    setIsPopoverOpen2(false);
                                  }}
                                >
                                  <span className="text-sm">
                                    {construction}
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Загрузить накладную</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <Label htmlFor="loadProform">Номер накладной</Label>
                      <Input
                        id="loadProform"
                        value={loadProform}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, ""); // только цифры
                          setLoadProform(val);
                        }}
                        maxLength={5}
                        placeholder="Например: 145"
                      />
                      <Button className="cursor-pointer" onClick={handleLoadProform} disabled={!loadProform.trim() || isSubmitting}>
                        {isLoadingInvoice ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Загрузка...
                          </>
                        ) : (
                          "Загрузить"
                        )}
                      </Button>
                      {error && (
                        <p className="text-red-600 text-sm mt-2">{error}</p>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                {isEditingExisting && orderProform.buyer.trim() === "ЗАО 'Браво Плюс'" && (
                  <div className="flex items-center space-x-2 border p-2 rounded-md">
                    <input
                      type="checkbox"
                      id="convert-check"
                      checked={convertToInvoice}
                      onChange={(e) => setConvertToInvoice(e.target.checked)}
                      className="w-4 h-4.5 cursor-pointer"
                    />
                    <Label htmlFor="convert-check" className="cursor-pointer">Сделать накладной</Label>
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !isValid || (orderProform.orderType === "Накладная" && selectedItems.length === 0)}
                  className="w-1/2 cursor-pointer"
                >
                  {isSubmitting ? "Отправка..." : isEditingExisting ? "Изменить" : "Оформить"}
                </Button>

              </div>
              {error && <span className="text-red-500">{error}</span>}
              {submissionStatus && (
                <div>
                  <img
                    src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjJ3bXFidHA5NGRjaWphYWU2Nms1cDFodmNpYTQ1dGhpbGloa29nZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/nsclFvPcImZfMJPF4D/giphy.gif"
                    alt="thanks"
                    className="w-1/5 relative right-[-40%]"
                  />
                  <p className="mt-4 text-center font-medium">
                    {submissionStatus}
                  </p>
                </div>
              )}
              {downloadUrl && (
                <div className="mt-4 text-center">
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-black text-white rounded-md border border-transparent hover:bg-white hover:text-black hover:border-black transition-colors"
                  >
                    📥 Скачать Excel
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {orderProform.orderType === "Накладная" && (
            <>
              <div className="my-6 w-full flex flex-col items-center md:w-1/3">
                <CardHeader className="w-[34%] md:w-full">
                  <CardTitle>Добавление товаров</CardTitle>
                </CardHeader>
                <CardContent className="w-full">
                  <div className="mb-4">
                    <Label htmlFor="search">Поиск товаров</Label>
                    <Popover open={open} onOpenChange={setOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-[400px] md:w-full justify-between"
                        >
                          {selectedItems
                            ? selectedItems.name
                            : "Выберите товар..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] md:w-[450px] p-0 max-h-72 overflow-y-auto">
                        <Command>
                          <CommandInput placeholder="Поиск товара..." />
                          <CommandEmpty>Ничего не найдено</CommandEmpty>
                          <CommandGroup>
                            {materialData.map((item) => (
                              <CommandItem
                                key={item.id}
                                value={item.name}
                                onSelect={() => {
                                  addItem(item);
                                  setOpen(false);
                                }}
                              >
                                {item.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </CardContent>
              </div>
              <Card className="mb-6 w-full">
                <CardHeader>
                  <CardTitle>Выбранные товары</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedItems.length === 0 ? (
                    <p className="text-gray-500">Нет выбранных товаров</p>
                  ) : (
                    <div className="space-y-4">
                      {selectedItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col justify-between items-center md:flex-row border-b pb-2"
                        >
                          <div>
                            <h3 className="font-medium">{item.name}</h3>
                            <p>
                              Цена:{" "}
                              {item.name !== "Доставка" ? (
                                <>
                                  {item.price ? Number(item.price) : 0} сом × {item.quantity} {item.measure} =
                                  <span className="font-bold">
                                    {" "}
                                    {item.price ? Number(item.price) : 0 * item.quantity} сом
                                  </span>
                                </>
                              ) : (
                                <span className="font-bold">
                                  {item.price ? Number(item.price) : 0} сом
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-end space-x-2">
                            <div className="flex flex-col items-center">
                              <Label className="text-xs mb-1">Кол-во</Label>
                              <Input
                                type="number"
                                className="w-16 h-8 text-center"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateQuantity(item.id, e.target.value)
                                }
                                onBlur={(e) => {
                                  if (Number(e.target.value) < 1) {
                                    updateQuantity(item.id, 1);
                                  }
                                }}
                              />
                            </div>
                            <div className="flex flex-col items-center">
                              <Label className="text-xs mb-1">Цена</Label>
                              <Input
                                type="number"
                                className="w-20 h-8 text-center"
                                value={+item.price}
                                onChange={(e) => {
                                  const newPrice =
                                    parseFloat(e.target.value) || 0;
                                  setSelectedItems(
                                    selectedItems.map((i) =>
                                      i.id === item.id
                                        ? {
                                          ...i,
                                          price: newPrice,
                                        }
                                        : i
                                    )
                                  );
                                }}
                              />
                            </div>
                            {item.name !== "Доставка" && (
                              <div className="flex flex-col items-center">
                                <Label className="text-xs mb-1">
                                  Себестоимость
                                </Label>
                                <Input
                                  type="number"
                                  className="w-20 h-8 text-center"
                                  value={+item.costPrice}
                                  onChange={(e) => {
                                    const newPrice =
                                      parseFloat(e.target.value) || 0;
                                    setSelectedItems(
                                      selectedItems.map((i) =>
                                        i.id === item.id
                                          ? {
                                            ...i,
                                            costPrice: newPrice,
                                          }
                                          : i
                                      )
                                    );
                                  }}
                                />
                              </div>
                            )}
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => removeItem(item.id)}
                            >
                              Удалить
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="text-right mt-4">
                        <h3 className="text-lg font-bold">
                          Итого:{` ${totalSum} `}
                          {`(${convertNumberToWordsRu(Math.round(totalSum), {
                            currency: {
                              currencyNameCases: ["сом", "сома", "сом"],
                              fractionalPartNameCases: [
                                "тыйын",
                                "тыйын",
                                "тыйын",
                              ],
                            },
                            showNumberParts: {
                              integer: true,
                              fractional: false,
                            },
                          })})`}
                        </h3>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}


        </div>
      ) : (
        <div className="w-full h-screen flex flex-col justify-center items-center gap-4">
          <span className="text-2xl">Авторизуйтесь, Ошский Господин</span>
          <img src="https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExZWRncG82Y2J0ZmdtNXpnaWx2MDFsejVyNDUwZ2NzbTkxN3pqY3h2MiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ILW1fbJHW0Ndm/giphy.gif" />
          {isLoading ? (
            <Button className="px-6 py-3 rounded" disabled>
              Загрузка...
            </Button>
          ) : (
            <Button
              className="px-6 py-3 rounded hover:scale-110 transition-colors"
              onClick={handleLogin}
            >
              Войти через Google
            </Button>
          )}
          {error && <div className="text-red-500 mt-2">{error}</div>}
        </div>
      )}
    </>
  );
}

export default App;
