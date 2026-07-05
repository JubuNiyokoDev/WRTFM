// Verification Engine - the core of Worldwide Rapid Task For Money
// Analyzes proofs and produces a confidence score + decision

interface WorkerInfo {
  reputationScore: number;
  totalCompleted: number;
  totalRejected: number;
  workerId: number;
}

interface ClientInfo {
  totalCampaigns: number;
  totalDisputes: number;
  avgAutoRate: number;
}

interface ProofData {
  proofType: string;
  proofLevel?: 1 | 2 | 3;
  screenshotUrl?: string | null;
  link?: string | null;
  username?: string | null;
  code?: string | null;
  description?: string | null;
  contentHash: string;
}

interface VerificationCheck {
  name: string;
  passed: boolean;
  score: number;
  details: string | null;
  reasonCode?: string;
}

interface EngineResult {
  confidenceScore: number;
  status: "auto_approved" | "auto_rejected" | "manual_review";
  method: "automatic" | "manual" | "hybrid";
  checks: VerificationCheck[];
  reasonCode?: string;
}

interface DuplicateCheckResult {
  hasDuplicate: boolean;
  duplicateCount: number;
  byWorker: number;
  global: number;
}

export function runVerificationEngine(
  taskType: string,
  proofRequirements: string[],
  proof: ProofData,
  workerInfo?: WorkerInfo,
  clientInfo?: ClientInfo,
  duplicateCheck?: DuplicateCheckResult,
): EngineResult {
  const checks: VerificationCheck[] = [];

  // Check 0: Duplicate proof detection (if provided)
  if (duplicateCheck) {
    const dupCheck = checkDuplicateProof(duplicateCheck);
    checks.push(dupCheck);
  }

  // Check 1: Proof level validation
  if (proof.proofLevel) {
    const levelCheck = checkProofLevel(proof.proofLevel, proof);
    checks.push(levelCheck);
  }

  // Check 2: Proof completeness
  const completenessCheck = checkProofCompleteness(proof, proofRequirements);
  checks.push(completenessCheck);

  // Check 3: Proof type match
  const typeMatchCheck = checkProofTypeMatch(taskType, proof);
  checks.push(typeMatchCheck);

  // Check 4: Content presence
  const contentCheck = checkContentPresence(proof);
  checks.push(contentCheck);

  // Check 5: Link validity (if link present)
  if (proof.link) {
    const linkCheck = checkLinkValidity(proof.link, taskType);
    checks.push(linkCheck);
  }

  // Check 6: Username format (if username present)
  if (proof.username) {
    const usernameCheck = checkUsernameFormat(proof.username);
    checks.push(usernameCheck);
  }

  // Check 7: Description quality (if text proof)
  if (proof.description) {
    const descCheck = checkDescriptionQuality(proof.description, taskType);
    checks.push(descCheck);
  }

  // Check 8: Worker reputation (if available)
  if (workerInfo) {
    const reputationCheck = checkWorkerReputation(workerInfo);
    checks.push(reputationCheck);
  }

  // Check 9: Client history (if available)
  if (clientInfo) {
    const clientCheck = checkClientHistory(clientInfo);
    checks.push(clientCheck);
  }

  // Calculate confidence score (weighted average)
  const weights: Record<string, number> = {
    "Duplicate Detection": 0.15,
    "Proof Completeness": 0.25,
    "Proof Type Match": 0.2,
    "Content Presence": 0.1,
    "Link Validity": 0.08,
    "Username Format": 0.04,
    "Description Quality": 0.04,
    "Worker Reputation": 0.08,
    "Client History": 0.06,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const check of checks) {
    const w = weights[check.name] ?? 0.1;
    weightedSum += check.score * w;
    totalWeight += w;
  }

  const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const confidenceScore = Math.max(0, Math.min(1, rawScore));

  let status: EngineResult["status"];
  let reasonCode: EngineResult["reasonCode"];

  if (confidenceScore >= 0.85) {
    status = "auto_approved";
    reasonCode = "HIGH_CONFIDENCE";
  } else if (confidenceScore < 0.45) {
    status = "auto_rejected";
    reasonCode = "LOW_CONFIDENCE";
  } else {
    status = "manual_review";
    reasonCode = "MANUAL_REVIEW_NEEDED";
  }

  // If any critical check failed, force to manual review
  const criticalFailed = checks.some(
    (c) => !c.passed && c.reasonCode?.startsWith("CRITICAL_"),
  );
  if (criticalFailed) {
    status = "manual_review";
    reasonCode = "CRITICAL_CHECK_FAILED";
  }

  return {
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    status,
    method: "automatic",
    checks,
    reasonCode,
  };
}

