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

import { cn } from "@virtbase/ui";
import { Badge } from "@virtbase/ui/badge";
import {
  LucideCheck,
  LucideLock,
  LucideSend,
  LucideShieldAlert,
  LucideUser,
} from "@virtbase/ui/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@virtbase/ui/input-group";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@virtbase/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@virtbase/ui/message-scroller";
import { Spinner } from "@virtbase/ui/spinner";
import NextLink from "next/link";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { paths } from "@/lib/paths";
import {
  CATEGORY_ICONS,
  ENFORCEMENT_ICONS,
  SEVERITY_ICONS,
  STATUS_ICONS,
} from "@/ui/abuse/case-meta";
import {
  useMarkAbuseCaseFixed,
  useReplyToAbuseCase,
} from "../hooks/use-abuse-actions";
import type { CustomerAbuseCase } from "../hooks/use-abuse-cases";
import { useCaseLabels } from "../hooks/use-case-labels";

/** Statuses the customer can still write into. */
const OPEN_TO_CUSTOMER = new Set([
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
  "mitigated",
]);

/** Statuses where claiming it is fixed still means something. */
const CAN_CLAIM_FIXED = new Set([
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
]);

/** The bubble. Not a UI primitive, because only these two pages have one. */
function Bubble({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-bubble"
      className={cn(
        "w-fit max-w-[46rem] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-6",
        className,
      )}
      {...props}
    />
  );
}

/**
 * What the case is about, as the first thing in the thread.
 *
 * Pinned rather than sorted into place: it is not a message - nobody said it
 * to anybody - and it is the only description of the accusation the customer
 * ever gets, because the report itself carries a third party's identity.
 */
function CaseSummary({ summary }: { summary: string }) {
  const t = useExtracted();

  return (
    <div className="rounded-lg border bg-muted/30 px-3.5 py-3">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t("What was reported")}
      </p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-6">{summary}</p>
    </div>
  );
}

/**
 * The servers this case is holding, and what is being held.
 *
 * The first question a suspended customer has is which machine and why, and
 * answering it anywhere but at the top of the thread means they open a support
 * ticket to ask.
 */
