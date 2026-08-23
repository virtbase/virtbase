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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@virtbase/ui/accordion";
import type { ReactNode } from "react";
import type { FAQPage, WithContext } from "schema-dts";

import { toPlainText } from "@/ui/mdx/plain-text";
import JsonLd from "@/ui/seo/json-ld";
import { collectQuestions } from "./faq-question";

/**
 * An accordion of `<Question>` blocks, plus the `FAQPage` structured data for
 * the same content.
 *
 * The questions are read out of `children` rather than taken as a prop so a
 * page can be written as MDX. Answers are Markdown, and `toPlainText` flattens
 * them for the JSON-LD, so the prose is never written twice.
 */
export function FAQSection({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  const items = collectQuestions(children);

  const faqPage: WithContext<FAQPage> = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.title,
      acceptedAnswer: {
        "@type": "Answer",
        text: toPlainText(item.content),
      },
    })),
  };

  return (
    <div className="relative mx-auto w-full max-w-3xl px-3 py-6 sm:py-20 lg:px-10">
      <h2 className="mb-10 font-medium text-3xl text-foreground sm:text-4xl">
        {title}
      </h2>
      <Accordion type="single" collapsible>
        {items.map((item, index) => (
          <AccordionItem key={index} value={`${index}`}>
            <AccordionTrigger>{item.title}</AccordionTrigger>
            <AccordionContent>{item.content}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <JsonLd schema={faqPage} />
    </div>
  );
}
