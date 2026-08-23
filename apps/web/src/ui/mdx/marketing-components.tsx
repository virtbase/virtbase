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

import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import { Step, Steps } from "fumadocs-ui/components/steps";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { ComponentProps, ReactNode } from "react";

import { OfferRow } from "@/features/checkout/components/offer-row";
import { AdvantageItem } from "@/features/landing/components/advantage-item";
import { AdvantagesRow } from "@/features/landing/components/advantages-row";
import { Question } from "@/features/landing/components/faq-question";
import { FAQSection } from "@/features/landing/components/faq-section";
import { Feature } from "@/features/landing/components/feature";
import { FeaturesShowcase } from "@/features/landing/components/features-showcase";
import { OperatingSystemShowcase } from "@/features/landing/components/operating-system-showcase";
import { BlockWrapper } from "@/ui/block-wrapper";
import { Prose } from "@/ui/prose";

/**
 * The centered opening block of a marketing page. The `#` heading and the
 * paragraph that follow it are styled through descendant selectors so authors
 * write plain Markdown inside it.
 */
function Hero({ children }: { children: ReactNode }) {
  return (
    <BlockWrapper className="px-8 pt-16 pb-8" variant="hero">
      <div
        className={[
          "relative mx-auto text-center sm:max-w-lg",
          "[&_h1]:mt-5 [&_h1]:text-balance [&_h1]:text-center [&_h1]:font-medium",
          "[&_h1]:text-4xl [&_h1]:text-foreground sm:[&_h1]:text-5xl sm:[&_h1]:leading-[1.15]",
          "[&_p]:mt-4 [&_p]:text-pretty [&_p]:text-lg [&_p]:text-muted-foreground sm:[&_p]:text-xl",
        ].join(" ")}
      >
        {children}
      </div>
    </BlockWrapper>
  );
}

/**
 * Components available to every document in the `marketing` collection.
 *
 * The section components are exposed pre-wrapped in their `BlockWrapper` so a
 * page reads as a list of sections rather than as layout markup. Anything that
 * needs live data (plans, prices) stays a component — only prose belongs in the
 * MDX itself.
 */
export const marketingMdxComponents = {
  ...defaultMdxComponents,
  Steps,
  Step,
  img: ({ src, ...props }: ComponentProps<"img">) => (
    <ImageZoom
      className="rounded-lg border border-border"
      src={src as string}
      {...props}
    />
  ),
  // A marketing page's `#` heading is its hero headline, not a section anyone
  // deep-links to. Fumadocs' anchored heading renders a flex row with a
  // copy-link button, which breaks the centered hero — so keep `h1` plain and
  // leave `h2`-`h6` anchored for long-form pages.
  h1: (props: ComponentProps<"h1">) => <h1 {...props} />,
  Hero,
  Offers: () => (
    <BlockWrapper>
      <OfferRow />
    </BlockWrapper>
  ),
  OperatingSystems: () => (
    <BlockWrapper>
      <OperatingSystemShowcase />
    </BlockWrapper>
  ),
  Features: ({ children }: { children?: ReactNode }) => (
    <BlockWrapper>
      <FeaturesShowcase>{children}</FeaturesShowcase>
    </BlockWrapper>
  ),
  Feature,
  /**
   * A band of long-form text. Prose is wrapped explicitly rather than the page
   * being one big prose container, so a `<Offers />` or `<Features>` further
   * down the document does not inherit article typography.
   */
  Prose: ({ children }: { children?: ReactNode }) => (
    <BlockWrapper>
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
        <Prose>{children}</Prose>
      </div>
    </BlockWrapper>
  ),
  Advantages: ({ children }: { children?: ReactNode }) => (
    <BlockWrapper className="py-4">
      <div className="border-y">
        <AdvantagesRow>{children}</AdvantagesRow>
      </div>
    </BlockWrapper>
  ),
  Advantage: AdvantageItem,
  Faq: ({ title, children }: { title: string; children?: ReactNode }) => (
    <BlockWrapper>
      <FAQSection title={title}>{children}</FAQSection>
    </BlockWrapper>
  ),
  Question,
};
