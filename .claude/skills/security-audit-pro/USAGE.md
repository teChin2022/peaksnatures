# คู่มือการใช้งาน — Security Audit Pro

Skill สำหรับประเมินความปลอดภัย (security assessment) ของแอปพลิเคชัน, API และ
infrastructure แบบครบวงจร ตั้งแต่สแกนหาช่องโหว่ → ประเมินความเสี่ยง → ให้แนวทางแก้ →
retest → ออกรายงานระดับมืออาชีพ โดยเน้นทำงานร่วมกับ **เครื่องมือจริง** และทุก finding
ต้องมีหลักฐาน ไม่ใช่ให้ AI เดาเอง

---

## 1. Skill นี้ทำอะไรได้บ้าง

ครอบคลุม 16 phase:

| กลุ่ม | ครอบคลุม |
|---|---|
| Code & Supply chain | SAST (วิเคราะห์โค้ด), SCA (dependency/CVE), Secrets scanning |
| Runtime testing | Web pentest (OWASP Top 10), API security (API Top 10), Auth/Authz |
| Infra & Config | Container/Kubernetes, IaC, CIS hardening (SQL Server, Redis, Kafka, K8s) |
| Design & Data | Threat modeling (STRIDE), Data security & Privacy (PDPA/GDPR/PCI) |
| Operations | Detection/logging coverage, CVSS risk scoring, Remediation, Retest, Reporting |

---

## 2. การติดตั้ง

### กรณี claude.ai Project
1. แตก zip ให้ได้โฟลเดอร์ `security-audit-pro/`
2. อัปโหลดไฟล์ทั้งหมดเข้า **Knowledge ของ Project**
3. ไฟล์ `SKILL.md` คือไฟล์หลักที่ Claude อ่าน — มันจะดึงไฟล์ใน `references/` มาใช้เองตามขั้นตอน

### กรณี Claude Code
วางทั้งโฟลเดอร์ไว้ที่:
```
<project-root>/.claude/skills/security-audit-pro/
```
Claude Code จะโหลด skill จาก frontmatter (`name` + `description`) อัตโนมัติ

---

## 3. โครงสร้างไฟล์

```
security-audit-pro/
├── SKILL.md                  # workflow หลัก + guardrail (ไฟล์ที่ Claude อ่าน)
├── USAGE.md                  # คู่มือฉบับนี้ (สำหรับคนอ่าน)
└── references/
    ├── tooling.md            # เครื่องมือแต่ละ phase + stack-specific
    ├── cvss-and-risk.md      # วิธีให้คะแนน CVSS + จัดลำดับความเสี่ยง
    ├── report-template.md    # โครงรายงานพร้อมกรอก
    └── compliance-mapping.md # mapping OWASP/CIS/CWE/PDPA/GDPR/PCI
```

> `SKILL.md` เขียนเป็นภาษาอังกฤษ (ให้ Claude ทำงานแม่นและเข้ากับ ecosystem ของ tool)
> ส่วน `USAGE.md` นี้เป็นภาษาไทยสำหรับคุณอ่าน — Claude จะไม่ใช้ไฟล์นี้ตอนรัน

---

## 4. วิธีเรียกใช้ (trigger)

Skill จะทำงานเองเมื่อคุณพิมพ์คำขอที่เกี่ยวกับการ audit/pentest/scan ความปลอดภัย
ไม่ต้องเรียกชื่อ skill ตรง ๆ ก็ได้ แต่เรียกชื่อก็ชัดเจนกว่า

**ตัวอย่าง prompt:**
- "ช่วย audit security ของ repo นี้ให้หน่อย โฟกัส SAST + dependency"
- "ทำ API security assessment ให้ service ที่อยู่หลัง Kong gateway"
- "สแกน container image + ตรวจ K8s manifest ตาม CIS"
- "ประเมินความเสี่ยงช่องโหว่นี้เป็น CVSS แล้วจัดลำดับความสำคัญ"
- "ออกรายงาน security audit จากผลสแกนที่แนบมา"

---

## 5. ขั้นตอนการทำงานจริง (สำคัญ)

### ก่อนเริ่ม Claude จะถามเพื่อยืนยัน (Phase 0)
Skill ถูกออกแบบให้ **หยุดถาม authorization + scope ก่อนเสมอ** คุณควรเตรียม:
- ยืนยันว่าเป็นเจ้าของระบบ / มีสิทธิ์ทดสอบ
- ระบุ target ที่อยู่ใน scope และที่อยู่นอก scope
- environment: staging หรือ production (แนะนำ staging สำหรับ test ที่รุนแรง)
- การทดสอบแบบทำลายข้อมูล (destructive) — **default คือไม่ทำ** ต้องอนุมัติชัดเจน

### สิ่งที่ควรเตรียมให้ Claude
- **โค้ด/repo** — ถ้าให้ทำ SAST/SCA/secrets (แนบไฟล์หรือ path)
- **ผลสแกนจากเครื่องมือจริง** — เช่น output จาก Trivy, ZAP, Dependency-Check (JSON/text) ถ้าคุณรันเองแล้วอยากให้ Claude แปล/จัดลำดับ/ออกรายงาน
- **OpenAPI spec / Postman collection** — ถ้าทำ API testing
- **manifest / Dockerfile / Terraform** — ถ้าตรวจ infra/IaC

