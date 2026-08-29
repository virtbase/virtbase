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

import { APP_NAME, PUBLIC_DOMAIN, VIRTBASE_WORDMARK } from "@virtbase/utils";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";

/**
 * What we write back to whoever reported an abuse case.
 *
 * Deliberately plain and deliberately English. This goes to an abuse desk, a
 * CERT or a security team - not to a customer - and it carries no branding
 * beyond the wordmark, no marketing, and nothing about the customer the case
 * is about.
 *
 * `body` is written by an operator or by the acknowledgement, never by the
 * reporter, so it is trusted text. React escapes it regardless.
 */
export default async function AbuseReportReply({
  reference = "AB-1042",
  body = "Thank you for the report.",
  replyTo,
}: {
  email: string;
  reference: string;
  body: string;
  replyTo?: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{`Abuse case ${reference}`}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-neutral-200 border-solid px-10 py-5">
            <Section className="mt-8">
              <Img src={VIRTBASE_WORDMARK} height="32" alt={APP_NAME} />
            </Section>
            <Heading className="mx-0 my-7 p-0 font-medium text-black text-xl">
              {`Abuse case ${reference}`}
            </Heading>
            <Text className="whitespace-pre-line text-black text-sm leading-6">
              {body}
            </Text>
            <Hr className="mx-0 my-6 w-full border border-neutral-200 border-solid" />
            <Text className="text-[12px] text-neutral-500 leading-5">
              {replyTo
                ? `Reply to this message to add to case ${reference}. Please keep the reference in the subject line.`
                : `Please keep ${reference} in the subject line when replying.`}
            </Text>
            <Text className="text-[12px] text-neutral-500 leading-5">
              <Link href={PUBLIC_DOMAIN} className="text-neutral-500 underline">
                {APP_NAME}
              </Link>
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
