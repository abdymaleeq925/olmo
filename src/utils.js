import { convert as convertNumberToWordsRu } from "number-to-words-ru";
import { buyersList, monthToColumn } from "./materialData";

// Вспомогательные маленькие функции

function parseDate(str) {
  const [d, m, y] = str.split(".");
  return new Date(`${y}-${m}-${d}T03:00:00`);
}

function extractBuyerName(buyerString) {
  if (!buyerString) return null;
  const withoutPrefix = buyerString.replace("Покупатель: ", "");
  const innIndex = withoutPrefix.indexOf("ИНН");
  if (innIndex === -1) return withoutPrefix.trim();
  return withoutPrefix.substring(0, innIndex).trim();
}

function extractConstructionName(buyerString) {
  if (!buyerString) return null;
  return buyerString.replace("Объект: ", "").trim();
}

function parseNumber(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function translateGoogleError(errorMessage) {
  if (!errorMessage) return "Неизвестная ошибка";
  
  // Если пришел JSON в виде строки, пытаемся достать из него чистое сообщение
  let cleanMessage = errorMessage;
  try {
    if (errorMessage.startsWith('{')) {
      const parsed = JSON.parse(errorMessage);
      cleanMessage = parsed.error?.message || parsed.message || errorMessage;
    }
  } catch (errorMessage) {
    cleanMessage = errorMessage;
  }

  const errorTranslations = {
    "invalid_grant": "Сессия истекла. Пожалуйста, войдите в аккаунт снова.",
    "insufficient authentication scopes": "Недостаточно прав. Нужно переавторизоваться и дать доступ к таблицам.",
    "PERMISSION_DENIED": "Доступ запрещен. Убедитесь, что у вас есть права на редактирование этой таблицы.",
    "not found": "Запрашиваемый ресурс (файл или лист) не найден.",
    "rateLimitExceeded": "Слишком много запросов. Подождите немного.",
    "access_denied": "Вы отменили авторизацию или доступ ограничен.",
  };

  // Ищем совпадение по ключевым словам внутри сообщения
  for (const [key, translation] of Object.entries(errorTranslations)) {
    if (cleanMessage.toLowerCase().includes(key.toLowerCase())) {
      return translation;
    }
  }

  // Если ничего не нашли, возвращаем исходное сообщение (но очищенное от JSON)
  return cleanMessage;
}

export async function refreshToken() {
  try {
    const refreshToken = localStorage.getItem("google_refresh_token");
    if (!refreshToken) throw new Error("No refresh token");

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: import.meta.env.VITE_CLIENT_ID,
        client_secret: import.meta.env.VITE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const errorMsg = translateGoogleError(data.error || "Ошибка обновления токена");
      throw new Error(errorMsg);
    }

    localStorage.setItem("google_access_token", data.access_token);
    localStorage.setItem(
      "google_token_expiry",
      (Date.now() + data.expires_in * 1000).toString()
    );

    return data.access_token;
  } catch (error) {
    console.error("Refresh token error:", error);
    return null;
  }
}

