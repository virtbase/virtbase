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

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatedSizeContainer } from "@virtbase/ui/animated-size-container";
import { Button } from "@virtbase/ui/button";
import { Field, FieldLabel } from "@virtbase/ui/field";
import {
  LucideBrickWallShield,
  LucideCheck,
  LucideCircleCheck,
} from "@virtbase/ui/icons/index";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@virtbase/ui/input-group";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import type {
  GenerateServerFirewallRuleInput,
  GenerateServerFirewallRuleOutput,
} from "@virtbase/validators/server";
import { GenerateServerFirewallRuleInputSchema } from "@virtbase/validators/server";
import { useParams } from "next/navigation";
import { useExtracted, useLocale } from "next-intl";
import type React from "react";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { ItemRow } from "@/features/account/components/item-row";
import { useCreateFirewallRule } from "../hooks/use-create-firewall-rule";
import { useGenerateFirewallRule } from "../hooks/use-generate-firewall-rule";
import { isProtocolWithPorts } from "../lib/utils";

type GeneratedRule = GenerateServerFirewallRuleOutput["rules"][number];

/**
 * A generated rule with an identity of its own.
 *
 * Applied state used to be matched back by comparing comments, so two rules
 * that happened to share one both flipped to applied when either was created.
 */
interface TrackedRule {
  id: number;
  rule: GeneratedRule;
  applied: boolean;
}

/** `IN ACCEPT tcp dport 443 from 10.0.0.0/8` */
const summarise = (rule: GeneratedRule): string =>
  [
    rule.direction?.toUpperCase(),
    rule.action,
    rule.proto,
    rule.icmp_type,
    isProtocolWithPorts(rule.proto) && rule.dport ? `dport ${rule.dport}` : "",
    isProtocolWithPorts(rule.proto) && rule.sport ? `sport ${rule.sport}` : "",
    rule.source ? `from ${rule.source}` : "",
  ]
    .filter(Boolean)
    .join(" ");

export default function GenerateFirewallRulesDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const t = useExtracted();
  const locale = useLocale();
  const serverId = useParams<{ id: string }>().id;

  const [rules, setRules] = useState<TrackedRule[] | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [isApplying, startApplying] = useTransition();

  const { mutateAsync: generateFirewallRules, isPending: isGeneratePending } =
    useGenerateFirewallRule({
      mutationConfig: {
        onSuccess: (data) => {
          setRules(
            data.rules.map((rule, id) => ({ id, rule, applied: false })),
          );
          setDescription(data.description);
        },
        onError: () => {
          toast.error(t("Could not generate rules. Please try again."));
        },
      },
    });

  const { mutateAsync: createFirewallRule } = useCreateFirewallRule();

  const form = useForm<GenerateServerFirewallRuleInput>({
    defaultValues: { server_id: serverId, prompt: "", locale },
    resolver: zodResolver(GenerateServerFirewallRuleInputSchema),
    disabled: isGeneratePending || isApplying,
  });

  useEffect(() => {
    return () => {
      setRules(null);
      setDescription(null);
      form.reset();
    };
  }, []);

  /**
   * Applies one or more of the generated rules.
   *
   * One function for both buttons: applying a single rule is applying a batch
   * of one, and the transition gives the pending state for free rather than a
   * flag that has to be flipped on both sides of the loop.
   */
  const applyRules = (batch: TrackedRule[]) =>
    startApplying(async () => {
      // Back to front: every create lands on top of the previous one, so the
      // rule that should end up first has to be created last. Applying them in
      // the order they are shown reverses the whole batch.
      for (const tracked of [...batch].reverse()) {
        try {
          // Sequential on purpose - the order rules are created in is the
          // order they end up in.
          await createFirewallRule({
            server_id: serverId,
            pos: 0,
            enabled: true,
            ...tracked.rule,
          });
        } catch {
          toast.error(t("Could not create the rule. Please try again."));

          // Stop here: carrying on would apply the rest out of order.
          return;
        }

        setRules(
          (current) =>
            current?.map((item) =>
              item.id === tracked.id ? { ...item, applied: true } : item,
            ) ?? null,
        );
      }
    });

  const pending = isGeneratePending || isApplying;
  const outstanding = rules?.filter((tracked) => !tracked.applied) ?? [];

  const title = t("Generate Firewall Rules");
  const dialogDescription = t(
    "Let AI generate firewall rules for your server.",
  );

  return (
    <ResponsiveDialog title={title} description={dialogDescription} {...props}>
      <div className="grid gap-6">
        <form
          id="generate-firewall-rules-form"
          onSubmit={form.handleSubmit((data) => generateFirewallRules(data))}
        >
          <Controller
            name="prompt"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("Prompt")}</FieldLabel>
                <InputGroup>
                  <InputGroupTextarea
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    data-slot="input-group-control"
                    placeholder={t(
                      "Allow HTTPS traffic, but block SSH traffic on my server.",
                    )}
                    maxLength={512}
                    {...field}
                  />
                  <InputGroupAddon align="block-end">
                    <InputGroupText>
                      {field.value?.length ?? 0}/512
                    </InputGroupText>
                    <InputGroupButton
                      form="generate-firewall-rules-form"
                      type="submit"
                      className="ml-auto"
                      size="sm"
                      variant="default"
                      disabled={form.formState.disabled}
                    >
                      {isGeneratePending && <Spinner />}
                      {t("Generate")}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            )}
          />
        </form>
        {rules && (
          <AnimatedSizeContainer height>
            <div className="grid min-w-0 gap-4 p-1">
              {rules.length === 0 ? (
                // A valid answer, not a failure: the request may be off topic,
                // or already satisfied by the rules the server has.
                <div className="flex items-center gap-3 rounded-md border p-4">
                  <LucideCircleCheck
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                  <p className="text-sm">{t("No rules needed.")}</p>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    {rules.map((tracked) => (
                      <ItemRow
                        key={tracked.id}
                        icon={<LucideBrickWallShield aria-hidden="true" />}
                        rightSide={
                          tracked.applied ? (
                            <LucideCheck
                              className="size-4 text-green-500"
                              aria-hidden="true"
                            />
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={pending}
                              onClick={() => applyRules([tracked])}
                            >
                              {t("Apply")}
                            </Button>
                          )
                        }
                        className="p-4"
                      >
                        <p className="wrap-break-word font-medium text-sm">
                          {tracked.rule.comment}
                        </p>
                        {/* Exactly what will be created, so the customer can
                            check it before it reaches their firewall. */}
                        <p className="wrap-break-word font-mono text-muted-foreground text-xs tabular-nums">
                          {summarise(tracked.rule)}
                        </p>
                      </ItemRow>
                    ))}
                  </div>
                  {outstanding.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-self-start"
                      disabled={pending}
                      onClick={() => applyRules(outstanding)}
                    >
                      {isApplying && <Spinner />}
                      {t("Apply all")}
                    </Button>
                  )}
                </>
              )}
              {description && (
                <p className="wrap-break-word min-w-0 text-pretty text-muted-foreground text-sm">
                  {description}
                </p>
              )}
            </div>
          </AnimatedSizeContainer>
        )}
      </div>
    </ResponsiveDialog>
  );
}
