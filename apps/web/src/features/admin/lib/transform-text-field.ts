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

export const transformTextField = {
  // biome-ignore lint/suspicious/noGlobalIsNan: required
  // biome-ignore lint/suspicious/noExplicitAny: required
  input: (value: any) => (isNaN(value) || value === 0 ? "" : value.toString()),
  output: (e: React.ChangeEvent<HTMLInputElement>) => {
    const output = parseInt(e.target.value, 10);
    // biome-ignore lint/suspicious/noGlobalIsNan: required
    return isNaN(output) ? 0 : output;
  },
};
