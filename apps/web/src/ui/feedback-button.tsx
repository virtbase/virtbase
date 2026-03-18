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

"use client";

import * as Sentry from "@sentry/nextjs";
import { MessageCircleMoreIcon } from "@virtbase/ui/icons";
import { SidebarMenuButton } from "@virtbase/ui/sidebar";
import { useExtracted } from "next-intl";
import { useEffect, useRef, useState } from "react";

export default function FeedbackButton() {
  const t = useExtracted();

  const translations = {
    formTitle: t("Feedback"),
    cancelButtonLabel: t("Cancel"),
    nameLabel: t("Name"),
    addScreenshotButtonLabel: t("Add screenshot"),
    emailLabel: t("Email"),
    submitButtonLabel: t("Submit"),
    confirmButtonLabel: t("Confirm"),
    messageLabel: t("Message"),
    isRequiredLabel: t("(required)"),
    removeScreenshotButtonLabel: t("Remove screenshot"),
    successMessageText: t("Feedback sent successfully"),
    namePlaceholder: "", // Hidden
    emailPlaceholder: "", // Hidden
    messagePlaceholder: "", // Hidden
    hideToolText: t("Hide section"),
    highlightToolText: t("Highlight section"),
    removeHighlightText: t("Remove section"),
  } as const;

  const [feedback, setFeedback] = useState<ReturnType<
    typeof Sentry.getFeedback
  > | null>(null);
  // Read `getFeedback` on the client only, to avoid hydration errors during server rendering
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

    // Lazy load feedback integration only for this button
    void import("@sentry/nextjs").then((lazyLoadedSentry) => {
      Sentry.addIntegration(
        lazyLoadedSentry.feedbackIntegration({
          autoInject: false,
          colorScheme: "dark",
          showBranding: false,
          themeDark: {
            background: "var(--color-background)",
            foreground: "var(--color-foreground)",
            accentForeground: "var(--color-primary-foreground)",
            accentBackground: "var(--color-primary)",
            outline: "var(--color-border)",
          },
        }),
      );

      setFeedback(Sentry.getFeedback());
    });
  }, []);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (feedback) {
      const unsubscribe = feedback.attachTo(
        buttonRef.current as HTMLButtonElement,
        translations,
      );
      return unsubscribe;
    }
    return () => {};
  }, [feedback, translations]);

  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    // Sentry is not enabled, so we don't need to show the feedback button
    return null;
  }

  return (
    <SidebarMenuButton
      tooltip={t("Feedback")}
      className="group/menu-button h-9 gap-3 font-medium text-muted-foreground group-data-[collapsible=icon]:px-[5px]! [&>svg]:size-auto"
      ref={buttonRef}
    >
      <MessageCircleMoreIcon
        className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
        size={22}
        aria-hidden="true"
      />
      <span>{t("Feedback")}</span>
    </SidebarMenuButton>
  );
}
