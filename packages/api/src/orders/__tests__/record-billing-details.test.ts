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

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import {
  orderItems,
  orders,
  proxmoxNodeGroups,
  serverPlanPrices,
  serverPlans,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

const testDb: TestDb = await createTestDb();
const USER_ID = "usr_00000000000000000000000002";

mock.module("@virtbase/db/client", () => ({ db: testDb }));

const { createOrder } = await import("../create-order");
const { recordBillingDetails } = await import("../record-billing-details");

const PLAN_ID = "pck_00000000000000000000000001";
const PRICE_ID = "price_00000000000000000000001";

const configuration = {
  version: 2,
  type: "new_server",
  server_plan_id: PLAN_ID,
  server_plan_price_id: PRICE_ID,
  template_id: "temp_1",
  root_password: "hunter2AA",
} as never;

const address = (country: string | null) => ({
  name: "Ada Lovelace",
  email: "ada@example.com",
  address: {
    line1: "Hauptstraße 1",
    line2: null,
    city: "Berlin",
    postal_code: "10115",
    country,
  },
});

beforeEach(async () => {
  await testDb.delete(orderItems);
  await testDb.delete(orders);
  await testDb.delete(serverPlanPrices);
  await testDb.delete(serverPlans);
  await testDb.delete(proxmoxNodeGroups);
  await testDb.delete(users);

  await testDb.insert(users).values({
    id: USER_ID,
    name: "Test",
    email: "test2@example.com",
    emailVerified: true,
  } as never);

  // Order lines reference the real plan and price, so both have to exist.
  const [group] = await testDb
    .insert(proxmoxNodeGroups)
    .values({ name: "test-group" } as never)
    .returning({ id: proxmoxNodeGroups.id });

  await testDb.insert(serverPlans).values({
    id: PLAN_ID,
    proxmoxNodeGroupId: group?.id as string,
    name: "VPS Small",
    cores: 2,
    memory: 2048,
    storage: 40,
    price: 1_190,
  } as never);

  await testDb.insert(serverPlanPrices).values({
    id: PRICE_ID,
    serverPlanId: PLAN_ID,
    purchasePrice: 1_190,
    renewalPrice: 1_190,
  } as never);
});

const newOrder = () =>
  createOrder({
    userId: USER_ID,
    configuration,
    totalAmount: 1_190,
    planName: "VPS Small",
    rootPassword: "hunter2AA",
  });

describe("createOrder", () => {
  test("leaves the tax rate unset, because the country is unknown at checkout", async () => {
    const orderId = await newOrder();

    const item = await testDb
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .then(([row]) => row);

    // Zero would be a lie here: it is a legitimate rate, and this is "unknown".
    expect(item?.taxRatePercentage).toBeNull();
  });

  test("keeps the root password out of the readable configuration", async () => {
    const orderId = await newOrder();

    const order = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .then(([row]) => row);

    expect(order?.configuration).not.toHaveProperty("root_password");
    expect(JSON.stringify(order?.configuration)).not.toContain("hunter2AA");
  });
});

describe("recordBillingDetails", () => {
  test("stores the address and prices the tax for the country", async () => {
    const orderId = await newOrder();

    await recordBillingDetails(orderId, address("DE"));

    const order = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .then(([row]) => row);
    const item = await testDb
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .then(([row]) => row);

    expect(order?.billingAddress).toMatchObject({
      address: { country: "DE", city: "Berlin" },
    });
    expect(item?.taxRatePercentage).toBe(19);
  });

  test("uses the customer's own country, not the home country", async () => {
    const orderId = await newOrder();

    await recordBillingDetails(orderId, address("FR"));

    const item = await testDb
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .then(([row]) => row);

    expect(item?.taxRatePercentage).toBe(20);
  });

  test("leaves the rate unset for a country with no configured rate", async () => {
    const orderId = await newOrder();

    await recordBillingDetails(orderId, address("US"));

    const item = await testDb
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .then(([row]) => row);

    // Better an obviously missing rate than a confidently wrong one.
    expect(item?.taxRatePercentage).toBeNull();
  });

  test("leaves the rate unset when the address carries no country", async () => {
    const orderId = await newOrder();

    await recordBillingDetails(orderId, address(null));

    const item = await testDb
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .then(([row]) => row);

    expect(item?.taxRatePercentage).toBeNull();
  });
});
