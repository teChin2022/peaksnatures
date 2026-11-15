# Security Assessment Report — <Target name>

**Classification:** Confidential
**Prepared for:** <org / owner>
**Assessment dates:** <start> – <end>
**Assessor:** <name / team>
**Report version:** <x.y>

---

## 1. Executive summary
Plain-language overview for non-technical readers:
- Overall risk posture (e.g. High — immediate action required).
- Finding counts: **Critical X · High X · Medium X · Low X · Info X**.
- Top 3–5 risks in one line each.
- Overall verdict / recommendation.

## 2. Scope & rules of engagement
- In-scope targets (hosts, URLs, repos, images, clusters).
- Out-of-scope items.
- Environment (staging/production), authorization reference.
- Test windows, constraints, and **limitations / coverage gaps**.
- Tools used (+ versions).

## 3. Methodology
Phases executed and standards referenced (OWASP Top 10 / API Top 10, OWASP ASVS, CIS Benchmarks, CWE, CVSS, EPSS).

## 4. Findings summary
| ID | Title | Severity | CVSS | Affected asset | Status |
|----|-------|----------|------|----------------|--------|
| F-001 | | Critical | 9.1 | | Open |
| F-002 | | High | 7.5 | | Open |

## 5. Detailed findings

### F-001 — <Title>
- **Severity:** Critical — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` (9.8)
- **Confidence:** Confirmed / Likely / Needs-verification
- **Affected asset / location:** <host, endpoint, file:line, image>
- **CWE / OWASP:** CWE-XXX / A0X:YYYY
- **Description & root cause:** …
- **Evidence:** (sanitized request/response, code excerpt, or tool output — redact secrets/PII)
```
<evidence>
```
- **Reproduction steps:**
  1. …
  2. …
- **Impact:** technical + business.
- **Remediation:** specific fix (code/config/patch version), with secure example if helpful.
- **References:** CVE / vendor advisory / OWASP / CWE links.
- **Status:** Open / Fixed / Risk-accepted / False-positive (+ retest evidence).

*(repeat per finding)*

## 6. Remediation roadmap
| Priority | Findings | Owner | Target date |
|----------|----------|-------|-------------|
| Now | F-001, F-003 | | |
| Next | F-002 | | |
| Later | F-00x | | |

## 7. Appendix
- Full tool outputs (attached separately).
- Compliance mapping tables (see compliance-mapping.md).
- Asset inventory.
- Glossary.
