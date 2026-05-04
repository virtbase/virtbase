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

import { getPlansWithAvailability } from "@virtbase/db/queries";
import { PUBLIC_DOMAIN } from "@virtbase/utils";
import { cacheLife, cacheTag } from "next/cache";

import { NextResponse } from "next/server";
import { cache } from "react";

export const contentType = "application/json";

/**
 * @see https://www.serverhunter.com/providers/api/
 */
const getPullApiBody = cache(async () => {
  "use cache";

  cacheLife("days");
  cacheTag(
    "checkout",
    "proxmox-node-groups",
    "proxmox-nodes",
    "server-plans",
    "servers",
  );

  const offers = await getPlansWithAvailability();

  return {
    version: 1,
    offers: offers.map((offer) => ({
      name: offer.name,
      internal: offer.id,
      url: PUBLIC_DOMAIN,
      currency: "EUR",
      price: offer.price / 100,
      setup_fee: 0,
      // TODO: ?
      stock: offer.isAvailable ? "in_stock" : null,
      billing_interval: "monthly",
      product_type: "vps",
      virtualization: "kvm",
      visibility: "visible",
      gpu_name: null,
      cpu_type: "amd",
      cpu_name: "EPYC",
      cpu_amount: "1",
      cpu_cores: String(offer.cores),
      cpu_speed: "",
      memory_amount: String(offer.memory),
      memory_type: "ddr4",
      memory_ecc: "eccreg",
      hdd_amount: "0",
      hdd_capacity: "0",
      sdd_amount: "1",
      ssd_capacity: String(offer.storage),
      uplink: offer.netrate ? String(Math.round(offer.netrate / 8)) : null,
      traffic: null,
      unmetered: [],
      operating_systems: ["custom", "ubuntu", "debian", "fedora", "freebsd"],
      control_panel: [],
      country_code: "NL",
      location: "Eygelshoven, Netherlands",
      coordinates: "50.8956,6.0698",
      payment_methods: ["altcoin", "bitcoin", "creditcard", "paypal"],
      features: [
        "247_support",
        "api",
        "ddos",
        "instant_setup",
        "kvm",
        "ipv6",
        "nvme",
      ],
    })),
  };
});

export async function GET() {
  const body = await getPullApiBody();
  return NextResponse.json(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
