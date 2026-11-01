/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@virtbase/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@virtbase/ui/drawer";
import { useMediaQuery } from "@virtbase/ui/hooks";
import type React from "react";
import { cn } from "./index.ts";

interface ResponsiveDialogProps extends React.ComponentProps<typeof Dialog> {
  title: string;
  description?: string;
  footer?: React.ReactNode;
  containerClassName?: string;
}

/**
 * A responsive dialog that uses a dialog on desktop and a drawer on mobile.
 */
export function ResponsiveDialog({
  title,
  children,
  description,
  footer,
  containerClassName,
  ...props
}: ResponsiveDialogProps) {
  const { isDesktop } = useMediaQuery();

  if (isDesktop) {
    return (
      <Dialog {...props}>
        <DialogContent className="flex flex-col gap-0 p-0">
          <DialogHeader className="contents space-y-0 text-left">
            <DialogTitle className="border-border border-b px-6 py-4">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="sr-only">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
          <div
            className={cn(
              "scrollbar-thin max-h-[80vh] overflow-y-auto px-6 py-4",
              containerClassName,
            )}
          >
            {children}
          </div>
          {footer && (
            <DialogFooter className="border-t p-4">{footer}</DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  const { open, defaultOpen, onOpenChange, modal } = props;

  return (
    <Drawer
      {...(open === undefined ? {} : { open })}
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(modal === undefined ? {} : { modal })}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-xl">{title}</DrawerTitle>
          {description && (
            <DrawerDescription className="sr-only">
              {description}
            </DrawerDescription>
          )}
        </DrawerHeader>
        <div
          className={cn(
            "scrollbar-thin overflow-y-scroll border-y px-6 py-4",
            containerClassName,
          )}
        >
          {children}
        </div>
        {footer && <DrawerFooter>{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  );
}
