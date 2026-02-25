import { convert as convertNumberToWordsRu } from "number-to-words-ru";
import { buyersList, monthToColumn } from "../materialData";
import {
    parseDate,
    parseNumber,
    extractBuyerName,
    extractConstructionName,
    translateGoogleError
} from "./formatters";
import { refreshToken } from "./google-api";

export async function aggregateItemsFromPeriod(
    token,
    periodStart,
    periodEnd,
    buyerName,
    constructionName,
) {
    const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID;

    const sheetsInfoResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );

    const sheetsInfo = await sheetsInfoResponse.json();

    if (!sheetsInfoResponse.ok) {
        const errorMsg = translateGoogleError(
            sheetsInfo.error?.message || JSON.stringify(sheetsInfo),
        );
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
                title,
            )}'!A5:A8`,
            { headers: { Authorization: `Bearer ${token}` } },
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
                title,
            )}'!B11:G1000`,
            { headers: { Authorization: `Bearer ${token}` } },
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

async function getOrCreateSheet(token, spreadsheetId, proformNumber, orderType, title) {
    const metaResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    const meta = await metaResp.json();
    const sheets = meta.sheets || [];

    const existingSheet = sheets.find((s) => s.properties.title.includes(`№${proformNumber}`));

    if (existingSheet) {
        return {
            sheetId: existingSheet.properties.sheetId,
            sheetTitle: existingSheet.properties.title,
            existed: true
        };
    }

    const createResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title,
                                gridProperties: { rowCount: 300, columnCount: 6 },
                            },
                        },
                    },
                ],
            }),
        },
    );

    const createResult = await createResponse.json();
    if (!createResponse.ok) {
        throw new Error(translateGoogleError(createResult.error?.status || JSON.stringify(createResult)));
    }

    return {
        sheetId: createResult.replies[0].addSheet.properties.sheetId,
        sheetTitle: createResult.replies[0].addSheet.properties.title,
        existed: false
    };
}

