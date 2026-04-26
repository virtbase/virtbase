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
import { getExtracted } from "next-intl/server";
import { IntlLink } from "@/i18n/navigation.public";

export async function FAQSection() {
  const t = await getExtracted();

  const items = [
    {
      title: t("How long does it take to provision a server?"),
      content: t(
        "The provisioning of the booked package is usually done automatically after the order by our system without any waiting time. A confirmation by email is also sent additionally.",
      ),
    },
    {
      title: t("Is there a traffic limit?"),
      content: t(
        "No, there is no traffic limit for our servers. The uplink is provided according to the fair use principle. However, bandwidth may be temporarily throttled in the event of disproportionately high sustained usage.",
      ),
    },
    {
      title: t("Can the package be changed later?"),
      content: t(
        "The booked package can easily be changed through the customer portal. When switching during the current billing period, the price difference will be credited accordingly.",
      ),
    },
    {
      title: t("Can I cancel my server at any time?"),
      content: t(
        "Yes, booked servers can be canceled at any time through the customer portal. Cancellations take effect at the end of the selected billing period.",
      ),
    },
    {
      title: t("How can I access my servers?"),
      content: t(
        "The booked server can be managed through our in-house customer portal. SSH access via password is available by default. The server can also be accessed through the VNC console.",
      ),
    },
    {
      title: t("How secure is my data?"),
      content: t.rich(
        "Data protection is our highest priority. All data on the servers is stored on encrypted disks. Access by us as the provider or by other actors is generally not possible. You can find more information in our <privacy>privacy policy</privacy>.",
        {
          privacy: (chunks) => (
            <IntlLink href="/legal/privacy" target="_blank" prefetch={false}>
              {chunks}
            </IntlLink>
          ),
        },
      ),
    },
    {
      title: t("Where can I get support?"),
      content: t.rich(
        "Our support team is available 24/7. Sending an email to <email>support@virtbase.com</email> will get you a quick response.",
        {
          email: (chunks) => <a href="mailto:support@virtbase.com">{chunks}</a>,
        },
      ),
    },
    {
      title: t("Where are the servers located?"),
      content: t(
        "All of our servers are currently located in the Skylink Datacenter in the Netherlands. It is equipped to Tier 3 standards and has redundant power supply, network components, and cooling.",
      ),
    },
  ];

  return (
    <div className="relative mx-auto w-full max-w-3xl px-3 py-6 sm:py-20 lg:px-10">
      <h2 className="mb-10 font-medium text-3xl text-foreground sm:text-4xl">
        {t("Frequently asked questions")}
      </h2>
      <Accordion type="single" collapsible>
        {items.map((item, index) => (
          <AccordionItem key={index} value={`${index}`}>
            <AccordionTrigger>{item.title}</AccordionTrigger>
            <AccordionContent>
              <p>{item.content}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
