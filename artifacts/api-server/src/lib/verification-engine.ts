// Verification Engine — the core of WRTFM
// Analyzes proofs and produces a confidence score + decision

interface ProofData {
  proofType: string;
  screenshotUrl?: string | null;
  link?: string | null;
  username?: string | null;
  code?: string | null;
  description?: string | null;
}

interface VerificationCheck {
  name: string;
  passed: boolean;
  score: number;
  details: string | null;
}

interface EngineResult {
  confidenceScore: number;
  status: "auto_approved" | "auto_rejected" | "manual_review";
  method: "automatic" | "manual" | "hybrid";
  checks: VerificationCheck[];
}

export function runVerificationEngine(
  taskType: string,
  proofRequirements: string[],
  proof: ProofData,
): EngineResult {
  const checks: VerificationCheck[] = [];

  // Check 1: Proof completeness
  const completenessCheck = checkProofCompleteness(proof, proofRequirements);
  checks.push(completenessCheck);

  // Check 2: Proof type match
  const typeMatchCheck = checkProofTypeMatch(taskType, proof);
  checks.push(typeMatchCheck);

  // Check 3: Content presence
  const contentCheck = checkContentPresence(proof);
  checks.push(contentCheck);

  // Check 4: Link validity (if link present)
  if (proof.link) {
    const linkCheck = checkLinkValidity(proof.link, taskType);
    checks.push(linkCheck);
  }

  // Check 5: Username format (if username present)
  if (proof.username) {
    const usernameCheck = checkUsernameFormat(proof.username);
    checks.push(usernameCheck);
  }

  // Check 6: Description quality (if text proof)
  if (proof.description) {
    const descCheck = checkDescriptionQuality(proof.description, taskType);
    checks.push(descCheck);
  }

  // Calculate confidence score (weighted average)
  const weights: Record<string, number> = {
    "Proof Completeness": 0.30,
    "Proof Type Match": 0.25,
    "Content Presence": 0.20,
    "Link Validity": 0.15,
    "Username Format": 0.05,
    "Description Quality": 0.05,
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
  if (confidenceScore >= 0.85) {
    status = "auto_approved";
  } else if (confidenceScore < 0.45) {
    status = "auto_rejected";
  } else {
    status = "manual_review";
  }

  return {
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    status,
    method: "automatic",
    checks,
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
    };
  }

  const reqCount = Math.max(1, requirements.length);
  const score = Math.min(1, provided.length / reqCount);

  return {
    name: "Proof Completeness",
    passed: score >= 0.6,
    score,
    details: `${provided.length} element(s) provided for ${reqCount} required`,
  };
}

function checkProofTypeMatch(taskType: string, proof: ProofData): VerificationCheck {
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
    details: hasContent ? "Proof content detected" : "Proof content appears empty or insufficient",
  };
}

function checkLinkValidity(link: string, _taskType: string): VerificationCheck {
  try {
    new URL(link);
    const isHttps = link.startsWith("https://");
    const knownDomains = [
      "youtube.com", "youtu.be",
      "instagram.com", "tiktok.com",
      "twitter.com", "x.com",
      "facebook.com", "linkedin.com",
      "twitch.tv", "reddit.com",
    ];
    const isKnown = knownDomains.some((d) => link.includes(d));

    return {
      name: "Link Validity",
      passed: true,
      score: isHttps ? (isKnown ? 0.95 : 0.75) : 0.55,
      details: isKnown ? "Recognized platform URL" : "Valid URL provided",
    };
  } catch {
    return {
      name: "Link Validity",
      passed: false,
      score: 0.1,
      details: "Invalid or malformed URL",
    };
  }
}

function checkUsernameFormat(username: string): VerificationCheck {
  const trimmed = username.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 50 && /^[@]?[a-zA-Z0-9._-]+$/.test(trimmed);
  return {
    name: "Username Format",
    passed: valid,
    score: valid ? 0.9 : 0.3,
    details: valid ? "Username format valid" : "Username format appears invalid",
  };
}

function checkDescriptionQuality(description: string, taskType: string): VerificationCheck {
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
  };
}
