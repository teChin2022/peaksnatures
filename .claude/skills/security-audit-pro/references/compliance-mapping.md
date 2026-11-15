# Compliance & standards mapping

Map each finding to the **current published edition** of these standards (don't
hardcode a year — check the latest when you run the assessment).

## OWASP Top 10 (Web)
Classic categories to map against: Broken Access Control, Cryptographic Failures,
Injection, Insecure Design, Security Misconfiguration, Vulnerable & Outdated
Components, Identification & Authentication Failures, Software & Data Integrity
Failures, Security Logging & Monitoring Failures, SSRF. Confirm the current
edition's exact list and ordering.

## OWASP API Security Top 10
Distinct from Web. Core themes: Broken Object Level Authorization (BOLA),
Broken Authentication, Broken Object Property Level Authorization,
Unrestricted Resource Consumption, Broken Function Level Authorization,
Unrestricted Access to Sensitive Business Flows, SSRF, Security Misconfiguration,
Improper Inventory Management, Unsafe Consumption of APIs.

## Other frameworks
- **OWASP ASVS** — use verification levels (L1/L2/L3) to set assessment depth.
- **CWE** — classify the underlying weakness of each finding.
- **CIS Benchmarks** — host/OS, Docker, Kubernetes, SQL Server, cloud hardening baselines.
- **NIST** — 800-53 controls / CSF functions for program-level mapping.

## Privacy / regulatory (include only if applicable to the data handled)
- **PDPA (Thailand)** — lawful basis, consent, data subject rights, breach notification, cross-border transfer, security measures for personal data. Relevant whenever the app stores/processes personal data of individuals in Thailand.
- **GDPR (EU)** — similar structure; applies to EU data subjects.
- **PCI-DSS** — only if cardholder data is stored/processed/transmitted; focus on network segmentation, encryption, access control, logging.
- **ISO/IEC 27001** — ISMS control mapping (Annex A) for organizational context.

## How to present
Add a mapping table in the report appendix:

| Finding | CWE | OWASP (Web/API) | CIS | Privacy/Reg |
|---------|-----|-----------------|-----|-------------|
| F-001 | CWE-89 | A03 Injection | — | PDPA (personal data exposure) |

Keep regulatory statements factual (what the gap is), not legal advice; recommend
the client confirm obligations with their compliance/legal function.
