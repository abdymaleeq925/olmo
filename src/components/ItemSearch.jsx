import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";

export function ItemSearch({
    open,
    setOpen,
    sortedMaterialsList,
    onAddItem
}) {
    return (
        <div className="my-6 w-full flex flex-col items-center">
            <div className="w-full md:w-1/3">
                <div className="mb-4">
                    <Label htmlFor="search" className="mb-2 block">Поиск товаров</Label>
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between"
                            >
                                Выберите товар...
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] md:w-[375px] p-0 max-h-64 overflow-y-auto">
                            <Command>
                                <CommandInput placeholder="Поиск товара..." />
                                <CommandEmpty>Ничего не найдено</CommandEmpty>
                                <CommandGroup>
                                    {sortedMaterialsList.map((item) => (
                                        <CommandItem
                                            key={item.id}
                                            value={item.name}
                                            onSelect={() => {
                                                onAddItem(item);
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
            </div>
        </div>
    );
}
