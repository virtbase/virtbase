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

import { describe, expect, test } from "bun:test";
import { renderWithProviders, screen } from "@virtbase/test-utils/react";
import { Badge } from "../badge";

describe("Badge", () => {
  test("it renders its children", () => {
    renderWithProviders(<Badge>Verified</Badge>);

    expect(screen.getByTestId("badge")).toHaveTextContent("Verified");
  });

  test("it defaults to the default variant", () => {
    renderWithProviders(<Badge>Default</Badge>);

    expect(screen.getByTestId("badge")).toHaveAttribute(
      "data-variant",
      "default",
    );
  });

  test("it renders as the child element when asChild is set", () => {
    renderWithProviders(
      <Badge asChild>
        <a href="/servers">Servers</a>
      </Badge>,
    );

    const link = screen.getByRole("link", { name: "Servers" });
    expect(link).toHaveAttribute("href", "/servers");
    expect(link).toHaveAttribute("data-slot", "badge");
  });
});
