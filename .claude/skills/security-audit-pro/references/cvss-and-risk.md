# CVSS scoring & risk prioritization

## Always show the vector, not just a number
Record the full CVSS vector string so the score is reproducible, e.g.:
`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N` → 9.1 (Critical)

Use CVSS v3.1 or v4.0 consistently within one report.

## Severity bands
| Band | Score |
|---|---|
| Critical | 9.0 – 10.0 |
| High | 7.0 – 8.9 |
| Medium | 4.0 – 6.9 |
| Low | 0.1 – 3.9 |
| Informational | 0.0 (no direct security impact) |

## Base metrics quick reference
- **AV** Attack Vector: Network / Adjacent / Local / Physical
- **AC** Attack Complexity: Low / High
- **PR** Privileges Required: None / Low / High
- **UI** User Interaction: None / Required
- **S** Scope: Unchanged / Changed
- **C/I/A** Confidentiality / Integrity / Availability impact: None / Low / High

## Adjust to reality (don't stop at base score)
1. **Exploitability (temporal / EPSS)** — is there a known public exploit? What's the EPSS probability? A base-High with an active exploit and internet exposure is effectively Critical in priority.
2. **Environmental** — exposure (internet-facing vs internal-only), data sensitivity (PII/PCI), and existing compensating controls (WAF, network segmentation, MFA).
3. **Business impact** — what breaks for the business if exploited (data breach, downtime, fraud, compliance penalty).

## Prioritization output
Rank findings by **priority**, which may differ from raw CVSS:
`Priority = base severity × exploit likelihood × exposure × data/business impact`

Group into a remediation roadmap:
- **Now** — Critical/High that is exploitable and exposed.
- **Next** — Medium, or High that is mitigated/internal.
- **Later** — Low / hardening / defense-in-depth.

## Honesty rule
If you cannot justify a precise score from the metrics, present it as an
estimate and state the driving metrics. Never present a false-precision number.