function getFormattingRequests(sheetId, orderData, orderProform, items, totalSumInDigits, totalRow) {
    return [
        { unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: 6 } } },
        { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
        {
            updateCells: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
                rows: [{ values: [{ userEnteredValue: { stringValue: orderData.orderProform }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 14 }, horizontalAlignment: "LEFT" } }] }],
                fields: "userEnteredValue,userEnteredFormat",
            },
        },
        {
            updateCells: {
                range: { sheetId, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 6 },
                rows: [
                    {
                        values: [
                            {
                                userEnteredValue: { stringValue: "Поставщик: ИП Женишбек у.Ж. ИНН 22712200100929 р/с 1240040001978972" },
                                userEnteredFormat: { textFormat: { fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "LEFT" },
                                textFormatRuns: [{ startIndex: 0, format: { bold: false } }, { startIndex: 10, format: { bold: true } }],
                            },
                        ],
                    },
                    {
                        values: [
                            {
                                userEnteredValue: { stringValue: 'в ОАО "Бакай Банк", БИК 124029' },
                                userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "LEFT" },
                            },
                        ],
                    },
                ],
                fields: "userEnteredValue,userEnteredFormat,textFormatRuns",
            },
        },
        {
            updateCells: {
                range: { sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 6 },
                rows: [
                    {
                        values: [
                            {
                                userEnteredValue: { stringValue: orderData.buyer },
                                userEnteredFormat: { textFormat: { bold: false, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "LEFT" },
                                textFormatRuns: [{ startIndex: 0, format: { bold: false } }, { startIndex: 11, format: { bold: true } }],
                            },
                        ],
                    },
                    {
                        values: [
                            {
                                userEnteredValue: { stringValue: orderData.bankAccount },
                                userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "LEFT" },
                            },
                        ],
                    },
                ],
                fields: "userEnteredValue,userEnteredFormat,textFormatRuns",
            },
        },
        {
            updateCells: {
                range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 6 },
                rows: [
                    {
                        values: [
                            {
                                userEnteredValue: { stringValue: orderProform.orderType === "Накладная" ? orderData.constructionName : `Объект: ${orderProform.constructionName}` },
                                userEnteredFormat: { textFormat: { bold: false, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "LEFT" },
                                textFormatRuns: [{ startIndex: 0, format: { bold: false } }, { startIndex: 7, format: { bold: true } }],
                            },
                        ],
                    },
                ],
                fields: "userEnteredValue,userEnteredFormat,textFormatRuns",
            },
        },
        {
            updateCells: {
                range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 6 },
                rows: [
                    {
                        values: [
                            { userEnteredValue: { stringValue: "№" }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER" } },
                            { userEnteredValue: { stringValue: "Наименование" }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER" } },
                            { userEnteredValue: { stringValue: "Ед. изм." }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER" } },
                            { userEnteredValue: { stringValue: "Кол-во" }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER" } },
                            { userEnteredValue: { stringValue: "Цена" }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER" } },
                            { userEnteredValue: { stringValue: "Сумма" }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER" } },
                        ],
                    },
                ],
                fields: "userEnteredValue,userEnteredFormat",
            },
        },
        {
            updateCells: {
                range: { sheetId, startRowIndex: 10, endRowIndex: 10 + items.length, startColumnIndex: 0, endColumnIndex: 6 },
                rows: items.map((item, index) => ({
                    values: [
                        { userEnteredValue: { numberValue: index + 1 }, userEnteredFormat: { textFormat: { fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER" } },
                        { userEnteredValue: { stringValue: item[1] }, userEnteredFormat: { textFormat: { fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "LEFT" } },
                        { userEnteredValue: { stringValue: item[2] }, userEnteredFormat: { textFormat: { fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER" } },
                        { userEnteredValue: { numberValue: item[3] }, userEnteredFormat: { textFormat: { fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER" } },
                        { userEnteredValue: { numberValue: item[4] }, userEnteredFormat: { textFormat: { fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER" } },
                        { userEnteredValue: { numberValue: item[6] }, userEnteredFormat: { textFormat: { fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "CENTER", numberFormat: { type: "NUMBER", pattern: "# ##0" } } },
                    ],
                })),
                fields: "userEnteredValue,userEnteredFormat",
            },
        },
        { mergeCells: { range: { sheetId, startRowIndex: totalRow - 1, endRowIndex: totalRow, startColumnIndex: 2, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
        {
            updateCells: {
                range: { sheetId, startRowIndex: totalRow - 1, endRowIndex: totalRow, startColumnIndex: 0, endColumnIndex: 6 },
                rows: [
                    {
                        values: [
                            {},
                            { userEnteredValue: { stringValue: "Итого" }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "LEFT" } },
                            { userEnteredValue: { numberValue: totalSumInDigits }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "RIGHT", numberFormat: { type: "NUMBER", pattern: '# ##0" сом"' } } },
                            {}, {}, {},
                        ],
                    },
                ],
                fields: "userEnteredValue,userEnteredFormat",
            },
        },
        { mergeCells: { range: { sheetId, startRowIndex: totalRow + 1, endRowIndex: totalRow + 2, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
        {
            updateCells: {
                range: { sheetId, startRowIndex: totalRow + 1, endRowIndex: totalRow + 2, startColumnIndex: 0, endColumnIndex: 6 },
                rows: [{ values: [{ userEnteredValue: { stringValue: orderData.totalSum }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "LEFT" } }] }],
                fields: "userEnteredValue,userEnteredFormat(textFormat,horizontalAlignment)",
            },
        },
        { mergeCells: { range: { sheetId, startRowIndex: totalRow + 3, endRowIndex: totalRow + 4, startColumnIndex: 0, endColumnIndex: 4 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: totalRow + 3, endRowIndex: totalRow + 4, startColumnIndex: 4, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
        {
            updateCells: {
                range: { sheetId, startRowIndex: totalRow + 3, endRowIndex: totalRow + 4, startColumnIndex: 0, endColumnIndex: 4 },
                rows: [{ values: [{ userEnteredValue: { stringValue: orderProform.orderType === "Счет на оплату" ? "Руководитель" : "Сдал:" }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "LEFT" } }] }],
                fields: "userEnteredValue,userEnteredFormat",
            },
        },
        {
            updateCells: {
                range: { sheetId, startRowIndex: totalRow + 3, endRowIndex: totalRow + 4, startColumnIndex: 4, endColumnIndex: 6 },
                rows: [{ values: [{ userEnteredValue: { stringValue: orderProform.orderType === "Счет на оплату" ? "Женишбек у. Ж" : "Принял:" }, userEnteredFormat: { textFormat: { bold: true, fontFamily: "Times New Roman", fontSize: 12 }, horizontalAlignment: "LEFT" } }] }],
                fields: "userEnteredValue,userEnteredFormat",
            },
        },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 30 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 330 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 60 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 120 }, fields: "pixelSize" } },
        {
            updateBorders: {
                range: { sheetId, startRowIndex: 9, endRowIndex: 10 + items.length + 1, startColumnIndex: 0, endColumnIndex: 6 },
                top: { style: "SOLID", width: 1 }, bottom: { style: "SOLID", width: 1 }, left: { style: "SOLID", width: 1 }, right: { style: "SOLID", width: 1 },
                innerHorizontal: { style: "SOLID", width: 1 }, innerVertical: { style: "SOLID", width: 1 },
            },
        },
    ];
}

async function updateRegistry(token, orderProform, totalSumInDigits, totalCostSumInDigits, isEditingExisting) {
    const registrySpreadsheetId = orderProform.orderType === "Накладная"
        ? import.meta.env.VITE_LIST_SPREADSHEET_ID
        : import.meta.env.VITE_LIST_PERIOD_SPREADSHEET_ID;

    const proformListResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${registrySpreadsheetId}/values/Реестр!A:G`,
        { headers: { Authorization: `Bearer ${token}` } },
    );

    const proformListData = await proformListResponse.json();
    if (!proformListResponse.ok) return;

    const nextRow = orderProform.orderType === "Накладная"
        ? Math.max(6, (proformListData.values?.length || 5) + 1)
        : Math.max(4, (proformListData.values?.length || 3) + 1);

    const existingRowIndex = isEditingExisting
        ? (proformListData.values || []).findIndex((row) => row[1] === `№${orderProform.proformNumber}`)
        : -1;

    const targetRow = existingRowIndex !== -1 ? existingRowIndex + 1 : nextRow;

    const rowData = [
        targetRow - 2,
        `№${orderProform.proformNumber}`,
        (orderProform.proformDate || orderProform.orderPeriodEnd).split("-").reverse().join("."),
        totalSumInDigits,
        totalCostSumInDigits,
        totalSumInDigits - totalCostSumInDigits,
        `${orderProform.buyer} (${orderProform.constructionName})`,
    ];

    await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${registrySpreadsheetId}/values/Реестр!A${targetRow}:G${targetRow}?valueInputOption=RAW`,
        {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [rowData] }),
        },
    );

    if (orderProform.orderType === "Накладная") {
        const proformDate = new Date(orderProform.proformDate);
        const buyerRow = 7 + (buyersList.find((buyer) => buyer.name === orderProform.buyer)?.id || 0);
        const month = proformDate.getMonth() + 1;
        const targetColumn = monthToColumn[month];

        if (targetColumn) {
            const getCellResp = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${import.meta.env.VITE_LIST_SPREADSHEET_ID}/values/Бухгалтерия!${targetColumn}${buyerRow}`,
                { headers: { Authorization: `Bearer ${token}` } },
            );

            let currentCellValue = 0;
            if (getCellResp.ok) {
                const getCellData = await getCellResp.json();
                currentCellValue = parseNumber(getCellData?.values?.[0]?.[0]);
            }

            const newSumValue = isEditingExisting
                ? currentCellValue - parseNumber(orderProform.totalSum) + totalSumInDigits
                : currentCellValue + totalSumInDigits;

            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${import.meta.env.VITE_LIST_SPREADSHEET_ID}/values/Бухгалтерия!${targetColumn}${buyerRow}?valueInputOption=RAW`,
                {
                    method: "PUT",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ values: [[newSumValue]] }),
                },
            );
        }
    }
}

async function saveCostData(token, orderProform, selectedItems) {
    const costSpreadsheetId = import.meta.env.VITE_COST_SPREADSHEET_ID;
    if (!costSpreadsheetId || selectedItems.length === 0) return;

    const sheetTitle = `№${orderProform.proformNumber}`;
    const metaResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    const meta = await metaResp.json();
    const existingSheet = meta.sheets?.find((s) => s.properties.title === sheetTitle);

    let costSheetId = existingSheet?.properties?.sheetId;

    if (existingSheet) {
        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}/values/${encodeURIComponent(sheetTitle)}!A1:Z1000:clear`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        );
    } else {
        const createCostResp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}:batchUpdate`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    requests: [{ addSheet: { properties: { title: sheetTitle, gridProperties: { rowCount: 1000, columnCount: 3 } } } }],
                }),
            },
        );
        const createCostResult = await createCostResp.json();
        costSheetId = createCostResult.replies?.[0]?.addSheet?.properties?.sheetId;
    }

    const header = ["Наименование", "Себестоимость за единицу", "Общая себестоимость"];
    const rows = selectedItems
        .filter((item) => item.name !== "Доставка" && item.costPrice > 0)
        .map((item) => [item.name, item.costPrice, item.costPrice * item.quantity]);
    const totalCost = rows.reduce((sum, row) => sum + (Number(row[2]) || 0), 0);
    const dataToWrite = [header, ...rows, ["Итого", "", totalCost]];

    await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}/values/${encodeURIComponent(sheetTitle)}!A1?valueInputOption=RAW`,
        {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: dataToWrite }),
        },
    );

    if (typeof costSheetId === "number") {
        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}:batchUpdate`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    requests: [
                        {
                            repeatCell: {
                                range: { sheetId: costSheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 3 },
                                cell: { userEnteredFormat: { textFormat: { bold: false, italic: false } } },
                                fields: "userEnteredFormat.textFormat",
                            },
                        },
                        {
                            updateBorders: {
                                range: { sheetId: costSheetId, startRowIndex: 0, endRowIndex: dataToWrite.length, startColumnIndex: 0, endColumnIndex: 3 },
                                top: { style: "SOLID", width: 1 }, bottom: { style: "SOLID", width: 1 }, left: { style: "SOLID", width: 1 }, right: { style: "SOLID", width: 1 },
                                innerHorizontal: { style: "SOLID", width: 1 }, innerVertical: { style: "SOLID", width: 1 },
                            },
                        }
                    ],
                }),
            },
        );
    }
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
    convertToInvoice,
) {
    setError(null);
    let validToken = token;
    const expiryTime = localStorage.getItem("google_token_expiry");

    if (!expiryTime || parseInt(expiryTime, 10) - Date.now() < 30000) {
        const newTokenData = await refreshToken();
        if (!newTokenData?.access_token) {
            setError("Сессия истекла. Пожалуйста, авторизуйтесь снова.");
            return;
        }
        validToken = newTokenData.access_token;
    }
    setIsSubmitting(true);
    setSubmissionStatus("");
    setDownloadUrl("");

    const isPreProform = ["ЗАО 'Браво Плюс'", "Артис Строй Констракшн"].includes(orderProform.buyer.trim());
    const spreadsheetId = orderProform.orderType === "Накладная"
        ? import.meta.env.VITE_SPREADSHEET_ID
        : import.meta.env.VITE_PERIOD_SPREADSHEET_ID;

    let itemsToUse = selectedItems;
    let documentTypeTitle = isPreProform && !convertToInvoice ? "Счет на оплату" : "Накладная";

    if (orderProform.orderType === "Счет на оплату") {
        try {
            const start = orderProform.orderPeriodStart.split("-").reverse().join(".");
            const end = orderProform.orderPeriodEnd.split("-").reverse().join(".");
            itemsToUse = await aggregateItemsFromPeriod(validToken, start, end, orderProform.buyer, orderProform.constructionName);
        } catch (e) {
            setError("Ошибка при сборе товаров: " + translateGoogleError(e.message));
            setIsSubmitting(false);
            return;
        }
    }

    const currentItems = orderProform.orderType === "Накладная" ? itemsToUse : itemsToUse.merged;
    const totalSum = currentItems.reduce((sum, item) => {
        const p = item.name === "Доставка" ? +item.price : item.price * item.quantity;
        return sum + Math.round(p);
    }, 0);

    const orderData = {
        orderProform: `${documentTypeTitle} №${orderProform.proformNumber} от ${(orderProform.proformDate || orderProform.orderPeriodEnd).split("-").reverse().join(".")} г.`,
        buyer: `Покупатель: ${orderProform.buyer} ИНН ${orderProform.iin}`,
        constructionName: orderProform.orderType === "Накладная" ? `Объект: ${orderProform.constructionName}` : "",
        bankAccount: `р/с ${orderProform.bankAccount} в ${orderProform.bankName}`,
        items: currentItems.map((item) => ({
            name: item.name,
            measure: item.measure,
            quantity: item.quantity,
            price: item.name !== "Доставка" ? +item.price : null,
            totalPriceCost: orderProform.orderType === "Накладная"
                ? (item.name !== "Доставка" ? item.costPrice * item.quantity : item.price)
                : (item.name !== "Доставка" ? item.costTotal || 0 : 0),
            total: Math.round(item.name === "Доставка" ? +item.price : item.price * item.quantity),
        })),
        totalSum: `Итого к оплате: ${convertNumberToWordsRu(Math.round(totalSum), {
            currency: { currencyNameCases: ["сом", "сом", "сом"], fractionalPartNameCases: ["тыйын", "тыйын", "тыйын"] },
            showNumberParts: { integer: true, fractional: false },
        })}`,
    };

    try {
        const sheetTitlePrefix = orderProform.orderType === "Счет на оплату" || isPreProform ? orderData.orderProform.slice(15) : orderData.orderProform.slice(10);
        const { sheetId, sheetTitle, existed } = await getOrCreateSheet(validToken, spreadsheetId, orderProform.proformNumber, orderProform.orderType, sheetTitlePrefix);

        if (!isEditingExisting && existed) {
            setError(`${orderProform.orderType} №${orderProform.proformNumber} уже существует`);
            setIsSubmitting(false);
            return;
        }

        if (isEditingExisting && !existed) {
            setError(`Лист №${orderProform.proformNumber} не найден`);
            setIsSubmitting(false);
            return;
        }

        if (isEditingExisting) {
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(sheetTitle)}'!A1:G300:clear`,
                { method: "POST", headers: { Authorization: `Bearer ${validToken}` } });
        }

        const orderedItems = [
            ...orderData.items.filter((i) => i.name?.trim() !== "Доставка"),
            ...orderData.items.filter((i) => i.name?.trim() === "Доставка"),
        ];

        const values = orderedItems.map((i, idx) => [idx + 1, i.name, i.measure, i.quantity, i.price, i.totalPriceCost, i.total]);
        const totalSumInDigits = orderedItems.reduce((sum, i) => sum + i.total, 0);
        const totalCostSumInDigits = orderProform.orderType !== "Накладная" ? itemsToUse.totalPriceCost : orderedItems.reduce((sum, i) => sum + (i.name !== "Доставка" ? i.totalPriceCost : 0), 0);
        const totalRow = 11 + values.length;

        const requests = getFormattingRequests(sheetId, orderData, orderProform, values, totalSumInDigits, totalRow);
        const formatResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: "POST",
            headers: { Authorization: `Bearer ${validToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ requests }),
        });

        if (!formatResp.ok) throw new Error(translateGoogleError((await formatResp.json()).error?.message));

        await updateRegistry(validToken, orderProform, totalSumInDigits, totalCostSumInDigits, isEditingExisting);
        if (orderProform.orderType === "Накладная" && selectedItems.length > 0) {
            await saveCostData(validToken, orderProform, selectedItems);
        }

        setDownloadUrl(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx&gid=${sheetId}`);
        setSubmissionStatus(`${orderProform.orderType} успешно ${isEditingExisting ? "изменен" : "создан"}!`);
        return { sheetId };
    } catch (err) {
        console.error(err);
        setError(translateGoogleError(err.message));
    } finally {
        setIsSubmitting(false);
    }
}

