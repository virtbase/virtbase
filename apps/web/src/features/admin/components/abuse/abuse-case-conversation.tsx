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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideBuilding2,
  LucideEyeOff,
  LucideHistory,
  LucideMail,
  LucideNotebookPen,
  LucideSend,
  LucideShieldAlert,
  LucideSparkles,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@virtbase/ui/select";
import { Spinner } from "@virtbase/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@virtbase/ui/tooltip";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import type { AbuseCaseDetail } from "../../api/abuse/get-abuse-cases";
import { addAbuseCaseMessageAction } from "../../api/abuse/manage-abuse-cases";
import { AbuseCaseStatusMenu } from "./abuse-case-status-menu";

const humanise = (value: string) => value.replace(/_/g, " ");

type Audience = "customer" | "internal" | "reporter";

/**
 * One thing that happened on a case, whatever kind of thing it was.
 *
 * Messages, status changes and inbound reports are three tables and one
 * story. Reading them as three lists means holding the ordering in your head;
 * reading them as one means the answer to "what happened here" is the page.
 */
type Entry =
  | {
      kind: "message";
      id: string;
      at: Date;
      author: string;
      audience: Audience;
      body: string;
    }
  | {
      kind: "event";
      id: string;
      at: Date;
      type: string;
      actorKind: string;
      from: string | null;
      to: string | null;
    }
  | {
      kind: "signal";
      id: string;
      at: Date;
      signal: AbuseCaseDetail["signals"][number];
    };

/**
 * Events the thread already shows.
 *
 * A "customer replied" line directly above the customer's reply says nothing
 * the reply does not, and three of them between two messages make the
 * conversation harder to read rather than better documented. They stay in
 * `abuse_case_events`, which is the record; this is the reading of it.
 */
const REDUNDANT_EVENTS = new Set([
  "customer.replied",
  "operator.replied",
  "reporter.replied",
  "customer.claims_fixed",
  "signal.attached",
]);