export async function aggregateItemsFromPeriod(
  token,
  periodStart,
  periodEnd,
  buyerName,
  constructionName
) {
  const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID;

  const sheetsInfoResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const sheetsInfo = await sheetsInfoResponse.json();

  if (!sheetsInfoResponse.ok) {
    const errorMsg = translateGoogleError(sheetsInfo.error?.message || JSON.stringify(sheetsInfo));
    throw new Error(errorMsg);
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

  const buyerPromises = filteredSheets.map(async (sheet) => {
    const title = sheet.properties.title;
    const resp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
        title
      )}'!A5:A8`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return { title, buyerInfo: await resp.json() };
  });

  const buyerInfos = await Promise.all(buyerPromises);

  const matching = buyerInfos.filter(({ buyerInfo }) => {
    const values = buyerInfo.values;
    if (!values?.[0]?.[0] || !values?.[3]?.[0]) return false;
    const buyerStr = values[0][0];
    const objStr = values[3][0];
    return (
      extractBuyerName(buyerStr) === buyerName &&
      extractConstructionName(objStr) === constructionName
    );
  });

  const dataPromises = matching.map(async ({ title }) => {
    const resp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
        title
      )}'!B11:G1000`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const { values } = await resp.json();
    return values || [];
  });

  const allSheetsData = await Promise.all(dataPromises);

  let allItems = [];
  allSheetsData.forEach((values) => {
    for (const row of values) {
      if (row[0] === "Итого") break;
      const name = row[0]?.trim();
      if (!name) continue;

      allItems.push({
        name,
        measure: row[1] || "",
        quantity: Number(row[2]) || 0,
        price:
          name !== "Доставка"
            ? Number(row[3]) || 0
            : Number(String(row[4] || row[5] || "").replace(/\s/g, "")),
        // Для "Доставка" себестоимость не учитываем в сумме, поэтому 0
        costTotal: name === "Доставка" ? 0 : Number(row[4]) || 0,
      });
    }
  });

  const mergedMap = new Map();
  let delivery = null;

  allItems.forEach((item) => {
    if (item.name === "Доставка") {
      if (delivery) {
        delivery.quantity += item.quantity;
        delivery.price += item.price;
        delivery.costTotal += item.costTotal;
      } else {
        delivery = { ...item };
      }
      return;
    }

    const key = `${item.name.toLowerCase()}__${item.price}`;
    if (mergedMap.has(key)) {
      const ex = mergedMap.get(key);
      ex.quantity += item.quantity;
      ex.costTotal += item.costTotal;
    } else {
      mergedMap.set(key, { ...item });
    }
  });

  const merged = Array.from(mergedMap.values());
  if (delivery) merged.push(delivery);

  const totalPriceCost = allItems.reduce((sum, i) => sum + i.costTotal, 0);

  return { merged, totalPriceCost };
}

