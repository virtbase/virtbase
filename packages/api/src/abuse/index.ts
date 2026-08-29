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

export type { CaseDecision } from "./case";
export {
  CASE_JOIN_WINDOW_HOURS,
  caseReference,
  countRecentResolvedCases,
  decideNewCase,
  linkCaseServer,
  openOrJoinAbuseCase,
  REPEAT_WINDOW_DAYS,
  recordCaseEvent,
  setCaseStatus,
  touchCase,
} from "./case";
export {
  isPublicIpv4,
  parseIpv4Cidr,
  supernet,
} from "./cidr";
export type {
  DryRunDraft,
  DryRunResult,
  DryRunSample,
  DryRunShadow,
} from "./dry-run";
export {
  DRY_RUN_SAMPLE_LIMIT,
  DRY_RUN_SIGNAL_LIMIT,
  dryRunAbuseRules,
} from "./dry-run";
export type {
  EnforceCaseResult,
  ReconcileLocksResult,
  ReleaseCaseResult,
  VmResolver,
} from "./enforce";
export { enforceCase, reconcileAbuseLocks, releaseCase } from "./enforce";
export { submitSignal, submitSignals } from "./intake";
export type { ServerLockPreviousState } from "./lock";
export {
  applyServerLock,
  isServerLockInForce,
  releaseServerLock,
  THROTTLE_RATE_MBPS,
} from "./lock";
export {
  ABUSE_MAILBOX_LOCAL,
  abuseMailboxDomain,
  bareAbuseAddress,
  isBareAbuseAddress,
  mintCaseAddress,
  parseCaseAddress,
  parseSubjectToken,
  subjectToken,
} from "./mailbox/address";
export type {
  AbuseEmailOutcome,
  InboundAbuseEmail,
  RoutingStep,
} from "./mailbox/receive";
export {
  bareAddress,
  isAutomated,
  receiveAbuseEmail,
  routeInboundEmail,
  upsertCaseContact,
} from "./mailbox/receive";
export type { SendToReporterResult } from "./mailbox/send";
export {
  acknowledgeReporters,
  ensureCaseMailbox,
  notifyReportersResolved,
  sendToReporters,
} from "./mailbox/send";
export type { OrderingBlock } from "./ordering";
export { getOrderingBlock } from "./ordering";
export type { PollSourceResult } from "./poll";
export {
  collectPollTargets,
  DEFAULT_BLOCK_PREFIX,
  MAX_TARGETS_PER_RUN,
  pollAbuseSources,
} from "./poll";
export { AbuseSignalIntake } from "./port";
export type { ReconcileCasesResult } from "./reconcile";
export { reconcileAbuseCases } from "./reconcile";
export type { ResolvedSubject, SignalAttribution } from "./resolve-subject";
export { resolveSignalSubject } from "./resolve-subject";
export type { RuleDefinition, RuleMatchInput } from "./rules";
export { findMatchingRule, ruleMatches } from "./rules";
export {
  MAX_ABUSE_BODY_LENGTH,
  MAX_ABUSE_TITLE_LENGTH,
  sanitizeAbuseBody,
  sanitizeAbuseText,
  sanitizeAbuseTitle,
} from "./sanitize";
export type {
  AbuseClassification,
  ClassifyCaseResult,
  TriageSweepResult,
} from "./triage";
export {
  classifyAbuseCase,
  isTriageAvailable,
  sweepUntriagedCases,
} from "./triage";
