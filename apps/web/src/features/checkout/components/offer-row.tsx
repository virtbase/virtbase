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

import { cn } from "@virtbase/ui";
import { getAvailablePlans } from "../api/get-available-plans";
import { OfferCard } from "./offer-card";

export async function OfferRow() {
  const plans = await getAvailablePlans();

  return (
    <div className="@container overflow-hidden">
      {Array.from(new Array(Math.ceil(plans.length / 4)), (_, index) =>
        plans.slice(index * 4, index * 4 + 4),
      ).map((chunk, index) => (
        <div
          key={index}
          className={cn(
            "grid overflow-hidden md:grid-cols-2 lg:grid-cols-4 [&>*:not(:last-child)]:border-border max-md:[&>*:not(:last-child)]:border-b md:[&>*:not(:last-child)]:border-r",
            index > 0 && "border-border border-t",
          )}
        >
          {chunk.map((plan) => (
            <div key={plan.id}>
              <OfferCard
                plan={plan}
                // TODO: Make dynamic
                datacenter={{
                  id: "dc_1",
                  name: "SkyLink Data Center",
                  country: "NL",
                }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