function checkDuplicateProof(
  duplicateCheck: DuplicateCheckResult,
): VerificationCheck {
  const { hasDuplicate, duplicateCount, byWorker, global } = duplicateCheck;

  if (!hasDuplicate) {
    return {
      name: "Duplicate Detection",
      passed: true,
      score: 1.0,
      details: "Proof content is unique",
      reasonCode: "UNIQUE_PROOF",
    };
  }

  // Multiple duplicates is more suspicious than a single one
  const severity =
    duplicateCount > 2 ? "high" : duplicateCount > 1 ? "medium" : "low";

  return {
    name: "Duplicate Detection",
    passed: false,
    score: 0.0,
    details: `Duplicate proof detected: ${duplicateCount} total (${byWorker} by this worker, ${global} globally)`,
    reasonCode: "CRITICAL_DUPLICATE_PROOF",
  };
}

function checkProofLevel(
  level: 1 | 2 | 3,
  proof: ProofData,
): VerificationCheck {
  // Level 1: Basic screenshot or link
  // Level 2: Screenshot + link or detailed text
  // Level 3: Screenshot + link + username/text (comprehensive)

  let passed = false;
  let score = 0;
  let details = "";

  if (level === 1) {
    passed = !!(proof.screenshotUrl || proof.link);
    score = passed ? 0.8 : 0;
    details = passed
      ? "Basic proof (screenshot or link) provided"
      : "Level 1 requires at least screenshot or link";
  } else if (level === 2) {
    const hasScreenshot = !!proof.screenshotUrl;
    const hasLink = !!proof.link;
    const hasText = !!(proof.description && proof.description.length >= 10);

    passed =
      (hasScreenshot && hasLink) ||
      (hasScreenshot && hasText) ||
      (hasLink && hasText);
    score = passed ? 0.85 : 0.4;
    details = passed
      ? "Level 2: multiple proof elements provided"
      : "Level 2 requires screenshot+link, screenshot+text, or link+text";
  } else if (level === 3) {
    const hasScreenshot = !!proof.screenshotUrl;
    const hasLink = !!proof.link;
    const hasUsername = !!(proof.username && proof.username.length >= 2);
    const hasText = !!(proof.description && proof.description.length >= 15);

    passed = hasScreenshot && (hasLink || hasUsername) && hasText;
    score = passed ? 0.95 : 0.3;
    details = passed
      ? "Level 3: comprehensive proof with screenshot, link/username, and detailed text"
      : "Level 3 requires screenshot + (link or username) + detailed text (15+ words)";
  }

  return {
    name: "Proof Level",
    passed,
    score,
    details,
    reasonCode: passed
      ? `PROOF_LEVEL_${level}_OK`
      : `CRITICAL_PROOF_LEVEL_${level}_FAILED`,
  };
}

function checkProofCompleteness(
  proof: ProofData,
  requirements: string[],
): VerificationCheck {
  const provided = [
    proof.screenshotUrl,
    proof.link,
    proof.username,
    proof.code,
    proof.description,
  ].filter(Boolean);

  if (provided.length === 0) {
    return {
      name: "Proof Completeness",
      passed: false,
      score: 0,
      details: "No proof elements provided",
      reasonCode: "CRITICAL_NO_PROOF",
    };
  }

  const reqCount = Math.max(1, requirements.length);
  const score = Math.min(1, provided.length / reqCount);

  return {
    name: "Proof Completeness",
    passed: score >= 0.6,
    score,
    details: `${provided.length} element(s) provided for ${reqCount} required`,
    reasonCode: score >= 0.6 ? "COMPLETENESS_OK" : "CRITICAL_INCOMPLETE_PROOF",
  };
}

function checkProofTypeMatch(
  taskType: string,
  proof: ProofData,
): VerificationCheck {
  const typeExpectations: Record<string, string[]> = {
    youtube_watch: ["screenshot", "link"],
    youtube_like: ["screenshot", "link"],
    youtube_comment: ["link", "username", "text"],
    youtube_subscribe: ["screenshot", "username"],
    instagram_follow: ["screenshot", "username"],
    instagram_like: ["screenshot", "link"],
    instagram_comment: ["link", "username", "text"],
    tiktok_follow: ["screenshot", "username"],
    tiktok_like: ["screenshot", "link"],
    tiktok_comment: ["link", "text"],
    twitter_follow: ["screenshot", "username"],
    twitter_like: ["link"],
    twitter_retweet: ["link"],
    website_visit: ["screenshot", "link"],
    website_signup: ["screenshot", "link"],
    app_install: ["screenshot", "link"],
    app_test: ["screenshot", "text"],
    form_fill: ["screenshot", "code"],
    content_review: ["text"],
    data_collection: ["link", "text"],
  };

  const expected = typeExpectations[taskType] ?? ["screenshot"];
  const proofTypeLower = proof.proofType.toLowerCase();

  let matched = 0;
  if (expected.includes("screenshot") && proof.screenshotUrl) matched++;
  if (expected.includes("link") && proof.link) matched++;
  if (expected.includes("username") && proof.username) matched++;
  if (expected.includes("code") && proof.code) matched++;
  if (expected.includes("text") && proof.description) matched++;

  const score = Math.min(1, matched / Math.max(1, expected.length));
  const passed = score >= 0.4 || proofTypeLower === "combined";

  return {
    name: "Proof Type Match",
    passed,
    score: passed ? Math.max(score, 0.6) : score,
    details: `Task type "${taskType}" expects: ${expected.join(", ")}`,
    reasonCode: passed ? "TYPE_MATCH_OK" : "CRITICAL_TYPE_MISMATCH",
  };
}