> **หมายเหตุสำคัญ:** Skill นี้ "orchestrate และแปลผล" เครื่องมือ ไม่ได้ยิงสแกนเองในเครื่องคุณโดยอัตโนมัติ
> ถ้าเครื่องมือยังไม่ได้รัน Claude จะบอกคำสั่งที่ต้องรัน หรือทำเครื่องหมาย `NOT RUN` แทนการเดา
> ดูรายการเครื่องมือได้ใน `references/tooling.md`

---

## 6. ตัวอย่าง use case: audit Spring Boot microservice

1. **คุณ:** "ช่วย audit security ของ order-service (Spring Boot) หลัง Kong gateway, staging, ผมเป็นเจ้าของระบบ"
2. **Claude:** ยืนยัน scope + rules of engagement
3. รัน/อ่านผล **SAST** (Find-Security-Bugs/Semgrep) + **SCA** (Dependency-Check) + **secrets** (gitleaks)
4. ตรวจ **API Top 10** (BOLA, broken auth, mass assignment) + ตรวจว่า Kong บังคับ auth/rate-limit ทุก route
5. ตรวจ **container image** (Trivy) + **K8s manifest** (kubesec/kube-bench)
6. ให้คะแนน **CVSS** + จัดลำดับ Now/Next/Later
7. ออก **รายงาน** ตาม `report-template.md` พร้อม map เข้า OWASP/CWE/PDPA

---

## 7. ผลลัพธ์ที่ได้ (รายงาน)

รายงานจะมีโครงตาม `references/report-template.md`:
- Executive summary (นับ finding ตาม severity + top risks)
- Scope & rules of engagement
- Methodology
- ตารางสรุป findings
- รายละเอียดแต่ละ finding (evidence + reproduction + impact + remediation + CVSS vector)
- Remediation roadmap (Now / Next / Later)
- Appendix + compliance mapping

สั่งให้ออกเป็น Markdown, เผยแพร่เป็นหน้าแชร์ได้ หรือ export เป็น PDF/Word ได้

---

## 8. การปรับแต่ง skill

- **เพิ่ม/เปลี่ยนเครื่องมือ** → แก้ตารางใน `references/tooling.md`
- **ปรับโครงรายงาน** (เช่น ใส่โลโก้/หัวข้อบริษัท) → แก้ `references/report-template.md`
- **เพิ่มมาตรฐาน compliance** (เช่น ISO 27001 ละเอียด) → แก้ `references/compliance-mapping.md`
- **เปลี่ยนเกณฑ์ severity / การจัดลำดับ** → แก้ `references/cvss-and-risk.md`
- **ปรับ trigger** ให้เรียกแม่นขึ้น → แก้บรรทัด `description` ใน frontmatter ของ `SKILL.md`

---

## 9. ข้อควรระวัง (guardrails ที่ฝังไว้)

- ❌ ไม่ทดสอบระบบที่ไม่มีสิทธิ์ / ของบุคคลที่สาม
- ❌ ไม่ fabricate ช่องโหว่ / CVE / คะแนน CVSS — ต้องมีหลักฐาน
- ⚠️ default เป็น **non-destructive** การทดสอบที่รุนแรงต้องขออนุมัติ
- ✅ แยก finding ที่ confirmed ออกจากที่ยังไม่ยืนยัน/false positive
- ⚠️ ในรายงานต้อง **redact ความลับและ PII จริง** และเก็บ PoC แค่ระดับพิสูจน์ ไม่ทำ exploit พร้อมใช้โจมตี
- 📌 คำแนะนำด้าน compliance เป็นข้อเท็จจริงเชิงเทคนิค ไม่ใช่คำปรึกษากฎหมาย — ควรให้ฝ่าย legal/compliance ยืนยันภาระผูกพันจริง

---

## 10. FAQ

**Q: Claude ยิงสแกนให้เองเลยไหม?**
A: ขึ้นกับสภาพแวดล้อม ถ้า session มี tool/terminal ที่รันได้ก็รันได้ แต่โดยหลัก skill เน้น "orchestrate + แปลผล" ที่ปลอดภัยและพึ่งพาเครื่องมือจริง ถ้ารันไม่ได้จะบอกคำสั่งให้คุณรันเอง

**Q: ต้องติดตั้งเครื่องมือทั้งหมดไหม?**
A: ไม่ ใช้เท่าที่มี เครื่องมือไหนไม่มี skill จะทำเครื่องหมาย `NOT RUN` ให้ ไม่เดาผล

**Q: ใช้กับภาษาอื่นนอกจาก Java ได้ไหม?**
A: ได้ workflow เป็น general-purpose มีเครื่องมือสำหรับ Python/JS/Go ใน `tooling.md` ด้วย ส่วน Java/Spring, Kong, K8s, SQL Server, Kafka, Redis มี note เฉพาะทางให้แล้ว

**Q: รายงานภาษาไทยได้ไหม?**
A: ได้ บอก Claude ว่าต้องการรายงานเป็นภาษาไทย โครง template ใช้ร่วมกันได้
