group "default" {
  targets = [
    "web",
    "document-worker",
    "embedding-worker",
    "migration",
    "operations",
    "ocr-integration",
  ]
}

target "production" {
  context    = "."
  dockerfile = "docker/production.Dockerfile"
}

target "web" {
  inherits = ["production"]
  target   = "web"
  tags     = ["avantime-web:task-006-staging"]
}

target "document-worker" {
  inherits = ["production"]
  target   = "document-worker"
  tags     = ["avantime-document-worker:task-006-staging"]
}

target "embedding-worker" {
  inherits = ["production"]
  target   = "embedding-worker"
  tags     = ["avantime-embedding-worker:task-006-staging"]
}

target "migration" {
  inherits = ["production"]
  target   = "migration"
  tags     = ["avantime-migration:task-006-staging"]
}

target "operations" {
  inherits = ["production"]
  target   = "operations"
  tags     = ["avantime-operations:task-006-staging"]
}

target "ocr-integration" {
  context    = "."
  dockerfile = "docker/ocr-integration.Dockerfile"
  tags       = ["avantime-ocr-integration"]
}
