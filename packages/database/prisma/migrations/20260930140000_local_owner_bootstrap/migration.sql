-- The guarded local-only first-owner ceremony records its execution environment.
ALTER TABLE "PlatformOwnerBootstrap"
  DROP CONSTRAINT "PlatformOwnerBootstrap_environment_check",
  ADD CONSTRAINT "PlatformOwnerBootstrap_environment_check"
    CHECK ("environment" IN ('integration', 'staging', 'local'));
