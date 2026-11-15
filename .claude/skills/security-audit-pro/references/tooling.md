# Tooling matrix

Open-source first. Pick what's installed; if a category has no tool available,
mark that phase `NOT RUN` in the report rather than guessing. Record tool + version.

| Phase | Primary tools | Notes |
|---|---|---|
| 1. Recon | `nmap`, `httpx`, `naabu`, `subfinder`/`amass`, `prowler`/`scoutsuite` (cloud) | Passive first on production. |
| 2. SAST | `semgrep`, SonarQube, CodeQL | Language-specific below. |
| 3. SCA | OWASP Dependency-Check, `trivy fs`, `grype`, `osv-scanner`, `pip-audit`, `npm audit`, Snyk | Scan lockfiles; check reachability before escalating severity. |
| 4. Secrets | `gitleaks`, `trufflehog`, `detect-secrets` | Scan full git history (`--since` all), not just HEAD. |
| 5. Web / DAST | OWASP ZAP, `nuclei`, Nikto, Burp Suite; `testssl.sh`, `sslscan` | Authenticated scans need valid session/token. |
| 6. API | Postman/Newman, `schemathesis` (OpenAPI), `nuclei`, custom authz-matrix scripts | Test with/without token and across roles. |
| 7. Auth | `jwt_tool`, manual OAuth2/OIDC flow review | Check alg=none, weak HS256 secret, missing exp/aud/iss. |
| 8. Container/K8s | `trivy image`, `grype`, `dockle`, `kube-bench`, `kubesec`, `kube-hunter` | kube-bench = CIS K8s benchmark. |
| 9. IaC / hardening | `checkov`, `tfsec`, `terrascan`, KICS, `lynis` (host) | Fail-on policy for CI gates. |
| 10. Data/privacy | manual review + data-flow mapping | Identify PII fields and crossings of trust boundaries. |
| 11. Threat model | STRIDE, OWASP Threat Dragon, `pytm` | Design-phase; needs architecture input. |
| 12. Detection | log/SIEM config review | Confirm security events are logged + alerted. |

## Language / stack-specific

**Java / Spring Boot**
- SAST: SpotBugs + Find-Security-Bugs, `semgrep --config p/java`, SonarQube.
- SCA: OWASP Dependency-Check (`--enableExperimental`), `trivy fs` on the repo, Maven `dependency:tree` to confirm transitive versions.
- Watch: deserialization (Jackson/`readObject`), SpEL injection, Spring Security misconfig (permitAll, disabled CSRF on stateful apps), actuator endpoints exposed, SSRF in `RestTemplate`/`WebClient`.

**Kong API Gateway**
- Verify auth plugins (key-auth/jwt/oauth2) are applied to every route, not just some.
- Check rate-limiting, request-size-limiting, and that upstream services aren't reachable directly (bypassing the gateway).

**SQL Server** — CIS SQL Server Benchmark: least-privilege logins, TDE/encryption, `sa` disabled/renamed, surface-area config, audit enabled.

**Redis** — require auth (`requirepass`/ACLs), bind to internal interface, disable/rename dangerous commands, TLS, no internet exposure.

**Kafka** — TLS + SASL auth, ACLs per topic, no PLAINTEXT listener on untrusted networks, ZooKeeper/KRaft access controls.

**Kubernetes** — RBAC least privilege, no privileged/hostPath pods, NetworkPolicies default-deny, secrets not in env/plain, admission control (OPA/Kyverno), image pull from trusted registry only.

## Suggested install (Debian/Ubuntu-ish)
```
# examples — adjust to your environment
pipx install semgrep checkov
brew install trivy grype gitleaks trufflehog nuclei testssl   # or distro packages
# OWASP Dependency-Check, ZAP, kube-bench: download from official releases
```
