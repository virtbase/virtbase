/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { cn } from "@virtbase/ui";
import { Badge } from "@virtbase/ui/badge";
import { buttonVariants } from "@virtbase/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@virtbase/ui/empty";
import Link from "next/link";
import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

export function AnimatedEmptyState({
  title,
  description,
  cardContent,
  cardCount = 3,
  addButton,
  pillContent,
  learnMoreHref,
  learnMoreTarget = "_blank",
  learnMoreClassName,
  learnMoreText,
  className,
  cardClassName,
  cardContainerClassName,
}: {
  title: string;
  description: ReactNode;
  cardContent: ReactNode | ((index: number) => ReactNode);
  cardCount?: number;
  addButton?: ReactNode;
  pillContent?: string;
  learnMoreHref?: string;
  learnMoreTarget?: string;
  learnMoreClassName?: string;
  learnMoreText?: string;
  className?: string;
  cardClassName?: string;
  cardContainerClassName?: string;
}) {
  return (
    <Empty className={cn("border border-border", className)}>
      <div
        className={cn(
          "mask-[linear-gradient(transparent,black_10%,black_90%,transparent)] h-36 w-full max-w-64 animate-fade-in overflow-hidden px-4",
          cardContainerClassName,
        )}
      >
        <div
          style={{ "--scroll": "-50%" } as CSSProperties}
          className="animation-duration-[10s] flex animate-infinite-scroll-y flex-col"
        >
          {[...Array(cardCount * 2)].map((_, idx) => (
            <Card key={idx} className={cardClassName}>
              {typeof cardContent === "function"
                ? cardContent(idx % cardCount)
                : cardContent}
            </Card>
          ))}
        </div>
      </div>
      {pillContent && <Badge variant="default">{pillContent}</Badge>}
      <div className="max-w-sm text-pretty text-center">
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription className="mt-2">{description}</EmptyDescription>
      </div>
      <div className="flex items-center gap-2">
        {addButton}
        {learnMoreHref && (
          <Link
            href={learnMoreHref}
            target={learnMoreTarget}
            className={cn(
              // biome-ignore lint/nursery/noMisusedPromises: not applicable
              buttonVariants({ variant: addButton ? "outline" : "default" }),
              "flex h-9 items-center whitespace-nowrap rounded-lg border px-4 text-sm",
              learnMoreClassName,
            )}
          >
            {learnMoreText || "Learn more"}
          </Link>
        )}
      </div>
    </Empty>
  );
}

function Card({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "mt-4 flex items-center gap-3 rounded-lg border border-border bg-background p-4 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
