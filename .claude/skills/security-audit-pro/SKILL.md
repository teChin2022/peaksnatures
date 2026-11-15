---
name: security-audit-pro
description: Use for any application or infrastructure security assessment — vulnerability assessment, web/API penetration testing, SAST/SCA code and dependency scanning, secrets detection, container/Kubernetes/IaC security, OWASP & CIS compliance checks, threat modeling, CVSS risk scoring, remediation guidance, retesting, and professional security report generation. Triggers on requests to audit, pentest, scan, or assess the security of code, APIs, services, or infrastructure.
---

# Security Audit Pro

An end-to-end workflow for assessing the security of an application, API, or
infrastructure and producing an evidence-based, professional report. This skill
ORCHESTRATES real security tools and interprets their output — it does not
invent vulnerabilities, CVEs, or scores.

**Reference files** (read the relevant one when you reach that phase):
- `references/tooling.md` — tool matrix per phase, install notes, language/stack-specific tools (Java/Spring, K8s, SQL Server, Kafka, Redis).
- `references/cvss-and-risk.md` — CVSS scoring, severity bands, EPSS/environmental adjustment, prioritization.
- `references/report-template.md` — the full report skeleton to fill in.
- `references/compliance-mapping.md` — OWASP, CIS, CWE, PDPA/GDPR/PCI mapping guidance.

---

## 0. Authorization & Scope — REQUIRED before any testing

Do NOT begin active testing until these are confirmed. If anything is unclear, STOP and ask.

- **Ownership / authorization**: Confirm the user owns the target or has written permission to test it. Never scan or attack third-party systems without authorization.
- **Scope**: List in-scope targets (hosts, URLs, repos, images, clusters) and explicitly out-of-scope items.
- **Environment**: staging vs production. Prefer staging for intrusive tests.
- **Rules of engagement**: allowed test types, time windows, rate limits.
- **Destructive tests** (fuzzing that writes data, DoS-style, exploitation beyond proof): default = NOT allowed unless the user explicitly approves in writing.

Record these in the report's "Scope & Rules of Engagement" section.

---

## Operating principles (apply to every phase)

1. **Ground every finding in real evidence** — tool output, a request/response pair, a code location (file:line), or a config excerpt. Never fabricate vulnerabilities, CVE IDs, or CVSS vectors.
2. **Prefer real tools over opinion.** If a tool isn't installed/available, say so and mark the check `NOT RUN` rather than guessing. Note each tool + version used.
3. **Every finding must include**: evidence, reproduction steps, impact, affected asset, and concrete remediation.
4. **Triage, don't dump.** Validate scanner output; mark and separate likely false positives. Assign a confidence level (Confirmed / Likely / Needs-verification).
5. **Prioritize by real risk**, not raw scanner severity: CVSS base + exploitability/EPSS + exposure (internet-facing?) + business/data impact.
6. State assumptions and coverage limits explicitly so the reader knows what was and wasn't tested.

---

## Assessment phases

Run the phases relevant to the target; skip or mark N/A for the rest.
See `references/tooling.md` for the concrete tool to use in each phase.

### 1. Recon & Asset Inventory
Map the attack surface: domains/subdomains, exposed ports/services, endpoints, repos, container images, cloud resources. Output: asset list + exposure (internet-facing vs internal).

### 2. SAST — Static code analysis
Analyze source for injection, insecure deserialization, path traversal, XXE, weak crypto, hardcoded logic flaws. Output: findings with file:line + CWE mapping.

### 3. SCA — Dependencies & supply chain
Scan third-party libraries for known CVEs; flag outdated/abandoned packages and license risks. Critical for Java/Spring (Log4Shell, Spring4Shell class of issues). Output: vulnerable package, installed vs fixed version, CVE, reachable?

### 4. Secrets scanning
Detect hardcoded credentials, API keys, tokens, private keys in code, **full git history**, and config.

### 5. Web Application Testing — OWASP Top 10
Injection (SQLi/NoSQLi/command), XSS, SSRF, access control (IDOR), misconfig, auth flaws, insecure deserialization, security headers, CSRF, open redirect, file upload. Include TLS/header review (HSTS, CSP, cookie flags).

### 6. API Security — OWASP API Security Top 10
Separate from web Top 10: BOLA/object-level auth, broken authentication, broken object property-level auth / mass assignment, resource consumption/rate limiting, function-level auth, SSRF, security misconfig, improper inventory, unsafe third-party consumption. If behind an API gateway (e.g. Kong), verify gateway auth/rate-limit/route policies are actually enforced.

### 7. Authentication & Authorization
Session management, password/MFA policy, JWT handling (alg confusion, weak secret, missing exp/aud), OAuth2/OIDC flow correctness, role/permission matrix, privilege escalation (horizontal & vertical).

### 8. Infrastructure, Container & Kubernetes
Image scanning (OS + app CVEs), Dockerfile hygiene (root user, pinned base, no secrets), K8s posture (RBAC, privileged pods, network policies, secrets handling, admission control).

### 9. IaC & Configuration Hardening
Scan Terraform/Helm/K8s YAML/CloudFormation for insecure defaults; verify hardening against CIS Benchmarks for the actual stack (DB, cache, message broker, OS, cloud).

### 10. Data Security & Privacy
Encryption at rest and in transit, key management, PII identification and data-flow mapping, data retention, logging of sensitive data. Map to applicable regimes (PDPA/GDPR/PCI) — see `references/compliance-mapping.md`.

### 11. Threat Modeling (design-level)
Build a data-flow diagram and apply STRIDE (Spoofing, Tampering, Repudiation, Information disclosure, DoS, Elevation of privilege) to surface risks scanners miss.

### 12. Detection & Logging Coverage
Verify audit logging of security-relevant events, log integrity, alerting/SIEM coverage, and that monitoring would actually detect the attacks found above.

---

## 13. Risk Assessment & CVSS scoring
Score each finding with CVSS (show the **vector string**, not just the number), adjusted for environment and exploit likelihood. See `references/cvss-and-risk.md` for bands and method. If a score is uncertain, label it an estimate and explain the driving metrics.

## 14. Remediation guidance
For each finding: root cause, a specific fix (code/config/patch version), a secure example where helpful, and effort/priority. Group into a roadmap (Now / Next / Later).

## 15. Retest / verification
After fixes, re-run the relevant checks. Mark each finding Open / Fixed / Risk-accepted / False-positive, with re-test evidence. Keep the original finding ID for traceability.

## 16. Reporting
Fill in `references/report-template.md` and deliver as a Markdown document (offer to publish it as a shareable page/artifact or export to PDF/Word). **Redact secrets and real PII** in evidence; keep PoCs at proof-of-concept level, not weaponized exploits.

---

## Guardrails recap
- No testing without authorization and scope.
- Never fabricate findings, CVEs, or scores — evidence-based only.
- Non-destructive by default; destructive tests need explicit sign-off.
- Separate confirmed findings from unverified/false positives.
- Map findings to the **current published edition** of OWASP/CIS standards.