export async function loadInvoice(
    token,
    loadProform,
    setOrderProform,
    setSelectedItems,
    setError,
    setModalOpen,
    setIsLoadingInvoice,
    setIsEditingExisting,
) {
    if (!loadProform) return;
    setIsLoadingInvoice(true);
    setError(null);

    try {
        const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID;
        const metaResp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        const meta = await metaResp.json();
        const sheet = meta.sheets?.find((s) => s.properties.title.includes(`№${loadProform}`));

        if (!sheet) {
            throw new Error(`Накладная №${loadProform} не найдена.`);
        }

        const title = sheet.properties.title;
        const valuesResp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
                title,
            )}'!A1:G300`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        const { values } = await valuesResp.json();

        if (!values) throw new Error("Данные не найдены.");

        const buyerLine = values[4]?.[0] || "";
        const iinMatch = buyerLine.match(/ИНН\s+(\d+)/);
        const bankLine = values[5]?.[0] || "";
        const bankMatch = bankLine.match(/р\/с\s+(\d+)\s+в\s+(.+)/);
        const objLine = values[7]?.[0] || "";

        setOrderProform((prev) => ({
            ...prev,
            orderType: "Накладная",
            proformNumber: loadProform,
            proformDate: values[0][0].match(/\d{2}\.\d{2}\.\d{4}/)?.[0].split(".").reverse().join("-") || "",
            buyer: extractBuyerName(buyerLine),
            iin: iinMatch ? iinMatch[1] : "",
            bankAccount: bankMatch ? bankMatch[1] : "",
            bankName: bankMatch ? bankMatch[2] : "",
            constructionName: extractConstructionName(objLine),
            totalSum: values.find(r => r[1] === "Итого")?.[2] || "0"
        }));

        const items = [];
        let costData = [];

        try {
            const costSpreadsheetId = import.meta.env.VITE_COST_SPREADSHEET_ID;
            const costResp = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${costSpreadsheetId}/values/'№${loadProform}'!A:C`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const costJson = await costResp.json();
            costData = costJson.values || [];
        } catch (e) {
            console.warn("Cost data not found", e);
        }

        for (let i = 10; i < values.length; i++) {
            const row = values[i];
            if (row[1] === "Итого" || !row[1]) break;
            const name = row[1];
            const costRow = costData.find(r => r[0] === name);
            items.push({
                id: Math.random().toString(36).substr(2, 9),
                name,
                measure: row[2],
                quantity: parseNumber(row[3]),
                price: name === "Доставка" ? (parseNumber(row[6]) || parseNumber(row[5])) : parseNumber(row[4]),
                costPrice: costRow ? parseNumber(costRow[1]) : 0
            });
        }

        setSelectedItems(items);
        setIsEditingExisting(true);
        setModalOpen(false);
    } catch (err) {
        setError(translateGoogleError(err.message));
    } finally {
        setIsLoadingInvoice(false);
    }
}
