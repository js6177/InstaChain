import { useState, useRef, useLayoutEffect } from "react";
import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const FitTextMethod = {
    MakeFieldMultiline: 'MakeFieldMultiline',
    ShrinkTextFontSize: 'ShrinkTextFontSize',
} as const;

export type FitTextMethod = typeof FitTextMethod[keyof typeof FitTextMethod];

interface CopyableDisplayProps {
    label?: string;
    labelClassName?: string;
    value: string | string[] | undefined;
    secret?: boolean;
    textClassName?: string;
    fitTextInView?: boolean;
    fitTextInViewMethod?: FitTextMethod;
}

export function CopyableDisplay({ 
    label, 
    labelClassName = "font-semibold text-foreground whitespace-nowrap", 
    value, 
    secret = false, 
    textClassName = "font-mono text-xl whitespace-nowrap overflow-hidden text-ellipsis",
    fitTextInView = false,
    fitTextInViewMethod = FitTextMethod.MakeFieldMultiline
}: CopyableDisplayProps) {
    const [isVisible, setIsVisible] = useState(!secret);
    const [copied, setCopied] = useState(false);
    
    const displayString = Array.isArray(value) ? value.join(" ") : (value || "");

    const handleCopy = () => {
        if (!displayString) return;
        navigator.clipboard.writeText(displayString);
        setCopied(true);
        toast.success(label ? `${label.replace(':', '')} copied to clipboard` : "Copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    const toggleVisibility = () => {
        setIsVisible(!isVisible);
    };

    const containerRef = useRef<HTMLDivElement>(null);
    const [dynamicFontSize, setDynamicFontSize] = useState<string | undefined>(undefined);

    useLayoutEffect(() => {
        if (!fitTextInView || fitTextInViewMethod !== FitTextMethod.ShrinkTextFontSize || !displayString) {
            setDynamicFontSize(undefined);
            return;
        }
        
        const updateSize = () => {
            if (!containerRef.current) return;
            const containerWidth = containerRef.current.clientWidth;
            // Assuming average monospace character ratio of ~0.6 width/height.
            // Max available font size (in pixels) = ContainerWidth / (StringLength * 0.6)
            // We use 0.61 as a small buffer so it doesn't accidentally trigger ellipsis from rounding errors
            let calculatedSize = containerWidth / (displayString.length * 0.61);
            
            // Clamp font size mathematically between extremely small (10px) and a ceiling (e.g. 24px)
            calculatedSize = Math.max(10, Math.min(calculatedSize, 24));
            setDynamicFontSize(`${calculatedSize}px`);
        };

        const ro = new ResizeObserver(updateSize);
        if (containerRef.current) {
            ro.observe(containerRef.current);
        }
        
        updateSize();
        return () => ro.disconnect();
    }, [displayString, fitTextInView, fitTextInViewMethod]);

    let appliedTextClassName = textClassName;
    let customStyle: React.CSSProperties = { userSelect: "text", WebkitUserSelect: "text", cursor: "text" };
    
    if (fitTextInView) {
        if (fitTextInViewMethod === FitTextMethod.MakeFieldMultiline) {
            appliedTextClassName = cn(textClassName, "whitespace-normal break-all overflow-visible text-clip");
        } else if (fitTextInViewMethod === FitTextMethod.ShrinkTextFontSize) {
            // Strip out explicitly set large sizes from the base string first just in case
            const stripped = textClassName.replace(/\btext-(lg|xl|2xl|3xl|4xl|5xl|base)\b/g, "");
            appliedTextClassName = cn(stripped, "tracking-tighter");
            // Apportion the manually calculated optimal dynamic font size
            customStyle = { ...customStyle, fontSize: dynamicFontSize || "16px" };
        }
    }

    return (
        <div className="flex flex-col w-full gap-2 mt-1 mb-1 min-w-0">
            {label && <span className={labelClassName}>{label}</span>}
            <div className="flex flex-row items-center justify-between gap-4 p-3 bg-muted/20 border rounded-md shadow-sm overflow-hidden min-w-0">
                <div ref={containerRef} className="min-w-0 flex-1 overflow-hidden">
                    <p 
                        className={cn(appliedTextClassName, `w-full text-foreground transition-all duration-300 ${secret && !isVisible ? "blur-sm select-none" : ""}`)}
                        style={customStyle}
                    >
                        {displayString || "Loading..."}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {secret && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-foreground" 
                            onClick={toggleVisibility}
                            title={isVisible ? `Hide ${label || 'secret'}` : `Show ${label || 'secret'}`}
                        >
                            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            <span className="sr-only">{isVisible ? "Hide" : "Show"}</span>
                        </Button>
                    )}
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0" 
                        onClick={handleCopy}
                        disabled={!displayString}
                        title={`Copy ${label || 'value'}`}
                    >
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        <span className="sr-only">Copy</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
