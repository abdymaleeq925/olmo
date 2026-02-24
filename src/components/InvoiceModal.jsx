import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function InvoiceModal({
    open,
    onOpenChange,
    loadProform,
    setLoadProform,
    onLoad,
    isLoading,
    error
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Загрузить накладную</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="loadProform">Номер накладной</Label>
                        <Input
                            id="loadProform"
                            value={loadProform}
                            onChange={e => setLoadProform(e.target.value.replace(/\D/g, ""))}
                            maxLength={5}
                            placeholder="Например: 145"
                        />
                    </div>
                    <Button
                        className="w-full cursor-pointer h-10"
                        onClick={onLoad}
                        disabled={!loadProform.trim() || isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Загрузка...
                            </>
                        ) : (
                            "Загрузить"
                        )}
                    </Button>
                    {error && (
                        <p className="text-red-600 text-sm text-center">{error}</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
