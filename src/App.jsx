import { useState, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { convert as convertNumberToWordsRu } from "number-to-words-ru";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { buyersList, materialData, sortMaterials } from "./materialData";
import { useDebounce } from "use-debounce";

function App() {
  const [token, setToken] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isPopoverOpen2, setIsPopoverOpen2] = useState(false);
  const [filteredBuyers, setFilteredBuyers] = useState(buyersList);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [iinError, setIinError] = useState("");
  const [bankAccountError, setBankAccountError] = useState("");
  const [debouncedIin] = useDebounce(orderProform.iin, 1000);
  const [debouncedBankAccount] = useDebounce(orderProform.bankAccount, 1000);

  // const sortedData = sortMaterials(materialData);
  // console.log("sortedData",sortedData);

  useEffect(() => {
    const cachedToken = localStorage.getItem("google_sheets_token");
    const cachedTime = localStorage.getItem("google_sheets_token_time");
    if (cachedToken && cachedTime) {
      const now = Date.now();
      const tokenTime = parseInt(cachedTime, 10);
      if (now - tokenTime < 43200000) {
        setToken(cachedToken);
      } else {
        localStorage.removeItem("google_sheets_token");
        localStorage.removeItem("google_sheets_token_time");
      }
    }
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
              code: codeResponse.code, // <-- Убедись, что есть .code
              client_id: import.meta.env.VITE_CLIENT_ID,
              client_secret: import.meta.env.VITE_CLIENT_SECRET,
              redirect_uri: window.location.origin,
              grant_type: "authorization_code",
            }),
          }
        );

        const tokens = await tokenResponse.json();
        if (!tokenResponse.ok)
          throw new Error(tokens.error || "Ошибка получения токенов");

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
        setError(error.message || "Ошибка авторизации");
        console.error("Auth error:", error);
        handleLogout();
      } finally {
        setIsLoading(false);
      }
    },
    onError: (errorResponse) => {
      setError(errorResponse.error || "Неизвестная ошибка");
      setIsLoading(false);
    },
    flow: "auth-code",
  });

  const refreshToken = async () => {
    try {
      const refreshToken = localStorage.getItem("google_refresh_token");
      if (!refreshToken) throw new Error("No refresh token");

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: import.meta.env.VITE_CLIENT_ID,
          client_secret: import.meta.env.VITE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Ошибка обновления токена");

      localStorage.setItem("google_access_token", data.access_token);
      localStorage.setItem(
        "google_token_expiry",
        (Date.now() + data.expires_in * 1000).toString()
      );

      setToken(data.access_token);
      return data.access_token;
    } catch (error) {
      console.error("Refresh token error:", error);
      handleLogout();
      return null;
    }
  };

  const handleLogin = () => {
    setIsLoading(true);
    setError(null);
    login();
  };

  const handleLogout = () => {
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
    return sum + (item.name !== "Доставка" ? Number(item.price) * Number(item.quantity) : Number(item.price)) || 0;
  }, 0);

  async function aggregateItemsFromPeriod(token, periodStart, periodEnd) {
    const sheetsInfoResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${
        import.meta.env.VITE_SPREADSHEET_ID
      }`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const sheetsInfo = await sheetsInfoResponse.json();
    if (!sheetsInfoResponse.ok) throw new Error(JSON.stringify(sheetsInfo));

    function parseDate(str) {
      const [d, m, y] = str.split(".");
      return new Date(`${y}-${m}-${d}T03:00:00`);
    }
    const start = parseDate(periodStart);
    const end = parseDate(periodEnd);

    const filteredSheets = sheetsInfo.sheets.filter((sheet) => {
      const title = sheet.properties.title;
      if (title.length < 17) return false;
      const dateStr = title.slice(8, 18);

      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) return false;
      const date = parseDate(dateStr);
      return date >= start && date <= end;
    });

    // Собираем товары со всех листов
    let allItems = [];
    for (const sheet of filteredSheets) {
      const title = sheet.properties.title;
      // Получаем диапазон B9:F (до строки с "Итого" в B)
      const dataResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${
          import.meta.env.VITE_SPREADSHEET_ID
        }/values/'${encodeURIComponent(title)}'!B9:F1000`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await dataResp.json();
      if (!data.values) continue;
      for (let i = 0; i < data.values.length; i++) {
        const row = data.values[i];
        if ((row[1] || "").toLowerCase().includes("итого")) break;
        if (!row[0] || !row[3]) continue;
        allItems.push({
          name: row[0],
          measure: row[1] || "",
          quantity: Number(row[2]) || 0,
          price: Number(row[3]) || 0,
        });
      }
    }
    // Объединяем одинаковые товары с одинаковой ценой
    const mergedMap = new Map();
    let deliveryItem = null;

    for (const item of allItems) {
      const name = item.name?.trim();
      const price = Number(item.price);
      const quantity = Number(item.quantity);

      if (name === "Доставка") {
        if (deliveryItem) {
          deliveryItem.quantity += quantity;
          deliveryItem.price += price;
        } else {
          deliveryItem = { ...item };
        }
        continue;
      }

      const key = `${name.toLowerCase()}__${price}`;

      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        existing.quantity += quantity;
      } else {
        mergedMap.set(key, { ...item });
      }
    }

    // Собираем результат
    const merged = Array.from(mergedMap.values());

    // Добавляем доставку в конец, если она есть
    if (deliveryItem) {
      merged.push(deliveryItem);
    }

    return merged;
  }

  const submitOrder = async (token) => {
    let validToken = token;
    const expiryTime = localStorage.getItem("google_token_expiry");

    if (!expiryTime || parseInt(expiryTime, 10) - Date.now() < 30000) {
      validToken = await refreshToken();
      if (!validToken) {
        setError("Сессия истекла. Пожалуйста, авторизуйтесь снова.");
        return;
      }
    }
    setIsSubmitting(true);
    setSubmissionStatus("");
    setDownloadUrl("");

    let itemsToUse = selectedItems;

    if (orderProform.orderType === "Счет на оплату") {
      try {
        itemsToUse = await aggregateItemsFromPeriod(
          validToken,
          orderProform.orderPeriodStart
            .replace(/-/g, ".")
            .split(".")
            .reverse()
            .join("."),
          orderProform.orderPeriodEnd
            .replace(/-/g, ".")
            .split(".")
            .reverse()
            .join(".")
        );
      } catch (e) {
        setError("Ошибка при сборе товаров по периоду: " + e.message);
        setIsSubmitting(false);
        return;
      }
    }

    const totalSum = itemsToUse.reduce((sum, item) => {
      return (
        sum +
        Math.round(
          orderProform.orderType === "Накладная"
                ? (item.name === "Доставка" ? +item.price
                : item.price * item.quantity) : item.price * item.quantity 
        )
      );
    }, 0);

    const orderData = {
      orderProform: `${orderProform.orderType} №${
        orderProform.proformNumber
      } от ${(orderProform.proformDate.length === 0
        ? orderProform.orderPeriodEnd
        : orderProform.proformDate
      )
        .split("-")
        .reverse()
        .join(".")} г.`,
      orderDate: orderProform.proformDate.split("-").reverse().join("."),
      buyer: `Покупатель: ${orderProform.buyer} ИНН ${orderProform.iin}`,
      constructionName: `Объект: ${orderProform.constructionName}`,
      bankAccount: `р/с ${orderProform.bankAccount} в ${orderProform.bankName}`,
      items: itemsToUse.map((item) => ({
        name: item.name,
        price: item.name !== "Доставка" ? +item.price : null,
        measure: item.measure,
        quantity: item.quantity,
        totalPriceCost: item.name !== "Доставка" ? item.costPrice * item.quantity : item.price,
        total: Math.round(
          orderProform.orderType === "Накладная"
                ? (item.name === "Доставка" ? +item.price
                : item.price * item.quantity) : item.price * item.quantity 
        ),
      })),
      totalSum: `Итого к оплате: ${convertNumberToWordsRu(
        Math.round(totalSum),
        {
          currency: {
            currencyNameCases: ["сом", "сом", "сом"],
            fractionalPartNameCases: ["тыйын", "тыйын", "тыйын"],
          },
          showNumberParts: {
            integer: true,
            fractional: false,
          },
        }
      )}`,
    };

    try {
      // 1. Создаем новый лист
      const createResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${
          orderProform.orderType === "Накладная"
            ? import.meta.env.VITE_SPREADSHEET_ID
            : import.meta.env.VITE_PERIOD_SPREADSHEET_ID
        }:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title:
                      orderProform.orderType === "Счет на оплату"
                        ? orderData.orderProform.slice(15)
                        : orderData.orderProform.slice(10),
                    gridProperties: {
                      rowCount: 300,
                      columnCount: 6,
                    },
                  },
                },
              },
            ],
          }),
        }
      );

      const createResult = await createResponse.json();
      if (!createResponse.ok) throw new Error(JSON.stringify(createResult));
      const sheetId = createResult.replies[0].addSheet.properties.sheetId;

      // 2. Подготовка данных
      const items = orderData.items.map((item, index) => [
        index + 1,
        item.name,
        item.measure,
        item.quantity,
        item.price,
        item.totalPriceCost,
        item.total,
      ]);

      const totalSumInDigits = orderData.items.reduce(
        (sum, item) => sum + item.total,
        0
      );

      const totalCostSumInDigits = orderData.items.reduce(
        (sum, item) => sum + (item.name !== "Доставка" ? item.totalPriceCost : 0),
        0
      );

      const totalRow = 11 + items.length;

      // 3. Формируем все запросы на обновление
      const requests = [
        // Объединение ячеек для заголовков
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            mergeType: "MERGE_ALL",
          },
        },
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 2,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            mergeType: "MERGE_ALL",
          },
        },
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 2,
              endRowIndex: 3,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            mergeType: "MERGE_ALL",
          },
        },
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 4,
              endRowIndex: 5,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            mergeType: "MERGE_ALL",
          },
        },
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 5,
              endRowIndex: 6,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            mergeType: "MERGE_ALL",
          },
        },
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 7,
              endRowIndex: 8,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            mergeType: "MERGE_ALL",
          },
        },
        // Заполнение данных
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 1,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: { stringValue: orderData.orderProform },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 14,
                      },
                      horizontalAlignment: "LEFT",
                    },
                  },
                ],
              },
            ],
            fields: "userEnteredValue,userEnteredFormat",
          },
        },
        // Информация о поставщике
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 3,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      stringValue:
                        "Поставщик: ИП Женишбек у.Ж. ИНН 22712200100929 р/с 1240040001978972",
                    },
                    userEnteredFormat: {
                      textFormat: {
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "LEFT",
                    },
                    textFormatRuns: [
                      {
                        startIndex: 0,
                        format: {
                          bold: false,
                        },
                      },
                      {
                        startIndex: 10, // После "Поставщик: "
                        format: {
                          bold: true,
                        },
                      },
                    ],
                  },
                ],
              },
              {
                values: [
                  {
                    userEnteredValue: {
                      stringValue: 'в ОАО "Бакай Банк", БИК 124029',
                    },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "LEFT",
                    },
                  },
                ],
              },
            ],
            fields: "userEnteredValue,userEnteredFormat,textFormatRuns",
          },
        },
        // Информация о покупателе
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: 4,
              endRowIndex: 6,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      stringValue: orderData.buyer,
                    },
                    userEnteredFormat: {
                      textFormat: {
                        bold: false,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "LEFT",
                    },
                    textFormatRuns: [
                      {
                        startIndex: 0,
                        format: {
                          bold: false,
                        },
                      },
                      {
                        startIndex: 11,
                        format: {
                          bold: true,
                        },
                      },
                    ],
                  },
                ],
              },
              {
                values: [
                  {
                    userEnteredValue: { stringValue: orderData.bankAccount },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "LEFT",
                    },
                  },
                ],
              },
            ],
            fields: "userEnteredValue,userEnteredFormat,textFormatRuns",
          },
        },
        // Информация об объекте
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: 7,
              endRowIndex: 8,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      stringValue: orderData.constructionName,
                    },
                    userEnteredFormat: {
                      textFormat: {
                        bold: false,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "LEFT",
                    },
                    textFormatRuns: [
                      {
                        startIndex: 0,
                        format: {
                          bold: false,
                        },
                      },
                      {
                        startIndex: 7,
                        format: {
                          bold: true,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
            fields: "userEnteredValue,userEnteredFormat,textFormatRuns",
          },
        },
        // Заголовки таблицы товаров
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: 9,
              endRowIndex: 10,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: { stringValue: "№" },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "CENTER",
                    },
                  },
                  {
                    userEnteredValue: { stringValue: "Наименование" },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "CENTER",
                    },
                  },
                  {
                    userEnteredValue: { stringValue: "Ед. изм." },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "CENTER",
                    },
                  },
                  {
                    userEnteredValue: { stringValue: "Кол-во" },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "CENTER",
                    },
                  },
                  {
                    userEnteredValue: { stringValue: "Цена" },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "CENTER",
                    },
                  },
                  {
                    userEnteredValue: { stringValue: "Сумма" },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "CENTER",
                    },
                  },
                ],
              },
            ],
            fields: "userEnteredValue,userEnteredFormat",
          },
        },
        // Данные товаров
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: 10,
              endRowIndex: 10 + orderData.items.length,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            rows: orderData.items.map((item, index) => ({
              values: [
                {
                  // №
                  userEnteredValue: { numberValue: index + 1 },
                  userEnteredFormat: {
                    textFormat: { fontFamily: "Times New Roman", fontSize: 12 },
                    horizontalAlignment: "CENTER",
                  },
                },
                {
                  // Наименование
                  userEnteredValue: { stringValue: item.name },
                  userEnteredFormat: {
                    textFormat: { fontFamily: "Times New Roman", fontSize: 12 },
                    horizontalAlignment: "LEFT",
                  },
                },
                {
                  // Ед. изм.
                  userEnteredValue: { stringValue: item.measure },
                  userEnteredFormat: {
                    textFormat: { fontFamily: "Times New Roman", fontSize: 12 },
                    horizontalAlignment: "CENTER",
                  },
                },
                {
                  // Кол-во
                  userEnteredValue: { numberValue: item.quantity },
                  userEnteredFormat: {
                    textFormat: { fontFamily: "Times New Roman", fontSize: 12 },
                    horizontalAlignment: "CENTER",
                  },
                },
                {
                  // Цена
                  userEnteredValue: { numberValue: item.price },
                  userEnteredFormat: {
                    textFormat: { fontFamily: "Times New Roman", fontSize: 12 },
                    horizontalAlignment: "CENTER",
                  },
                },
                {
                  // Сумма
                  userEnteredValue: { numberValue: item.total },
                  userEnteredFormat: {
                    textFormat: { fontFamily: "Times New Roman", fontSize: 12 },
                    horizontalAlignment: "CENTER",
                    numberFormat: {
                      type: "NUMBER",
                      pattern: "# ##0",
                    },
                  },
                },
              ],
            })),
            fields: "userEnteredValue,userEnteredFormat",
          },
        },
        // Итог в цифрах
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: totalRow - 1,
              endRowIndex: totalRow,
              startColumnIndex: 2,
              endColumnIndex: 6,
            },
            mergeType: "MERGE_ALL",
          },
        },
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: totalRow - 1,
              endRowIndex: totalRow,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            rows: [
              {
                values: [
                  {},
                  {
                    userEnteredValue: { stringValue: "Итого" },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "LEFT",
                    },
                  },
                  {
                    userEnteredValue: { numberValue: totalSumInDigits },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "RIGHT",
                      numberFormat: {
                        type: "NUMBER",
                        pattern: '# ##0" сом"',
                      },
                    },
                  },
                  {},
                  {},
                  {},
                ],
              },
            ],
            fields: "userEnteredValue,userEnteredFormat",
          },
        },
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: totalRow + 1,
              endRowIndex: totalRow + 2,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            mergeType: "MERGE_ALL",
          },
        },
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: totalRow + 1,
              endRowIndex: totalRow + 2,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      stringValue: orderData.totalSum,
                    },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "LEFT",
                    },
                  },
                ],
              },
            ],
            fields:
              "userEnteredValue,userEnteredFormat(textFormat,horizontalAlignment)",
          },
        },
        // Подписи "Сдал","Принял","Руководитель"
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: totalRow + 3,
              endRowIndex: totalRow + 4,
              startColumnIndex: 0,
              endColumnIndex: 4,
            },
            mergeType: "MERGE_ALL",
          },
        },
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: totalRow + 3,
              endRowIndex: totalRow + 4,
              startColumnIndex: 4,
              endColumnIndex: 6,
            },
            mergeType: "MERGE_ALL",
          },
        },
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: totalRow + 3,
              endRowIndex: totalRow + 4,
              startColumnIndex: 0,
              endColumnIndex: 4,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      stringValue:
                        orderProform.orderType === "Счет на оплату"
                          ? "Руководитель"
                          : "Сдал:",
                    },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "LEFT",
                    },
                  },
                ],
              },
            ],
            fields: "userEnteredValue,userEnteredFormat",
          },
        },
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: totalRow + 3,
              endRowIndex: totalRow + 4,
              startColumnIndex: 4,
              endColumnIndex: 6,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      stringValue:
                        orderProform.orderType === "Счет на оплату"
                          ? "Женишбек у. Ж"
                          : "Принял:",
                    },
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                        fontFamily: "Times New Roman",
                        fontSize: 12,
                      },
                      horizontalAlignment: "LEFT",
                    },
                  },
                ],
              },
            ],
            fields: "userEnteredValue,userEnteredFormat",
          },
        },
        // Настройка ширины колонок
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: 1,
            },
            properties: { pixelSize: 30 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 1,
              endIndex: 2,
            },
            properties: { pixelSize: 330 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 2,
              endIndex: 3,
            },
            properties: { pixelSize: 100 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 3,
              endIndex: 4,
            },
            properties: { pixelSize: 60 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 4,
              endIndex: 5,
            },
            properties: { pixelSize: 100 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 5,
              endIndex: 6,
            },
            properties: { pixelSize: 120 },
            fields: "pixelSize",
          },
        },
        // Границы таблицы
        {
          updateBorders: {
            range: {
              sheetId,
              startRowIndex: 9,
              endRowIndex: 10 + items.length + 1,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            top: { style: "SOLID", width: 1 },
            bottom: { style: "SOLID", width: 1 },
            left: { style: "SOLID", width: 1 },
            right: { style: "SOLID", width: 1 },
            innerHorizontal: { style: "SOLID", width: 1 },
            innerVertical: { style: "SOLID", width: 1 },
          },
        },
      ];

      // 4. Отправляем все запросы на редактирование
      const formatResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${
          orderProform.orderType === "Накладная"
            ? import.meta.env.VITE_SPREADSHEET_ID
            : import.meta.env.VITE_PERIOD_SPREADSHEET_ID
        }:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ requests }),
        }
      );

      const formatResult = await formatResponse.json();
      if (!formatResponse.ok) throw new Error(JSON.stringify(formatResult));

      // 5. Добавляем запись в Реестр
      try {
        const proformListResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${
            orderProform.orderType === "Накладная"
              ? import.meta.env.VITE_LIST_SPREADSHEET_ID
              : import.meta.env.VITE_LIST_PERIOD_SPREADSHEET_ID
          }/values/Реестр!A:G`,
          {
            headers: {
              Authorization: `Bearer ${validToken}`,
            },
          }
        );

        const proformListData = await proformListResponse.json();
        if (!proformListResponse.ok)
          throw new Error(JSON.stringify(proformListData));

        const nextRow =
          orderProform.orderType === "Накладная"
            ? Math.max(6, (proformListData.values?.length || 5) + 1)
            : Math.max(4, (proformListData.values?.length || 3) + 1);
            
        const proformListRowData = [
          nextRow - 2,
          `№${orderProform.proformNumber}`,
          (orderProform.proformDate || orderProform.orderPeriodEnd)
            .split("-")
            .reverse()
            .join("."),
          totalSumInDigits,
          totalCostSumInDigits,
          totalSumInDigits - totalCostSumInDigits,
          orderProform.buyer,
        ];

        const addToProformListResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${
            orderProform.orderType === "Накладная"
              ? import.meta.env.VITE_LIST_SPREADSHEET_ID
              : import.meta.env.VITE_LIST_PERIOD_SPREADSHEET_ID
          }/values/Реестр!A${nextRow}:G${nextRow}?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${validToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              values: [proformListRowData],
            }),
          }
        );

        if (!addToProformListResponse.ok) {
          const proformListError = await addToProformListResponse.json();
          console.warn("Ошибка добавления в реестр:", proformListError);
        }

        const sheetsInfoResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${
            orderProform.orderType === "Накладная"
              ? import.meta.env.VITE_LIST_SPREADSHEET_ID
              : import.meta.env.VITE_LIST_PERIOD_SPREADSHEET_ID
          }`,
          {
            headers: {
              Authorization: `Bearer ${validToken}`,
            },
          }
        );

        const sheetsInfo = await sheetsInfoResponse.json();
        if (!sheetsInfoResponse.ok) throw new Error(JSON.stringify(sheetsInfo));

        const proformListSheet = sheetsInfo.sheets.find(
          (sheet) => sheet.properties.title === "Реестр"
        );

        if (proformListSheet) {
          const proformListSheetId = proformListSheet.properties.sheetId;

          const borderResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${
              orderProform.orderType === "Накладная"
                ? import.meta.env.VITE_LIST_SPREADSHEET_ID
                : import.meta.env.VITE_LIST_PERIOD_SPREADSHEET_ID
            }:batchUpdate`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${validToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                requests: [
                  {
                    updateBorders: {
                      range: {
                        sheetId: proformListSheetId,
                        startRowIndex: nextRow - 1,
                        endRowIndex: nextRow,
                        startColumnIndex: 0,
                        endColumnIndex: 7,
                      },
                      bottom: { style: "SOLID", width: 1 },
                    },
                  },
                ],
              }),
            }
          );

          if (!borderResponse.ok) {
            const borderError = await borderResponse.json();
            console.warn("Ошибка добавления границы:", borderError);
          }
        } else {
          console.warn("Лист 'Реестр' не найден");
        }
      } catch (proformListError) {
        console.warn("Ошибка при работе с реестром:", proformListError);
      }

      const excelDownloadUrl = `https://docs.google.com/spreadsheets/d/${
        orderProform.orderType === "Накладная"
          ? import.meta.env.VITE_SPREADSHEET_ID
          : import.meta.env.VITE_PERIOD_SPREADSHEET_ID
      }/export?format=xlsx&gid=${sheetId}`;
      setDownloadUrl(excelDownloadUrl);
      setSubmissionStatus(
        orderProform.orderType === "Накладная"
          ? "Накладная успешно создана!"
          : "Счет на оплату успешно создан!"
      );
      return {
        sheetId,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${
          orderProform.orderType === "Накладная"
            ? import.meta.env.VITE_SPREADSHEET_ID
            : import.meta.env.VITE_PERIOD_SPREADSHEET_ID
        }/edit#gid=${sheetId}`,
        fileName: `${orderProform.buyer} - №${orderProform.proformNumber} от ${
          orderProform.proformDate || orderProform.orderPeriodEnd
        }.xlsx`,
      };
    } catch (error) {
      console.error("Error creating order sheet:", error);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const validateForm = () => {
    const requiredFields = {
      buyer: orderProform.buyer.trim() !== "",
      iin: orderProform.iin.trim() !== "" && !iinError,
      bankAccount: orderProform.bankAccount.trim() !== "" && !bankAccountError,
      bankName: orderProform.bankName.trim() !== "",
      proformNumber: orderProform.proformNumber.trim() !== "",
    };

    if (orderProform.orderType === "Накладная") {
      requiredFields.proformDate = orderProform.proformDate.trim() !== "";
      requiredFields.constructionName =
        orderProform.constructionName.trim() !== "";
    } else {
      requiredFields.orderPeriodStart =
        orderProform.orderPeriodStart.trim() !== "";
      requiredFields.orderPeriodEnd = orderProform.orderPeriodEnd.trim() !== "";
    }

    return Object.values(requiredFields).every(Boolean);
  };

  useEffect(() => {
    if (debouncedIin === "") {
      setIinError("");
    } else if (!/^\d{14}$/.test(debouncedIin)) {
      setIinError("ИИН должен состоять ровно из 14 цифр");
    } else {
      setIinError("");
    }
  }, [debouncedIin]);

  useEffect(() => {
    if (debouncedBankAccount === "") {
      setBankAccountError("");
    } else if (!/^\d{16}$/.test(debouncedBankAccount)) {
      setBankAccountError("Банковский счет должен состоять ровно из 16 цифр");
    } else {
      setBankAccountError("");
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

  return (
    <>
      {token ? (
        <div className="container mx-auto p-4 mb-6 flex flex-col items-normal md:items-center">
          <div className="w-full flex justify-end mb-2">
            <Button variant="outline" onClick={handleLogout}>
              Выйти
            </Button>
          </div>
          <Card className="flex justify-between">
            <CardHeader className="w-full md:w-[700px]">
              <Label htmlFor="orderType">Тип документа</Label>
              <Select
                value={orderProform.orderType}
                onValueChange={(value) =>
                  setOrderProform((prev) => ({
                    ...prev,
                    orderType: value,
                  }))
                }
              >
                <SelectTrigger className="w-1/3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Накладная">Накладная</SelectItem>
                  <SelectItem value="Счет на оплату">Счет на оплату</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 items-end md:grid-cols-3 gap-4 mb-4">
                <div>
                  <Label htmlFor="orderNumber">
                    {orderProform.orderType === "Накладная"
                      ? "Номер накладной"
                      : "Номер счета на оплату"}
                  </Label>
                  <Input
                    id="orderNumber"
                    type="text"
                    value={orderProform.proformNumber}
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
                    <Label htmlFor="orderDate">Дата заказа</Label>
                    <Input
                      id="orderDate"
                      type="date"
                      value={orderProform.proformDate}
                      onChange={(e) =>
                        setOrderProform((prev) => ({
                          ...prev,
                          proformDate: e.target.value,
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <Label htmlFor="orderPeriodStrt">Период оплаты</Label>
                      <Input
                        id="orderPeriodStart"
                        type="date"
                        value={orderProform.orderPeriodStart}
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
                      <Label htmlFor="orderPeriodEnd">Период оплаты</Label>
                      <Input
                        id="orderPeriodEnd"
                        type="date"
                        value={orderProform.orderPeriodEnd}
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
                  <Label htmlFor="buyer">Покупатель</Label>
                  <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                      <div>
                        <Input
                          id="buyer"
                          type="text"
                          value={orderProform.buyer}
                          onChange={(e) => {
                            setOrderProform((prev) => ({
                              ...prev,
                              buyer: e.target.value,
                            }));
                            setIsPopoverOpen(true);
                          }}
                          onClick={() => setIsPopoverOpen(true)}
                          placeholder="Введите название покупателя"
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
                  <Label htmlFor="iin">ИИН</Label>
                  <Input
                    id="iin"
                    type="text"
                    value={orderProform.iin}
                    maxLength={14}
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
                  <Label htmlFor="bankAccount">Р/С</Label>
                  <Input
                    id="bankAccount"
                    type="text"
                    value={orderProform.bankAccount}
                    maxLength={16}
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
                  <Label htmlFor="bankName">Название Банка</Label>
                  <Input
                    id="bankName"
                    type="text"
                    value={orderProform.bankName}
                    onChange={(e) =>
                      setOrderProform((prev) => ({
                        ...prev,
                        bankName: e.target.value,
                      }))
                    }
                  />
                </div>
                {(orderProform.orderType === "Накладная" && orderProform.buyer.length > 0) && (
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
                <Button
                  onClick={() => submitOrder(token)}
                  disabled={
                    isSubmitting ||
                    !!iinError ||
                    !!bankAccountError ||
                    !validateForm() ||
                    (orderProform.orderType === "Накладная" &&
                      selectedItems.length === 0)
                  }
                  className="w-1/2"
                >
                  {isSubmitting ? "Отправка..." : "Оформить"}
                </Button>
              </div>
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
              <div className="my-6 w-1/3">
                <CardHeader>
                  <CardTitle>Добавление товаров</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <Label htmlFor="search">Поиск товаров</Label>
                    <Popover
                      open={open}
                      onOpenChange={setOpen}
                      className="w-[500px]]"
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-[400px] md:w-[450px] justify-between"
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
                              Цена: {item.name !== "Доставка" ? (
                                <>
                                {Number(item.price)} сом × {item.quantity} =
                                <span className="font-bold">
                                  {" "}
                                  {Number(item.price) * item.quantity} сом
                                </span>
                                </>
                              ) : <span className="font-bold">{item.price} сом</span>}
                              
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
                            { item.name !== "Доставка" && (
                              <div className="flex flex-col items-center">
                                <Label className="text-xs mb-1">Себестоимость</Label>
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
                          Итого:{" "}
                          {convertNumberToWordsRu(Math.round(totalSum), {
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
                          })}
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