function checkContentPresence(proof: ProofData): VerificationCheck {
  const hasContent =
    (proof.screenshotUrl && proof.screenshotUrl.length > 5) ||
    (proof.link && proof.link.length > 5) ||
    (proof.username && proof.username.length > 2) ||
    (proof.code && proof.code.length > 3) ||
    (proof.description && proof.description.length > 10);

  return {
    name: "Content Presence",
    passed: !!hasContent,
    score: hasContent ? 0.9 : 0,
    details: hasContent
      ? "Proof content detected"
      : "Proof content appears empty or insufficient",
    reasonCode: hasContent ? "CONTENT_OK" : "CRITICAL_EMPTY_CONTENT",
  };
}

function checkLinkValidity(link: string, _taskType: string): VerificationCheck {
  try {
    new URL(link);
    const isHttps = link.startsWith("https://");
    const knownDomains = [
      "youtube.com",
      "youtu.be",
      "instagram.com",
      "tiktok.com",
      "twitter.com",
      "x.com",
      "facebook.com",
      "linkedin.com",
      "twitch.tv",
      "reddit.com",
    ];
    const isKnown = knownDomains.some((d) => link.includes(d));

    return {
      name: "Link Validity",
      passed: true,
      score: isHttps ? (isKnown ? 0.95 : 0.75) : 0.55,
      details: isKnown ? "Recognized platform URL" : "Valid URL provided",
      reasonCode: isKnown
        ? "LINK_KNOWN_PLATFORM"
        : isHttps
          ? "LINK_HTTPS"
          : "LINK_HTTP",
    };
  } catch {
    return {
      name: "Link Validity",
      passed: false,
      score: 0.1,
      details: "Invalid or malformed URL",
      reasonCode: "CRITICAL_INVALID_URL",
    };
  }
}

function checkUsernameFormat(username: string): VerificationCheck {
  const trimmed = username.trim();
  const valid =
    trimmed.length >= 2 &&
    trimmed.length <= 50 &&
    /^[@]?[a-zA-Z0-9._-]+$/.test(trimmed);
  return {
    name: "Username Format",
    passed: valid,
    score: valid ? 0.9 : 0.3,
    details: valid
      ? "Username format valid"
      : "Username format appears invalid",
    reasonCode: valid ? "USERNAME_OK" : "CRITICAL_INVALID_USERNAME",
  };
}

function checkDescriptionQuality(
  description: string,
  taskType: string,
): VerificationCheck {
  const words = description.trim().split(/\s+/).filter(Boolean);
  const minWords = taskType === "content_review" ? 15 : 5;
  const adequate = words.length >= minWords;
  const score = Math.min(1, words.length / (minWords * 2));

  return {
    name: "Description Quality",
    passed: adequate,
    score: adequate ? Math.max(score, 0.7) : score,
    details: adequate
      ? `Description contains ${words.length} words`
      : `Description too short (${words.length}/${minWords} words minimum)`,
    reasonCode: adequate ? "DESC_QUALITY_OK" : "CRITICAL_DESC_TOO_SHORT",
  };
}

function checkWorkerReputation(worker: WorkerInfo): VerificationCheck {
  // Reputation score is 0-1, with higher being better
  // Completed tasks boost reputation, rejections lower it
  const completionRate =
    worker.totalCompleted > 0
      ? worker.totalCompleted / (worker.totalCompleted + worker.totalRejected)
      : 0.5;

  const reputationScore = Math.max(
    0,
    Math.min(1, worker.reputationScore * 0.7 + completionRate * 0.3),
  );

  const passed = reputationScore >= 0.4;

  return {
    name: "Worker Reputation",
    passed,
    score: reputationScore,
    details: `Reputation: ${worker.reputationScore.toFixed(2)}, Completed: ${worker.totalCompleted}, Rejected: ${worker.totalRejected}`,
    reasonCode: passed ? "REP_OK" : "CRITICAL_LOW_REPUTATION",
  };
}

function checkClientHistory(client: ClientInfo): VerificationCheck {
  // Client with good history (high auto rate, few disputes) gets better treatment
  const disputeRate =
    client.totalCampaigns > 0
      ? client.totalDisputes / client.totalCampaigns
      : 0;

  const clientScore = Math.max(
    0,
    Math.min(1, client.avgAutoRate * 0.6 + (1 - disputeRate) * 0.4),
  );

  const passed = clientScore >= 0.3;

  return {
    name: "Client History",
    passed,
    score: clientScore,
    details: `Auto-rate: ${(client.avgAutoRate * 100).toFixed(0)}%, Disputes: ${client.totalDisputes}/${client.totalCampaigns}`,
    reasonCode: passed ? "CLIENT_OK" : "CLIENT_HIGH_RISK",
  };
}