function AffectedServers({
  servers,
}: {
  servers: CustomerAbuseCase["servers"];
}) {
  const t = useExtracted();
  const labels = useCaseLabels();

  // A released row is history, and a `none` row is a link to a case rather
  // than anything being held.
  const held = servers.filter(
    (server) => !server.released_at && "none" !== server.lock_level,
  );
  if (0 === held.length) return null;

  return (
    <div className="rounded-lg border border-dashed px-3.5 py-3">
      <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        <LucideLock aria-hidden="true" className="size-3.5" />
        {t("Restricted while this is open")}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {held.map((server) => {
          const Level = ENFORCEMENT_ICONS[server.lock_level];

          return (
            <li
              key={server.server_id}
              className="flex items-center gap-2 text-sm"
            >
              <NextLink
                href={paths.app.servers.overview.getHref(server.server_id)}
                prefetch={false}
                className="truncate font-medium"
              >
                {server.server_name}
              </NextLink>
              <Badge variant="outline">
                <Level aria-hidden="true" />
                {labels.enforcement[server.lock_level]}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MessageEntry({
  message,
}: {
  message: CustomerAbuseCase["messages"][number];
}) {
  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  // Theirs on the right - the one convention every chat shares.
  const outgoing = "customer" === message.author;

  return (
    <Message align={outgoing ? "end" : "start"}>
      <MessageAvatar className="size-8 text-muted-foreground">
        {outgoing ? (
          <LucideUser aria-hidden="true" className="size-4" />
        ) : (
          <LucideShieldAlert aria-hidden="true" className="size-4" />
        )}
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>
          <span>{outgoing ? t("You") : t("Abuse desk")}</span>
        </MessageHeader>
        <Bubble
          className={cn(
            outgoing
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm bg-muted",
          )}
        >
          {message.body}
        </Bubble>
        <MessageFooter suppressHydrationWarning>
          {format.relativeTime(message.created_at, now)}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

/**
 * The case, as one screen.
 *
 * No aside: everything the customer needs is the accusation, what it is
 * costing them, the conversation and the two things they can do about it. A
 * column of metadata beside all that would be a column of things they cannot
 * act on.
 */
export function AbuseCaseConversation({
  abuseCase,
}: {
  abuseCase: CustomerAbuseCase;
}) {
  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const labels = useCaseLabels();

  const [body, setBody] = useState("");

  // No success toast on either: the message appears in the thread, and the
  // status in the header changes.
  const onError = (error: { message: string }) =>
    toast.error(error.message || t("Something went wrong."));

  const reply = useReplyToAbuseCase(abuseCase.id);
  const markFixed = useMarkAbuseCaseFixed(abuseCase.id);

  const Status = STATUS_ICONS[abuseCase.status];
  const Severity = SEVERITY_ICONS[abuseCase.severity];
  const Category = CATEGORY_ICONS[abuseCase.category];

  const open = OPEN_TO_CUSTOMER.has(abuseCase.status);
  const deadline = abuseCase.respond_by;
  const overdue = Boolean(deadline && deadline.getTime() < now.getTime());

  const submit = () => {
    if (0 === body.trim().length) return;

    reply.mutate(
      { id: abuseCase.id, body },
      { onSuccess: () => setBody(""), onError },
    );
  };

  return (
    <MessageScrollerProvider>
      {/* A bounded column at every width, not just on a desktop.
          `MessageScroller` is `size-full`, so without a definite height here
          the viewport grows to fit the thread, the internal scroll never
          engages, and the composer ends up somewhere down the document.
          `svh` rather than `dvh` on small screens: `dvh` changes as the
          browser's URL bar hides and the composer would jump while typing. */}
      <section className="flex h-[calc(100svh-9rem)] min-h-[20rem] min-w-0 flex-col gap-4 lg:h-[calc(100dvh-11rem)]">
        <header className="flex shrink-0 flex-wrap items-center gap-2">
          <h1 className="min-w-0 grow truncate font-semibold text-lg">
            {abuseCase.title}
          </h1>
          <Badge variant="outline">
            <Status aria-hidden="true" />
            {labels.status[abuseCase.status]}
          </Badge>
          <Badge variant="outline">
            <Category aria-hidden="true" />
            {labels.category[abuseCase.category]}
          </Badge>
          <Badge variant="outline">
            <Severity aria-hidden="true" />
            {labels.severity[abuseCase.severity]}
          </Badge>
          {deadline ? (
            <Badge
              variant={overdue ? "destructive" : "outline"}
              suppressHydrationWarning
            >
              {overdue
                ? t("Answer overdue")
                : t("Answer by {when}", {
                    when: format.relativeTime(deadline, now),
                  })}
            </Badge>
          ) : null}
        </header>

        <MessageScroller className="min-h-0 flex-1">
          {/* No scrollbar: the thread is a conversation, and the
              scroll-to-latest button is the affordance that matters. */}
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-5 pb-2">
              {abuseCase.summary ? (
                <MessageScrollerItem messageId="summary">
                  <CaseSummary summary={abuseCase.summary} />
                </MessageScrollerItem>
              ) : null}

              {abuseCase.servers.length > 0 ? (
                <MessageScrollerItem messageId="servers">
                  <AffectedServers servers={abuseCase.servers} />
                </MessageScrollerItem>
              ) : null}

              {abuseCase.messages.map((message, index) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  // The last one anchors the autoscroll, so a reply lands in
                  // view instead of below the fold.
                  scrollAnchor={index === abuseCase.messages.length - 1}
                >
                  <MessageEntry message={message} />
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>

        {open ? (
          /* Pinned: the page still scrolls past the section to reach the
             footer, and a composer that slides off the bottom of a phone
             mid-reply is a composer nobody finds again. */
          <InputGroup className="sticky bottom-0 z-10 shrink-0 bg-background">
            <InputGroupTextarea
              rows={3}
              value={body}
              disabled={reply.isPending}
              placeholder={t("What you found, and what you have changed…")}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                // The shortcut every chat has. Enter alone is a newline: an
                // answer to an accusation is a paragraph, not a one-liner.
                if ("Enter" === event.key && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  submit();
                }
              }}
            />

            <InputGroupAddon align="block-end" className="gap-2 border-t">
              {/* Hidden rather than disabled once the claim has been made and
                  the case is with us. */}
              {CAN_CLAIM_FIXED.has(abuseCase.status) ? (
                <InputGroupButton
                  variant="outline"
                  size="sm"
                  disabled={markFixed.isPending}
                  onClick={() =>
                    markFixed.mutate(
                      {
                        id: abuseCase.id,
                        ...(body.trim() ? { note: body } : {}),
                      },
                      { onSuccess: () => setBody(""), onError },
                    )
                  }
                >
                  {markFixed.isPending ? (
                    <Spinner />
                  ) : (
                    <LucideCheck aria-hidden="true" />
                  )}
                  {t("I fixed this")}
                </InputGroupButton>
              ) : null}

              <InputGroupButton
                variant="default"
                size="sm"
                className="ms-auto"
                disabled={reply.isPending || 0 === body.trim().length}
                onClick={submit}
              >
                {reply.isPending ? (
                  <Spinner />
                ) : (
                  <LucideSend aria-hidden="true" />
                )}
                {t("Send")}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        ) : (
          <p className="shrink-0 rounded-lg border border-dashed px-3.5 py-3 text-muted-foreground text-sm">
            {t(
              "This case is settled. Contact support if something about it is still wrong.",
            )}
          </p>
        )}
      </section>
    </MessageScrollerProvider>
  );
}