export async function submitOrder(
  token,
  orderProform,
  selectedItems,
  setError,
  setIsSubmitting,
  setSubmissionStatus,
  setDownloadUrl,
  isEditingExisting,
  convertToInvoice
) {
  setError(null);
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

  const isBravoPlus = orderProform.buyer.trim() === "ЗАО 'Браво Плюс'";
  
  const spreadsheetId = orderProform.orderType === "Накладная"
    ? import.meta.env.VITE_SPREADSHEET_ID
    : import.meta.env.VITE_PERIOD_SPREADSHEET_ID;

  let sheetId;
  let sheetTitle;

  let itemsToUse = selectedItems;

  let documentTypeTitle = "Накладная";
  if (isBravoPlus && !convertToInvoice) {
    documentTypeTitle = "Счет на оплату";
  }

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
          .join("."),
        orderProform.buyer,
        orderProform.constructionName
      );
    } catch (e) {
      setError("Ошибка при сборе товаров по периоду: " + translateGoogleError(e.message));
      setIsSubmitting(false);
      return;
    }
  }

  const totalSum = (
    orderProform.orderType === "Накладная" ? itemsToUse : itemsToUse.merged
  ).reduce((sum, item) => {
    return (
      sum +
      Math.round(
        orderProform.orderType === "Накладная"
          ? item.name === "Доставка"
            ? +item.price
            : item.price * item.quantity
          : item.name !== "Доставка"
          ? item.price * item.quantity
          : item.price
      )
    );
  }, 0);

  console.log("documentTypeTitle", documentTypeTitle, isBravoPlus, !convertToInvoice)

  const orderData = {
    orderProform: `${documentTypeTitle} №${
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
    constructionName:
      orderProform.orderType === "Накладная"
        ? `Объект: ${orderProform.constructionName}`
        : "",
    bankAccount: `р/с ${orderProform.bankAccount} в ${orderProform.bankName}`,
    items: (orderProform.orderType === "Накладная"
      ? itemsToUse
      : itemsToUse.merged
    ).map((item) => ({
      name: item.name,
      price: item.name !== "Доставка" ? +item.price : null,
      measure: item.measure,
      quantity: item.quantity,
      totalPriceCost:
        orderProform.orderType === "Накладная"
          ? item.name !== "Доставка"
            ? item.costPrice * item.quantity
            : item.price
          : item.name !== "Доставка"
          ? item.costTotal || 0
          : 0,
      total: Math.round(
        orderProform.orderType === "Накладная"
          ? item.name === "Доставка"
            ? +item.price
            : item.price * item.quantity
          : item.name !== "Доставка"
          ? item.price * item.quantity
          : item.price
      ),
    })),
    totalPriceCost: itemsToUse.totalPriceCost,
    totalSum: `Итого к оплате: ${convertNumberToWordsRu(Math.round(totalSum), {
      currency: {
        currencyNameCases: ["сом", "сом", "сом"],
        fractionalPartNameCases: ["тыйын", "тыйын", "тыйын"],
      },
      showNumberParts: {
        integer: true,
        fractional: false,
      },
    })}`,
  };

  // Подготавливаем/находим лист для записи
  if (isEditingExisting) {
    // Редактирование: ищем существующий лист по номеру
    const metaResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers: { Authorization: `Bearer ${validToken}` } }
    );
    const meta = await metaResp.json();
    const sheets = meta.sheets || [];

    const existingSheet = sheets.find((s) => {
      const title = s.properties.title;
      return title.includes(`№${orderProform.proformNumber}`);
    });

    if (!existingSheet) {
      setError(
        `Лист накладной №${orderProform.proformNumber} не найден для редактирования`
      );
      setIsSubmitting(false);
      return;
    }

    sheetId = existingSheet.properties.sheetId;
    sheetTitle = existingSheet.properties.title;

    console.log(
      `Редактируем существующий лист: ${sheetTitle} (ID: ${sheetId})`
    );
  } else {
    // Создание новой накладной/счета: сначала проверяем, что номер ещё не используется
    const metaResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers: { Authorization: `Bearer ${validToken}` } }
    );

    const meta = await metaResp.json();
    const sheets = meta.sheets || [];

    const existingSheet = sheets.find((s) => {
      const title = s.properties.title;
      return title.includes(`№${orderProform.proformNumber}`);
    });

    if (existingSheet) {
      setError(
        `${orderProform.orderType} №${orderProform.proformNumber} уже существует`
      );
      setIsSubmitting(false);
      return;
    }

    // Создаём новый лист
    const createResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
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
                    (orderProform.orderType === "Счет на оплату" || orderProform.buyer === "ЗАО 'Браво Плюс'")
                      ? orderData.orderProform.slice(15)
                      : orderData.orderProform.slice(10),
                  gridProperties: { rowCount: 300, columnCount: 6 },
                },
              },
            },
          ],
        }),
      }
    );

    const createResult = await createResponse.json();
    if (!createResponse.ok) {
      const errorMsg = translateGoogleError(createResult.error?.status || JSON.stringify(createResult));
      throw new Error(JSON.stringify({ error: { message: errorMsg } }));
    }

    sheetId = createResult.replies[0].addSheet.properties.sheetId;
    sheetTitle = createResult.replies[0].addSheet.properties.title;
  }

  console.log("orderData", orderData);

  try {
    // 0. При редактировании очищаем содержимое листа, чтобы не осталось старых строк
    if (isEditingExisting && sheetTitle) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
          sheetTitle
        )}'!A1:G300:clear`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        }
      );
    }

    // 1. Подготовка данных
    const orderedOrderItems = [
      ...orderData.items.filter(
        (i) => i.name && i.name.trim() !== "Доставка"
      ),
      ...orderData.items.filter(
        (i) => i.name && i.name.trim() === "Доставка"
      ),
    ];

    const items = orderedOrderItems.map((item, index) => [
      index + 1,
      item.name,
      item.measure,
      item.quantity,
      item.price,
      item.totalPriceCost,
      item.total,
    ]);

    const totalSumInDigits = orderedOrderItems.reduce(
      (sum, item) => sum + item.total,
      0
    );

    const totalCostSumInDigits =
      orderProform.orderType !== "Накладная"
        ? itemsToUse.totalPriceCost
        : orderedOrderItems.reduce(
            (sum, item) =>
              sum + (item.name !== "Доставка" ? item.totalPriceCost : 0),
            0
          );

    const totalRow = 11 + items.length;

    // 2. Формируем все запросы на обновление содержимого листа
    const requests = [
      {
        unmergeCells: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 100, 
            startColumnIndex: 0,
            endColumnIndex: 6
          }
        }
      },
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
                    stringValue:
                      orderProform.orderType === "Накладная"
                        ? orderData.constructionName
                        : `Объект: ${orderProform.constructionName}`,
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
            endRowIndex: 10 + orderedOrderItems.length,
            startColumnIndex: 0,
            endColumnIndex: 6,
          },
          rows: orderedOrderItems.map((item, index) => ({
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
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
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
    if (!formatResponse.ok) {
      const errorMsg = translateGoogleError(formatResult.error?.message || JSON.stringify(formatResult));
      throw new Error(JSON.stringify({ error: { message: errorMsg } }));
    }

    // 5. Добавляем запись в Реестр
    try {
      const registrySpreadsheetId = orderProform.orderType === "Накладная"
        ? import.meta.env.VITE_LIST_SPREADSHEET_ID
        : import.meta.env.VITE_LIST_PERIOD_SPREADSHEET_ID;
        
      const proformListResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${registrySpreadsheetId}/values/Реестр!A:G`,
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        }
      );

      const proformListData = await proformListResponse.json();
      if (!proformListResponse.ok) {
        const errorMsg = translateGoogleError(proformListData.error?.message || JSON.stringify(proformListData));
        throw new Error(JSON.stringify({ error: { message: errorMsg } }));
      }

      const nextRow =
        orderProform.orderType === "Накладная"
          ? Math.max(6, (proformListData.values?.length || 5) + 1)
          : Math.max(4, (proformListData.values?.length || 3) + 1);

      // Если редактируем — пытаемся найти уже существующую строку с этим номером
      const existingRowIndex = isEditingExisting
        ? (proformListData.values || []).findIndex(
            (row) => row[1] === `№${orderProform.proformNumber}`
          )
        : -1;

      const targetRowForRegistry =
        existingRowIndex !== -1
          ? existingRowIndex + 1
          : nextRow;

      const proformListRowData = [
        targetRowForRegistry - 2,
        `№${orderProform.proformNumber}`,
        (orderProform.proformDate || orderProform.orderPeriodEnd)
          .split("-")
          .reverse()
          .join("."),
        totalSumInDigits,
        totalCostSumInDigits,
        totalSumInDigits - totalCostSumInDigits,
        `${orderProform.buyer} (${orderProform.constructionName})`,
      ];

      const addToProformListResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${registrySpreadsheetId}/values/Реестр!A${targetRowForRegistry}:G${targetRowForRegistry}?valueInputOption=RAW`,
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

      if (orderProform.orderType === "Накладная") {
        const proformDate = new Date(orderProform.proformDate);
        const targetRow =
          7 + buyersList.find((buyer) => buyer.name === orderProform.buyer)?.id;
        const month = proformDate.getMonth() + 1;
        const targetColumn = monthToColumn[month];
        if (!targetColumn) {
          console.error(`Не определена колонка для месяца: ${month}`);
          return;
        }

        // 1) Прочитать текущее значение ячейки (может быть пустым)
        const getCellResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${
            import.meta.env.VITE_LIST_SPREADSHEET_ID
          }/values/Бухгалтерия!${targetColumn}${targetRow}`,
          {
            headers: {
              Authorization: `Bearer ${validToken}`,
            },
          }
        );

        let currentCellValue = 0;
        if (getCellResp.ok) {
          const getCellData = await getCellResp.json();
          const raw = getCellData?.values?.[0]?.[0];
          const parsed = parseFloat(
            String(raw).replace(/\s/g, "").replace(",", ".")
          );
          currentCellValue = Number.isFinite(parsed) ? parsed : 0;
        }

        const newSumValue = isEditingExisting
          ? currentCellValue - parseNumber(orderProform.totalSum) + totalSumInDigits
          : currentCellValue + totalSumInDigits;

        // console.log("CHECK", `${newSumValue} = ${currentCellValue} - ${parseNumber(orderProform.totalSum)} + ${totalSumInDigits}`)

        // 2) Записать новое суммарное значение
        const updateCellResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${
            import.meta.env.VITE_LIST_SPREADSHEET_ID
          }/values/Бухгалтерия!${targetColumn}${targetRow}?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${validToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              values: [[newSumValue]],
            }),
          }
        );

        if (!updateCellResp.ok) {
          throw new Error("Ошибка при обновлении Google Sheets");
        }
      }

      if (!addToProformListResponse.ok) {
        const proformListError = await addToProformListResponse.json();
        console.warn("Ошибка добавления в реестр:", proformListError);
      }

      const sheetsInfoResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${registrySpreadsheetId}`,
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
          },
        }
      );

      const sheetsInfo = await sheetsInfoResponse.json();
      if (!sheetsInfoResponse.ok) {
        const errorMsg = translateGoogleError(sheetsInfo.error?.message || JSON.stringify(sheetsInfo));
        throw new Error(JSON.stringify({ error: { message: errorMsg } }));
      }

      const proformListSheet = sheetsInfo.sheets.find(
        (sheet) => sheet.properties.title === "Реестр"
      );

      if (proformListSheet) {
        const proformListSheetId = proformListSheet.properties.sheetId;

        const borderResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${registrySpreadsheetId}:batchUpdate`,
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

    // 6. Сохраняем себестоимость в отдельный файл

    if (orderProform.orderType === "Накладная" && selectedItems.length > 0) {
      try {
        const costSpreadsheetId = import.meta.env.VITE_COST_SPREADSHEET_ID;
        if (!costSpreadsheetId) {
          console.warn(
            "VITE_COST_SPREADSHEET_ID не задан → себестоимость не сохранена"
          );
          return;
        }

        const sheetTitle = `№${orderProform.proformNumber}`;

        // 1. Получаем список листов
        const metaResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}`,
          { headers: { Authorization: `Bearer ${validToken}` } }
        );
        const meta = await metaResp.json();

        // Существует ли уже лист?
        const existingSheet = meta.sheets?.find(
          (s) => s.properties.title === sheetTitle
        );

        let costSheetId = existingSheet?.properties?.sheetId;

        // Если лист есть — очищаем его
        if (existingSheet) {
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}/values/${encodeURIComponent(
              sheetTitle
            )}!A1:Z1000:clear`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${validToken}` },
            }
          );
        }
        // Если листа нет — создаём
        else {
          const createCostResp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}:batchUpdate`,
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
                        title: sheetTitle,
                        gridProperties: { rowCount: 1000, columnCount: 3 },
                      },
                    },
                  },
                ],
              }),
            }
          );

          const createCostResult = await createCostResp.json();
          if (!createCostResp.ok) throw new Error(JSON.stringify(createCostResult));
          costSheetId =
            createCostResult.replies?.[0]?.addSheet?.properties?.sheetId;
        }

        // 2. Готовим данные — 3 столбца: Наименование, цена за ед., общая себестоимость
        const header = [
          "Наименование",
          "Себестоимость за единицу",
          "Общая себестоимость",
        ];
        const rows = selectedItems
          .filter((item) => item.name !== "Доставка" && item.costPrice > 0)
          .map((item) => [
            item.name,
            item.costPrice,
            item.costPrice * item.quantity,
          ]);

        const totalCost = rows.reduce(
          (sum, row) => sum + (Number(row[2]) || 0),
          0
        );

        const dataToWrite = [header, ...rows, ["Итого", "", totalCost]];

        // 3. Записываем (перезаписываем полностью)
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}/values/${encodeURIComponent(
            sheetTitle
          )}!A1?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${validToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              values: dataToWrite,
            }),
          }
        );

        // 4. Добавляем стили: границы для всего диапазона и жирный курсив для заголовков и итога
        if (typeof costSheetId === "number") {
          const totalRows = dataToWrite.length; // включая заголовок и строку "Итого"

          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}:batchUpdate`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${validToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                requests: [
                  // Сбрасываем форматирование текста во всём рабочем диапазоне,
                  // чтобы не оставался жирный/курсив от старых версий
                  {
                    repeatCell: {
                      range: {
                        sheetId: costSheetId,
                        startRowIndex: 0,
                        endRowIndex: 1000,
                        startColumnIndex: 0,
                        endColumnIndex: 3,
                      },
                      cell: {
                        userEnteredFormat: {
                          textFormat: {
                            bold: false,
                            italic: false,
                          },
                        },
                      },
                      fields: "userEnteredFormat.textFormat",
                    },
                  },
                  // Границы для всего диапазона A1:C{totalRows}
                  {
                    updateBorders: {
                      range: {
                        sheetId: costSheetId,
                        startRowIndex: 0,
                        endRowIndex: totalRows,
                        startColumnIndex: 0,
                        endColumnIndex: 3,
                      },
                      top: { style: "SOLID", width: 1 },
                      bottom: { style: "SOLID", width: 1 },
                      left: { style: "SOLID", width: 1 },
                      right: { style: "SOLID", width: 1 },
                      innerHorizontal: { style: "SOLID", width: 1 },
                      innerVertical: { style: "SOLID", width: 1 },
                    },
                  },
                  // Жирный курсив для строки заголовков (первая строка)
                  {
                    updateCells: {
                      range: {
                        sheetId: costSheetId,
                        startRowIndex: 0,
                        endRowIndex: 1,
                        startColumnIndex: 0,
                        endColumnIndex: 3,
                      },
                      rows: [
                        {
                          values: [
                            {
                              userEnteredFormat: {
                                textFormat: {
                                  bold: true,
                                  italic: true,
                                },
                              },
                            },
                            {
                              userEnteredFormat: {
                                textFormat: {
                                  bold: true,
                                  italic: true,
                                },
                              },
                            },
                            {
                              userEnteredFormat: {
                                textFormat: {
                                  bold: true,
                                  italic: true,
                                },
                              },
                            },
                          ],
                        },
                      ],
                      fields: "userEnteredFormat.textFormat",
                    },
                  },
                  // Жирный курсив для строки "Итого"
                  {
                    updateCells: {
                      range: {
                        sheetId: costSheetId,
                        startRowIndex: totalRows - 1,
                        endRowIndex: totalRows,
                        startColumnIndex: 0,
                        endColumnIndex: 3,
                      },
                      rows: [
                        {
                          values: [
                            {
                              userEnteredFormat: {
                                textFormat: {
                                  bold: true,
                                  italic: true,
                                },
                              },
                            },
                            {},
                            {
                              userEnteredFormat: {
                                textFormat: {
                                  bold: true,
                                  italic: true,
                                },
                              },
                            },
                          ],
                        },
                      ],
                      fields: "userEnteredFormat.textFormat",
                    },
                  },
                ],
              }),
            }
          );
        }

        console.log(
          `Себестоимости успешно пересохранены в лист "${sheetTitle}" (${rows.length} позиций)`
        );
      } catch (costErr) {
        console.error("Ошибка сохранения себестоимостей:", costErr);
        // Можно не показывать пользователю, чтобы не отвлекать
      }
    }

    const excelDownloadUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx&gid=${sheetId}`;
    setDownloadUrl(excelDownloadUrl);
    setSubmissionStatus(
      isEditingExisting
        ? `${orderProform.orderType} успешно изменен${orderProform.orderType === "Накладная" ? "а" : ""}!`
        : `${orderProform.orderType} успешно создан${orderProform.orderType === "Накладная" ? "а" : ""}!`
    );
    return {
      sheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`,
      fileName: `${orderProform.buyer} - №${orderProform.proformNumber} от ${
        orderProform.proformDate || orderProform.orderPeriodEnd
      }.xlsx`,
    };
  } catch (error) {
    console.error("Error creating order sheet:", error);
    let errorMessage = "Произошла ошибка при сохранении";
    try {
      const errorData = typeof error.message === 'string' ? JSON.parse(error.message) : error;
      const rawMessage = errorData.error?.message || error.message || JSON.stringify(error);
      errorMessage = translateGoogleError(rawMessage);
      
      if (rawMessage.toLowerCase().includes("already exists")) {
        const docType = orderProform.buyer.trim() === 'ЗАО "Браво Плюс"' ? "Счет на оплату" : orderProform.orderType;
        errorMessage = `${docType} с таким названием уже существует. Пожалуйста, измените название и попробуйте снова.`;
      }
    } catch (error) {
      errorMessage = translateGoogleError(error.message || "Неизвестная ошибка");
    }
    setError(errorMessage);
    setIsSubmitting(false);
  } finally {
    setIsSubmitting(false);
  }
}

