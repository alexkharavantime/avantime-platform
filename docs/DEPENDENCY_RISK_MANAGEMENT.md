# Dependency risk management

`governance dependency report` runs full official `npm audit --json`, parses exact
package nodes and fails on critical or unclassified moderate/high findings. Risk acceptance is a
reviewed JSON policy with ID, packages, exposure, controls, owner, expiry and remediation trigger.
Expired, malformed or duplicate acceptance fails. The existing critical CI audit gate is unchanged.

TASK-014 applied only a compatible lock refresh: `brace-expansion 1.1.16 -> 1.1.18` within the
parent's `1.x` range. This removes GHSA-mh99-v99m-4gvg without force, override or major update.
The remaining nested `next 15.5.21 -> postcss 8.4.31` build path and optional
`next -> sharp 0.34.5` unused image path cannot be safely fixed by npm's proposed Next `9.3.3`
downgrade. Build risk `AR-DEP-2026-002` and runtime-unreachable optional image risk
`AR-DEP-2026-003` expire on 2026-08-12 and are invalidated earlier by an upstream compatible fix or
introduction of untrusted CSS/source-map/image processing.

Raw current evidence is
[`npm-audit-2026-08-02.json`](./security/npm-audit-2026-08-02.json); policy is
[`dependency-risk-acceptances.json`](./security/dependency-risk-acceptances.json). Do not use
`npm audit fix --force`, suppress advisories, weaken CI severity or treat an aggregate package as a
separate reachable vulnerability without tracing its dependency path.
