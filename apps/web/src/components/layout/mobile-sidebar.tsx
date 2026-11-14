import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sidebar } from "./sidebar";

interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="w-[300px] border-r border-border/80 p-0 data-[state=open]:animate-slide-in-left"
      >
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <DialogDescription className="sr-only">
          Navigate between the QueuePilot workspace sections.
        </DialogDescription>
        <Sidebar className="h-full" onNavigate={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
