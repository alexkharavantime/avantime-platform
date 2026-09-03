# Dependency risk management

`governance dependency report` runs full official `npm audit --json`, parses exact
package nodes and fails on critical or unclassified moderate/high findings. Risk acceptance is a
reviewed JSON policy with ID, packages, exposure, controls, owner, expiry and remediation trigger.
Expired, malformed or duplicate acceptance fails. The existing critical CI audit gate is unchanged.

On 2026-09-03 a compatible refresh resolved the previously accepted Next/PostCSS, Sharp, js-yaml
and Nano ID findings. The authoritative `npm audit --omit=optional` result is now
`0 vulnerabilities`, and [`dependency-risk-acceptances.json`](./security/dependency-risk-acceptances.json)
contains no active acceptances. No `npm audit fix --force` or framework downgrade was used.

The 2026-08-02 TASK-014 record remains historical evidence: it applied a compatible
`brace-expansion 1.1.16 -> 1.1.18` refresh and temporarily classified the remaining nested
`next 15.5.21 -> postcss 8.4.31` and optional `next -> sharp 0.34.5` paths under
`AR-DEP-2026-002` and `AR-DEP-2026-003`. Those paths are no longer present in the current lockfile.

Historical raw evidence is
[`npm-audit-2026-08-02.json`](./security/npm-audit-2026-08-02.json); policy is
[`dependency-risk-acceptances.json`](./security/dependency-risk-acceptances.json). Do not use
`npm audit fix --force`, suppress advisories, weaken CI severity or treat an aggregate package as a
separate reachable vulnerability without tracing its dependency path.