export function validateForm(
  orderProform,
  orderType,
  iinError,
  bankAccountError
) {
  const required = {
    buyer: !!orderProform.buyer.trim(),
    iin: !!orderProform.iin.trim() && !iinError,
    bankAccount: !!orderProform.bankAccount.trim() && !bankAccountError,
    bankName: !!orderProform.bankName.trim(),
    proformNumber: !!orderProform.proformNumber.trim(),
  };

  if (orderType === "Накладная") {
    required.proformDate = !!orderProform.proformDate.trim();
    required.constructionName = !!orderProform.constructionName.trim();
  } else {
    required.orderPeriodStart = !!orderProform.orderPeriodStart.trim();
    required.orderPeriodEnd = !!orderProform.orderPeriodEnd.trim();
  }

  return Object.values(required).every(Boolean);
}

export async function loadInvoice(
  token,
  loadProform,
  setOrderProform,
  setSelectedItems,
  setError,
  setModalOpen,
  setIsLoadingInvoice,
  setIsEditingExisting
) {
  setIsLoadingInvoice(true); // ← включаем лоадер сразу
  setError(null);
  try {
    if (!loadProform?.trim()) {
      setError("Введите номер накладной");
      return;
    }

    const mainSpreadsheetId = import.meta.env.VITE_SPREADSHEET_ID; // основной файл с накладными
    const costSpreadsheetId = import.meta.env.VITE_COST_SPREADSHEET_ID; // файл с себестоимостями

    if (!costSpreadsheetId) {
      console.warn("VITE_COST_SPREADSHEET_ID не задан в .env");
    }

    // ─── 1. Получаем список листов основного файла ──────────────────────────────
    const mainMetaResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${mainSpreadsheetId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!mainMetaResp.ok) {
      const errorMsg = translateGoogleError("Не удалось получить список листов основного файла");
      throw new Error(errorMsg);
    }

    const mainMeta = await mainMetaResp.json();
    const mainSheets = mainMeta.sheets || [];

    // Ищем лист вида "№${loadProform} от ..." или просто содержащий номер
    const targetSheet = mainSheets.find((s) => {
      const title = s?.properties?.title || "";
      return title.includes(`№${loadProform}`) || title.includes(loadProform);
    });

    if (!targetSheet) {
      setError(`Накладная №${loadProform} не найдена`);
      return;
    }

    const sheetTitle = targetSheet.properties.title;
    console.log(`Найден лист накладной: ${sheetTitle}`);

    // ─── 2. Читаем информацию о покупателе (A5:A8) ──────────────────────────────
    const buyerInfoResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${mainSpreadsheetId}/values/'${encodeURIComponent(
        sheetTitle
      )}'!A5:A8`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const buyerInfo = await buyerInfoResp.json();
    const rows = buyerInfo.values || [];

    let buyer = "",
      iin = "",
      bankAccount = "",
      bankName = "",
      constructionName = "";

    if (rows[0]?.[0]) {
      const str = rows[0][0];
      const match = str.match(/Покупатель:\s*(.+?)\s*ИНН\s*(\d+)/i);
      if (match) {
        buyer = match[1].trim();
        iin = match[2];
      }
    }

    if (rows[1]?.[0]) {
      const str = rows[1][0];
      const match = str.match(/р\/с\s*(\d+)\s*в\s*(.+)/i);
      if (match) {
        bankAccount = match[1];
        bankName = match[2].trim();
      }
    }

    if (rows[3]?.[0]) {
      constructionName = rows[3][0].replace(/^Объект:\s*/i, "").trim();
    }

    // ─── 3. Читаем таблицу товаров A11:G1000 ────────────────────────────────────
    const itemsResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${mainSpreadsheetId}/values/'${encodeURIComponent(
        sheetTitle
      )}'!A11:G1000`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const itemsData = await itemsResp.json();
    const itemRows = itemsData.values || [];

    const items = [];
    let totalSumFromSheet = null;

    for (const row of itemRows) {
      const name = (row[1] || "").trim(); // B — Наименование

      // Нашли строку "Итого"
      if (name.toLowerCase() === "итого") {
        // Сумма в соседней клетке (C, индекс 2)
        totalSumFromSheet = parseNumber(row[2]) || 0;
        break;
      }

      if (!name) continue;

      const quantity = parseNumber(row[3]); // D — Кол-во
      let price = 0;

      if (name === "Доставка") {
        price = parseNumber(row[5]); // F — Сумма для Доставки
      } else {
        price = parseNumber(row[4]); // E — Цена для обычных товаров
      }

      items.push({
        id: crypto.randomUUID(),
        name,
        measure: row[2] || "", // C — Ед. изм.
        quantity: quantity || 0,
        price: price || 0,
        costPrice: 0, // заполнится ниже из второго файла
      });
    }

    // ─── 4. Загружаем себестоимости из второго файла ────────────────────────────
    if (costSpreadsheetId && items.length > 0) {
      let costSheetTitle = `№${loadProform}`; // например "854"

      const costMetaResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!costMetaResp.ok) {
        console.warn("Не удалось получить метаданные файла себестоимостей");
      } else {
        const costMeta = await costMetaResp.json();
        const costSheets = costMeta.sheets || [];

        const costSheet = costSheets.find(
          (s) => s.properties.title === costSheetTitle
        );

        console.log("costSheet", costSheet);

        if (costSheet) {
          const costResp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}/values/'${encodeURIComponent(
              costSheetTitle
            )}'!A:B`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (costResp.ok) {
            const costData = await costResp.json();
            const costRows = costData.values || [];

            const costMap = new Map();

            // Нормализуем названия при сохранении в карту
            for (let i = 1; i < costRows.length; i++) {
              let [name, costStr] = costRows[i];
              if (!name || !costStr) continue;

              // Очень важная нормализация:
              name = String(name)
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ") // все множественные пробелы → один
                .replace(/['"«»]/g, "") // убираем кавычки
                .replace(/[.,;]$/, ""); // убираем точку/запятую в конце

              const cost = parseNumber(costStr);
              if (cost > 0) {
                costMap.set(name, cost);
              }
            }

            // То же самое нормализуем для товаров из накладной
            items.forEach((item) => {
              let normalizedName = String(item.name)
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ")
                .replace(/['"«»]/g, "")
                .replace(/[.,;]$/, "");

              if (costMap.has(normalizedName)) {
                item.costPrice = costMap.get(normalizedName);
                console.log(
                  `Применена себестоимость ${item.costPrice} для "${item.name}" (норм: "${normalizedName}")`
                );
              } else {
                console.log(
                  `Себестоимость не найдена для "${item.name}" (норм: "${normalizedName}")`
                );
              }
            });

            console.log(
              `Загружено ${costMap.size} записей себестоимости для №${loadProform}`
            );
          } else {
            console.warn("Не удалось прочитать данные из листа себестоимостей");
          }
        } else {
          setError(
            `Данные себестоимостей накладной ${costSheetTitle} не найдены`
          );
        }
      }
    }

    // ─── 5. Заполняем форму ─────────────────────────────────────────────────────
    setOrderProform((prev) => ({
      ...prev,
      orderType: "Накладная",
      proformNumber: loadProform,
      proformDate:
        sheetTitle
          .match(/от\s*(\d{2}\.\d{2}\.\d{4})/)?.[1]
          ?.split(".")
          .reverse()
          .join("-") || "",
      buyer,
      iin,
      bankAccount,
      bankName,
      constructionName,
      totalSum: totalSumFromSheet, // вставляем сумму из "Итого"
    }));

    setSelectedItems(items);
    setIsEditingExisting(true);
    //   setError(null);

    setModalOpen(false);
  } catch (err) {
    console.error("Ошибка загрузки накладной:", err);
    const errorMsg = err.message.includes("not found") || err.message.includes("404")
      ? `Накладная №${loadProform} не найдена`
      : translateGoogleError(err.message || "Ошибка при загрузке");
    setError(errorMsg);
  } finally {
    setIsLoadingInvoice(false); // ← обязательно выключаем лоадер
  }
}