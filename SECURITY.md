# Security Policy

## Supported Versions

Only the latest published version of Stratal receives security updates. The project is pre-1.0 and does not maintain long-term support branches.

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| < Latest | No       |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Please report vulnerabilities through [GitHub Private Vulnerability Reporting](https://github.com/strataljs/stratal/security/advisories/new). This keeps the report confidential until a fix is available.

To file a report:

1. Go to the **Security** tab of the repository
2. Click **Report a vulnerability**
3. Provide a description of the vulnerability, steps to reproduce, and any relevant context

## What to Report

**In scope:**

- Vulnerabilities in the Stratal framework code
- Security issues in direct dependencies used by Stratal
- Authentication, authorization, or injection flaws in framework-provided utilities

**Out of scope:**

- Application-level misconfigurations by end users
- Vulnerabilities in optional peer dependencies not bundled by Stratal
- Issues that require physical access or social engineering

## Disclosure Process

1. **Acknowledgement** — We will acknowledge receipt of your report within 48 hours
2. **Assessment** — We will evaluate the report and determine severity
3. **Fix** — We target a fix within 90 days of acknowledgement, depending on complexity
4. **Release** — A patched version will be published via npm with an accompanying changelog entry
5. **Disclosure** — We follow coordinated disclosure; the vulnerability details will be made public after the fix is released

## Credit

Reporters will be credited in the release notes for the patched version unless they request otherwise.
