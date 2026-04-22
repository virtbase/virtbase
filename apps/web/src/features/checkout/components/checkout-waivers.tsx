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

import { Checkbox } from "@virtbase/ui/checkbox";
import { Field, FieldLabel } from "@virtbase/ui/field";
import { PUBLIC_DOMAIN } from "@virtbase/utils";
import { useExtracted } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import { IntlLink } from "@/i18n/navigation.public";

const linkClassName = "font-semibold underline decoration-dotted";

export function CheckoutWaivers({
  control,
  external,
}: {
  control: UseFormReturn<{
    terms: boolean;
    waiver: boolean;
  }>["control"];
  external: boolean;
}) {
  const t = useExtracted();
  const LinkComp = !external ? IntlLink : "a";

  const items = [
    {
      name: "terms",
      label: t.rich(
        "I have read and accepted the <terms>Terms of Service</terms> and the <privacy>Privacy Policy</privacy>.",
        {
          terms: (chunks) => (
            <LinkComp
              target="_blank"
              className={linkClassName}
              {...(!external
                ? { prefetch: false, href: "/legal/terms" }
                : {
                    href: `${PUBLIC_DOMAIN}/legal/terms`,
                    rel: "noopener",
                  })}
            >
              {chunks}
            </LinkComp>
          ),
          privacy: (chunks) => (
            <LinkComp
              target="_blank"
              className={linkClassName}
              {...(!external
                ? { prefetch: false, href: "/legal/privacy" }
                : {
                    href: `${PUBLIC_DOMAIN}/legal/privacy`,
                    rel: "noopener",
                  })}
            >
              {chunks}
            </LinkComp>
          ),
        },
      ),
    },
    {
      name: "waiver",
      label: t.rich(
        "I have read and accepted the <revocation>Revocation Policy</revocation>. The revocation right expires as soon as the order is completed and the service is automatically provided.",
        {
          revocation: (chunks) => (
            <LinkComp
              target="_blank"
              className={linkClassName}
              {...(!external
                ? { prefetch: false, href: "/legal/revocation" }
                : {
                    href: `${PUBLIC_DOMAIN}/legal/revocation`,
                    rel: "noopener",
                  })}
            >
              {chunks}
            </LinkComp>
          ),
        },
      ),
    },
  ] as const;

  return items.map((item) => (
    <Controller
      key={item.name}
      name={item.name}
      control={control}
      render={({ field, fieldState }) => (
        <Field orientation="horizontal" data-invalid={fieldState.invalid}>
          <Checkbox
            id={field.name}
            name={field.name}
            checked={field.value}
            onCheckedChange={field.onChange}
            aria-invalid={fieldState.invalid}
          />
          <FieldLabel htmlFor={field.name} className="font-normal">
            <span>{item.label}</span>
          </FieldLabel>
        </Field>
      )}
    />
  ));
}
