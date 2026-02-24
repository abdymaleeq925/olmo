import { useState } from "react";
import { submitOrder, loadInvoice } from "../lib/order-service";
import { translateGoogleError } from "../lib/formatters";

export function useInvoiceFlow({ authState, orderProform, selectedItems, setOrderProform, setSelectedItems, ui, resetOrder }) {
    const [submission, setSubmission] = useState({ isSubmitting: false, status: null, downloadUrl: null, error: null });
    const [invoice, setInvoice] = useState({ isOpen: false, number: "", isLoading: false, isEditing: false, error: null });

    const updateSubmission = (fields) => setSubmission(prev => ({ ...prev, ...fields }));
    const updateInvoice = (fields) => setInvoice(prev => ({ ...prev, ...fields }));

    const handleSubmit = async () => {
        updateSubmission({ isSubmitting: true, error: null });
        try {
            await submitOrder(
                authState.token,
                orderProform,
                selectedItems,
                (err) => updateSubmission({ error: err }),
                (val) => updateSubmission({ isSubmitting: val }),
                (val) => updateSubmission({ status: val }),
                (val) => updateSubmission({ downloadUrl: val }),
                invoice.isEditing,
                ui.convertToInvoice
            );
        } catch (err) {
            updateSubmission({ error: translateGoogleError(err.message), isSubmitting: false });
        }
    };

    const handleLoad = async () => {
        updateInvoice({ isLoading: true, error: null });
        await loadInvoice(
            authState.token,
            invoice.number,
            setOrderProform,
            setSelectedItems,
            (err) => updateInvoice({ error: err }),
            (val) => updateInvoice({ isOpen: val }),
            (val) => updateInvoice({ isLoading: val }),
            (val) => updateInvoice({ isEditing: val })
        );
    };

    const handleReset = () => {
        resetOrder();
        updateSubmission({ isSubmitting: false, status: null, downloadUrl: null, error: null });
        updateInvoice(prev => ({ ...prev, isEditing: false }));
    };

    return {
        submission,
        invoice,
        setInvoice,
        updateInvoice,
        handleSubmit,
        handleLoad,
        handleReset
    };
}