const buildTimeline = (abuseCase: AbuseCaseDetail): Entry[] =>
  [
    ...abuseCase.messages.map(
      (message): Entry => ({
        kind: "message",
        id: message.id,
        at: message.createdAt,
        author: message.author,
        audience: message.audience,
        body: message.body,
      }),
    ),
    ...abuseCase.events
      .filter((event) => !REDUNDANT_EVENTS.has(event.type))
      .map(
        (event): Entry => ({
          kind: "event",
          id: event.id,
          at: event.createdAt,
          type: event.type,
          actorKind: event.actorKind,
          from: event.fromValue,
          to: event.toValue,
        }),
      ),
    ...abuseCase.signals.map(
      (signal): Entry => ({
        kind: "signal",
        id: signal.id,
        at: signal.occurredAt,
        signal,
      }),
    ),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

/** The bubble. Not a UI primitive, because only this page has one. */
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
 * A line that is not somebody talking.
 *
 * Ghost rather than a bubble: a status change is context for the
 * conversation, and giving it the same weight as a message makes the
 * conversation impossible to follow.
 */
function SystemLine({ children, at }: { children: React.ReactNode; at: Date }) {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  return (
    <div className="flex items-center gap-3 py-1 text-muted-foreground text-xs">
      <span className="h-px flex-1 bg-border" />
      <LucideHistory aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
      <span className="shrink-0 opacity-70" suppressHydrationWarning>
        {format.relativeTime(at, now)}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * What the case is about, as the first thing in the thread.
 *
 * Pinned rather than sorted into place: a report is routinely dated before the
 * case that was opened from it, so ordering by time would put the accusation
 * above the description of it. It is also not a message - nobody said it to
 * anybody - which is why it has no bubble and no author.
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

function SignalEntry({
  signal,
  at,
}: {
  signal: AbuseCaseDetail["signals"][number];
  at: Date;
}) {
  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  return (
    <div className="rounded-lg border border-dashed bg-muted/40 px-3.5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <LucideShieldAlert aria-hidden="true" className="size-3.5" />
        <span className="font-medium text-foreground">{signal.source}</span>
        <span>{signal.type}</span>
        {signal.subject ? (
          <span className="font-mono">{signal.subject}</span>
        ) : null}
        <Badge variant="outline">{signal.attribution}</Badge>
        {null === signal.confidence ? null : (
          <span>
            {t("{value}% confidence", { value: String(signal.confidence) })}
          </span>
        )}
        {signal.occurrences > 1 ? (
          <span>
            {t("seen {count} times", { count: String(signal.occurrences) })}
          </span>
        ) : null}
        <span className="ms-auto" suppressHydrationWarning>
          {format.relativeTime(at, now)}
        </span>
      </div>
      <p className="mt-1.5 font-medium">{signal.title}</p>
      {signal.body ? (
        <p className="mt-1 whitespace-pre-line text-muted-foreground">
          {signal.body}
        </p>
      ) : null}
      {signal.reporter ? (
        // [!] Reporter-supplied, and operators only. It is filtered out of the
        // customer's projection in the tRPC output schema.
        <p className="mt-1.5 text-muted-foreground text-xs">
          {t("Reported by {reporter}", { reporter: signal.reporter })}
        </p>
      ) : null}
    </div>
  );
}

function MessageEntry({
  entry,
  abuseCase,
}: {
  entry: Extract<Entry, { kind: "message" }>;
  abuseCase: AbuseCaseDetail;
}) {
  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  // Ours on the right, theirs on the left - the one convention every chat
  // shares, and the reason a thread is readable at a glance.
  const outgoing = "operator" === entry.author || "system" === entry.author;

  const label =
    "customer" === entry.author
      ? (abuseCase.customer?.name ?? t("Customer"))
      : "reporter" === entry.author
        ? t("Reporter")
        : "system" === entry.author
          ? t("Assisted triage")
          : t("Operator");

  const icon =
    "customer" === entry.author ? (
      <LucideUser aria-hidden="true" className="size-4" />
    ) : "reporter" === entry.author ? (
      <LucideBuilding2 aria-hidden="true" className="size-4" />
    ) : "system" === entry.author ? (
      <LucideSparkles aria-hidden="true" className="size-4" />
    ) : (
      <LucideShieldAlert aria-hidden="true" className="size-4" />
    );

  return (
    <Message align={outgoing ? "end" : "start"}>
      <MessageAvatar className="size-8 text-muted-foreground">
        {icon}
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className="gap-1.5">
          <span>{label}</span>
          {"internal" === entry.audience ? (
            <Tooltip>
              {/* A button rather than a span: the only way to read a tooltip
                  without a pointer is to focus its trigger. */}
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                  aria-label={t("Internal note")}
                >
                  <LucideEyeOff aria-hidden="true" className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {t("Internal note. Nobody outside this page ever sees it.")}
              </TooltipContent>
            </Tooltip>
          ) : "reporter" === entry.audience && "reporter" !== entry.author ? (
            <Badge variant="outline">{t("To reporter")}</Badge>
          ) : null}
        </MessageHeader>
        <Bubble
          className={cn(
            outgoing
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm bg-muted",
            // A note nobody outside this page will ever read should not look
            // like something that was sent.
            "internal" === entry.audience &&
              "border border-dashed bg-muted/50 text-foreground",
          )}
        >
          {entry.body}
        </Bubble>
        <MessageFooter suppressHydrationWarning>
          {format.relativeTime(entry.at, now)}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

export function AbuseCaseConversation({
  abuseCase,
}: {
  abuseCase: AbuseCaseDetail;
}) {
  const t = useExtracted();

  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("internal");

  // No success toast: the message appears in the thread above.
  const send = useAction(addAbuseCaseMessageAction, {
    onSuccess: () => setBody(""),
    onError: ({ error }) =>
      toast.error(error.serverError ?? t("Something went wrong.")),
  });

  const timeline = buildTimeline(abuseCase);

  // Only the audiences this case actually has. An internal note is always
  // possible, which is why it is the default and why the list is never empty.
  const audiences = [
    {
      value: "internal" as const,
      label: t("Internal note"),
      icon: LucideNotebookPen,
    },
    ...(abuseCase.customer
      ? [
          {
            value: "customer" as const,
            label: t("To the customer"),
            icon: LucideUser,
          },
        ]
      : []),
    ...(abuseCase.contacts.length > 0
      ? [
          {
            value: "reporter" as const,
            label: t("To the reporter"),
            icon: LucideMail,
          },
        ]
      : []),
  ];

  const submit = () => {
    if (0 === body.trim().length) return;
    send.execute({ caseId: abuseCase.id, body, audience });
  };

  return (
    <TooltipProvider>
      <MessageScrollerProvider>
        {/* A bounded column at every width, not just on a desktop.
          `MessageScroller` is `size-full`, so without a definite height here
          the viewport grows to fit the thread, the internal scroll never
          engages, and the composer ends up somewhere down the document.
          `svh` rather than `dvh` on small screens: `dvh` changes as the
          browser's URL bar hides and the composer would jump while typing. */}
        <section className="flex h-[calc(100svh-9rem)] min-h-[20rem] min-w-0 flex-col gap-4 lg:h-[calc(100dvh-11rem)]">
          {0 === timeline.length && !abuseCase.summary ? (
            <Empty className="flex-1 border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LucideHistory aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("Nothing yet")}</EmptyTitle>
                <EmptyDescription>
                  {t("No report, message or change has landed on this case.")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <MessageScroller className="min-h-0 flex-1">
              {/* No scrollbar: the thread is a conversation, and the scroll-to-latest
                 button is the affordance that matters. */}
              <MessageScrollerViewport>
                <MessageScrollerContent className="gap-5 pb-2">
                  {abuseCase.summary ? (
                    <MessageScrollerItem messageId="summary">
                      <CaseSummary summary={abuseCase.summary} />
                    </MessageScrollerItem>
                  ) : null}

                  {timeline.map((entry, index) => (
                    <MessageScrollerItem
                      key={entry.id}
                      messageId={entry.id}
                      // The last one anchors the autoscroll, so a reply lands in
                      // view instead of below the fold.
                      scrollAnchor={index === timeline.length - 1}
                    >
                      {"message" === entry.kind ? (
                        <MessageEntry entry={entry} abuseCase={abuseCase} />
                      ) : "signal" === entry.kind ? (
                        <SignalEntry signal={entry.signal} at={entry.at} />
                      ) : (
                        <SystemLine at={entry.at}>
                          {[
                            humanise(entry.type),
                            entry.from && entry.to
                              ? `${humanise(entry.from)} → ${humanise(entry.to)}`
                              : entry.to
                                ? humanise(entry.to)
                                : null,
                            entry.actorKind,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </SystemLine>
                      )}
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          )}

          {/* Pinned: the page still scrolls past the section to reach the
              footer, and a composer that slides off the bottom of a phone
              mid-reply is a composer nobody finds again. */}
          <InputGroup className="sticky bottom-0 z-10 shrink-0 bg-background">
            <InputGroupTextarea
              rows={3}
              value={body}
              disabled={send.isPending}
              placeholder={
                "internal" === audience
                  ? t("A note for whoever picks this up next…")
                  : "customer" === audience
                    ? t("What the customer needs to do, and by when…")
                    : t("What the reporter is told. Never name the customer…")
              }
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                // The shortcut every chat has. Enter alone is a newline: an abuse
                // reply is a paragraph, not a one-liner.
                if ("Enter" === event.key && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  submit();
                }
              }}
            />

            <InputGroupAddon align="block-end" className="gap-2 border-t">
              <Select
                value={audience}
                onValueChange={(value) => setAudience(value as Audience)}
              >
                <SelectTrigger size="sm" className="w-44 border-0 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {audiences.map(({ value, label, icon: Icon }) => (
                    <SelectItem key={value} value={value}>
                      <Icon aria-hidden="true" />
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <AbuseCaseStatusMenu abuseCase={abuseCase} />

              <InputGroupButton
                variant="default"
                size="sm"
                className="ms-auto"
                disabled={send.isPending || 0 === body.trim().length}
                onClick={submit}
              >
                {send.isPending ? (
                  <Spinner />
                ) : (
                  <LucideSend aria-hidden="true" />
                )}
                {t("Send")}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </section>
      </MessageScrollerProvider>
    </TooltipProvider>
  );
}
