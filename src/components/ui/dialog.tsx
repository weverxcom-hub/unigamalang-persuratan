"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 grid bg-background shadow-lg duration-200",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        // Mobile-first: full-screen sheet so the form remains fully reachable
        // when the on-screen keyboard expands. Body scrolls naturally; the
        // sticky DialogFooter keeps actions above the keyboard. Bottom inset
        // respects the device safe area on iOS.
        "inset-0 w-full max-w-none overflow-y-auto p-4 pb-[max(env(safe-area-inset-bottom),1rem)]",
        // Desktop (≥ sm): centered modal with capped width and height.
        "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
        "sm:w-[calc(100%-1rem)] sm:max-w-lg sm:max-h-[calc(100dvh-2rem)]",
        "sm:gap-4 sm:rounded-lg sm:border sm:p-6 sm:pb-6",
        "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // Reserve space for the absolute-positioned close button on mobile so
      // long titles don't run underneath it.
      "flex flex-col space-y-1.5 pr-8 text-center sm:pr-0 sm:text-left",
      className
    )}
    {...props}
  />
);

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // Mobile: sticky footer pinned to the bottom of the scrollable dialog
      // so the primary action is always reachable above the keyboard. The
      // negative horizontal margin makes the divider span edge-to-edge while
      // DialogContent's p-4 handles the gutter.
      "sticky bottom-0 -mx-4 mt-2 flex flex-col-reverse gap-2 border-t bg-background px-4 py-3",
      "pb-[max(env(safe-area-inset-bottom),0.75rem)]",
      // Desktop: revert to inline footer with right-aligned actions and no
      // divider/sticky positioning.
      "sm:static sm:mx-0 sm:mt-0 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2",
      "sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:pb-0",
      className
    )}
    {...props}
  />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
