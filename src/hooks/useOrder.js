import { useState, useMemo, useEffect } from "react";
import { useDebounce } from "use-debounce";
import { buyersList, materialData, sortMaterials } from "../materialData";
import { validateForm } from "../lib/formatters";

export function useOrder() {
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
    const [validation, setValidation] = useState({ iinError: null, bankAccountError: null });

    const [debouncedIin] = useDebounce(orderProform.iin, 1000);
    const [debouncedBankAccount] = useDebounce(orderProform.bankAccount, 1000);

    const filteredBuyers = useMemo(() => {
        if (!orderProform.buyer) return buyersList;
        return buyersList.filter((b) =>
            b.name.toLowerCase().includes(orderProform.buyer.toLowerCase())
        );
    }, [orderProform.buyer]);

    const sortedMaterialsList = useMemo(() => sortMaterials(materialData), []);
    const isFormValid = useMemo(() => validateForm(orderProform, selectedItems), [orderProform, selectedItems]);

    const totalSum = useMemo(() => {
        return selectedItems.reduce((sum, item) => {
            const price = Number(item.price) || 0;
            const qty = Number(item.quantity) || 0;
            return sum + (item.name !== "Доставка" ? price * qty : price);
        }, 0);
    }, [selectedItems]);

    useEffect(() => {
        if (debouncedIin) {
            setValidation(prev => ({ ...prev, iinError: /^\d{14}$/.test(debouncedIin) ? null : "ИИН — ровно 14 цифр" }));
        }
    }, [debouncedIin]);

    useEffect(() => {
        if (debouncedBankAccount) {
            setValidation(prev => ({ ...prev, bankAccountError: /^\d{16}$/.test(debouncedBankAccount) ? null : "Р/с — ровно 16 цифр" }));
        }
    }, [debouncedBankAccount]);

    const addItem = (item) => {
        setSelectedItems(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
            return [...prev, { ...item, quantity: 1, price: 0, costPrice: 0 }];
        });
    };

    const updateQuantity = (id, val) => {
        setSelectedItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Number(val) || 0 } : i));
    };

    const updatePrice = (id, val) => {
        setSelectedItems(prev => prev.map(i => i.id === id ? { ...i, price: Number(val) || 0 } : i));
    };

    const updateCostPrice = (id, val) => {
        setSelectedItems(prev => prev.map(i => i.id === id ? { ...i, costPrice: Number(val) || 0 } : i));
    };

    const removeItem = (id) => {
        setSelectedItems(prev => prev.filter(i => i.id !== id));
    };

    const updateOrderProform = (updates) => {
        setOrderProform(prev => ({ ...prev, ...(typeof updates === 'function' ? updates(prev) : updates) }));
    };

    const resetOrder = () => {
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
    };

    return {
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
    };
}
