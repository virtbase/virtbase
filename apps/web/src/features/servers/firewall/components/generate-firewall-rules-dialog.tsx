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
import { LucideBrickWallShield, LucideCheck } from "@virtbase/ui/icons/index";
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
import { useExtracted } from "next-intl";
import type React from "react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ItemRow } from "@/features/account/components/item-row";
import { useCreateFirewallRule } from "../hooks/use-create-firewall-rule";
import { useGenerateFirewallRule } from "../hooks/use-generate-firewall-rule";
import { isProtocolWithPorts } from "../lib/utils";

type Rule = GenerateServerFirewallRuleOutput["rules"][number];

interface GenerateResult {
  rules: Array<Rule & { applied?: boolean }>;
  description: GenerateServerFirewallRuleOutput["description"];
}

export default function GenerateFirewallRulesDialog(
  props: Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer"
  >,
) {
  const t = useExtracted();
  const serverId = useParams<{ id: string }>().id;

  const [result, setResult] = useState<GenerateResult | null>(null);

  const { mutateAsync: generateFirewallRules, isPending: isGeneratePending } =
    useGenerateFirewallRule({
      mutationConfig: {
        onSuccess: (data) => {
          setResult(data);
        },
      },
    });

  const { mutateAsync: createFirewallRule, isPending: isCreatePending } =
    useCreateFirewallRule({
      mutationConfig: {
        onSuccess: (_, input) => {
          setResult((result) =>
            result
              ? {
                  ...result,
                  rules: result.rules.map((rule) => ({
                    ...rule,
                    applied:
                      rule.comment === input.comment ? true : rule.applied,
                  })),
                }
              : null,
          );
        },
      },
    });

  const form = useForm<GenerateServerFirewallRuleInput>({
    defaultValues: {
      server_id: serverId,
      prompt: "",
    },
    resolver: zodResolver(GenerateServerFirewallRuleInputSchema),
    disabled: isGeneratePending || isCreatePending,
  });

  useEffect(() => {
    return () => {
      setResult(null);
      form.reset();
    };
  }, []);

  const title = t("Generate Firewall Rules");
  const description = t("Let AI generate firewall rules for your server.");

  return (
    <ResponsiveDialog title={title} description={description} {...props}>
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
                    maxLength={1024}
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
        {result && (
          <AnimatedSizeContainer height>
            <div className="grid min-w-0 gap-4 p-1">
              <div className="min-w-0">
                {result.rules.map((rule, index) => (
                  <ItemRow
                    key={index}
                    icon={<LucideBrickWallShield aria-hidden="true" />}
                    rightSide={
                      !rule.applied ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          disabled={isCreatePending}
                          onClick={() => {
                            createFirewallRule({
                              server_id: serverId,
                              pos: index,
                              ...rule,
                            });
                          }}
                        >
                          {isCreatePending ? <Spinner /> : t("Apply")}
                        </Button>
                      ) : (
                        <LucideCheck
                          className="size-4 text-green-500"
                          aria-hidden="true"
                        />
                      )
                    }
                    className="p-4"
                  >
                    <p className="wrap-break-word font-medium text-sm">
                      {rule.comment}
                    </p>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm tabular-nums leading-snug">
                      {[
                        rule.proto,
                        rule.icmp_type,
                        isProtocolWithPorts(rule.proto)
                          ? `${rule.sport || "*"} : ${rule.dport || "*"}`
                          : "",
                      ]
                        .filter(Boolean)
                        .map((item, index) => (
                          <span key={index} className="break-all">
                            {item}
                          </span>
                        ))}
                    </div>
                  </ItemRow>
                ))}
              </div>
              <p className="wrap-break-word min-w-0 text-pretty text-muted-foreground text-sm">
                {result.description}
              </p>
            </div>
          </AnimatedSizeContainer>
        )}
      </div>
    </ResponsiveDialog>
  );
}
