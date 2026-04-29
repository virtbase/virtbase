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
  LucideLayoutDashboard,
  LucideLifeBuoy,
  LucideNetwork,
  LucideShield,
} from "@virtbase/ui/icons";
import { getExtracted } from "next-intl/server";
import { AdvantageItem } from "./advantage-item";

export async function AdvantagesRow() {
  const t = await getExtracted();

  const items = [
    {
      title: t("Maximum privacy"),
      description: t(
        "With us, privacy comes first. No sharing with third parties, ever.",
      ),
      icon: LucideShield,
      href: "/help/article/about-security",
    },
    {
      title: t("Genuine support"),
      description: t(
        "We offer human support around the clock, whenever you need it.",
      ),
      icon: LucideLifeBuoy,
      href: "/contact",
    },
    {
      title: t("DDoS protection included"),
      description: t(
        "Active DDoS protection keeps you online. No extra charges, ever.",
      ),
      icon: LucideNetwork,
      href: "/help/article/about-ddos-protection",
    },
    {
      title: t("Modern customer portal"),
      description: t(
        "Efficiently manage your servers without hassle or frustration.",
      ),
      icon: LucideLayoutDashboard,
      href: "/help",
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-px bg-border text-sm sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <AdvantageItem key={index} {...item} />
      ))}
    </div>
  );
}
