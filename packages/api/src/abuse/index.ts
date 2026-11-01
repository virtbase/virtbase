/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export type { CaseDecision } from "./case.ts";
export {
  awaitCustomerResponse,
  CASE_JOIN_WINDOW_HOURS,
  caseReference,
  countRecentResolvedCases,
  DEFAULT_RESPONSE_HOURS,
  decideNewCase,
  linkCaseServer,
  openOrJoinAbuseCase,
  REPEAT_WINDOW_DAYS,
  recordCaseEvent,
  setCaseStatus,
  touchCase,
} from "./case.ts";
export {
  isPublicIpv4,
  parseIpv4Cidr,
  supernet,
} from "./cidr.ts";
export type {
  DryRunDraft,
  DryRunResult,
  DryRunSample,
  DryRunShadow,
} from "./dry-run.ts";
export {
  DRY_RUN_SAMPLE_LIMIT,
  DRY_RUN_SIGNAL_LIMIT,
  dryRunAbuseRules,
} from "./dry-run.ts";
export type {
  EnforceCaseResult,
  ReconcileLocksResult,
  ReleaseCaseResult,
  VmResolver,
} from "./enforce.ts";
export { enforceCase, reconcileAbuseLocks, releaseCase } from "./enforce.ts";
export { submitSignal, submitSignals } from "./intake.ts";
export type {
  ServerLockCapture,
  ServerLockLevel,
  ServerLockPreviousState,
  ServerLockStateByLevel,
} from "./lock.ts";
export {
  applyServerLock,
  isServerLockInForce,
  normalizeLockState,
  releaseServerLock,
  THROTTLE_RATE_MBPS,
} from "./lock.ts";
export {
  ABUSE_MAILBOX_LOCAL,
  abuseMailboxDomain,
  bareAbuseAddress,
  isBareAbuseAddress,
  mintCaseAddress,
  parseCaseAddress,
  parseSubjectToken,
  subjectToken,
} from "./mailbox/address.ts";
export type {
  AbuseEmailOutcome,
  InboundAbuseEmail,
  RoutingStep,
} from "./mailbox/receive.ts";
export {
  bareAddress,
  isAutomated,
  receiveAbuseEmail,
  routeInboundEmail,
  upsertCaseContact,
} from "./mailbox/receive.ts";
export type { SendToReporterResult } from "./mailbox/send.ts";
export {
  acknowledgeReporters,
  ensureCaseMailbox,
  notifyReportersResolved,
  sendToReporters,
} from "./mailbox/send.ts";
export type { OrderingBlock } from "./ordering.ts";
export { getOrderingBlock } from "./ordering.ts";
export type { PollSourceResult } from "./poll.ts";
export {
  collectPollTargets,
  DEFAULT_BLOCK_PREFIX,
  MAX_TARGETS_PER_RUN,
  pollAbuseSources,
} from "./poll.ts";
export { AbuseSignalIntake } from "./port.ts";
export type { ReconcileCasesResult } from "./reconcile.ts";
export { reconcileAbuseCases } from "./reconcile.ts";
export type { ResolvedSubject, SignalAttribution } from "./resolve-subject.ts";
export { resolveSignalSubject } from "./resolve-subject.ts";
export type { RuleDefinition, RuleMatchInput } from "./rules.ts";
export { findMatchingRule, ruleMatches } from "./rules.ts";
export {
  MAX_ABUSE_BODY_LENGTH,
  MAX_ABUSE_TITLE_LENGTH,
  sanitizeAbuseBody,
  sanitizeAbuseText,
  sanitizeAbuseTitle,
} from "./sanitize.ts";
export type {
  AbuseClassification,
  ClassifyCaseResult,
  TriageSweepResult,
} from "./triage/index.ts";
export {
  classifyAbuseCase,
  isTriageAvailable,
  sweepUntriagedCases,
} from "./triage/index.ts";
