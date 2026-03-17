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

/**
 * The allowed characters for the password.
 */
const Allowed = {
  Uppers: "QWERTYUIOPASDFGHJKLZXCVBNM",
  Lowers: "qwertyuiopasdfghjklzxcvbnm",
  Numbers: "1234567890",
  Symbols: "!@#$%^&*",
};

/**
 * Gets a random character from a string.
 *
 * @param str The string to get a random character from.
 * @returns A random character from the string.
 */
const getRandomCharFromString = (str: string) =>
  str.charAt(
    Math.floor(
      (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % str.length,
    ),
  );

/**
 * The generated password will be `length`, which defaults to 8,
 * and will have at least one upper, one lower, one number and one symbol.
 *
 * @param length - The password's length
 * @returns The generated password
 */
export const generatePassword = (length = 8) => {
  let pwd = "";
  pwd += getRandomCharFromString(Allowed.Uppers); // pwd will have at least one upper
  pwd += getRandomCharFromString(Allowed.Lowers); // pwd will have at least one lower
  pwd += getRandomCharFromString(Allowed.Numbers); // pwd will have at least one number
  pwd += getRandomCharFromString(Allowed.Symbols); // pwd will have at least one symbol
  for (let i = pwd.length; i < length; i++)
    pwd += getRandomCharFromString(Object.values(Allowed).join("")); // fill the rest of the pwd with random characters
  return pwd;
};
