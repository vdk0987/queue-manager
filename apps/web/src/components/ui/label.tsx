import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("text-[0.8125rem] font-medium leading-none text-foreground", className)}
      {...props}
    />
  );
}

export { Label };
