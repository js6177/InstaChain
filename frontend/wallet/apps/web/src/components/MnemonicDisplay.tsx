import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface MnemonicDisplayProps {
    mnemonic: string[] | undefined;
}

export function MnemonicDisplay({ mnemonic }: MnemonicDisplayProps) {
    const [isVisible, setIsVisible] = useState(false);
    
    const mnemonicString = mnemonic?.join(" ") || "";

    const handleCopy = () => {
        if (!mnemonicString) return;
        navigator.clipboard.writeText(mnemonicString);
        toast.success("Mnemonic copied to clipboard");
    };

    const toggleVisibility = () => {
        setIsVisible(!isVisible);
    };

    return (
        <div className="flex flex-col w-full gap-2 mt-1 mb-1">
            <span className="font-semibold text-foreground whitespace-nowrap">Mnemonic Phrase:</span>
            <div className="flex flex-row items-end justify-between gap-4 p-3 bg-muted/20 border border-muted-foreground/20 rounded-md shadow-sm">
                <p className={`font-mono text-[11px] leading-relaxed break-words w-full transition-all duration-300 ${!isVisible ? "blur-sm select-none" : ""}`}>
                    {mnemonicString}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-muted-foreground hover:text-foreground" 
                        onClick={toggleVisibility}
                        title={isVisible ? "Hide Mnemonic" : "Show Mnemonic"}
                    >
                        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        <span className="sr-only">{isVisible ? "Hide Mnemonic" : "Show Mnemonic"}</span>
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-muted-foreground hover:text-foreground" 
                        onClick={handleCopy}
                        disabled={!mnemonicString}
                        title="Copy Mnemonic"
                    >
                        <Copy className="h-4 w-4" />
                        <span className="sr-only">Copy Mnemonic</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
