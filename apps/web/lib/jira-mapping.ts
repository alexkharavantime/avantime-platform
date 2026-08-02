import { getPrisma } from '@avantime/database';
import type { Prisma } from '@prisma/client';

const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,49}$/u;
const ISSUE_TYPE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,99}$/u;
const OPTIONAL_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/u;
const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u;

export type JiraMappingInput = {
  companyId: string;
  projectKey: string;
  issueType?: string | null;
  componentId?: string | null;
  requestType?: string | null;
  enabled: boolean;
  actorId: string;
  correlationId: string;
};

function optionalReference(value: string | null | undefined, name: string) {
  const normalized = value?.trim() || null;
  if (normalized && !OPTIONAL_REFERENCE.test(normalized)) {
    throw new Error(`JIRA_MAPPING_${name}_INVALID`);
  }
  return normalized;
}

export function validateJiraMapping(input: JiraMappingInput) {
  if (!SAFE_REFERENCE.test(input.companyId)) throw new Error('JIRA_MAPPING_COMPANY_INVALID');
  if (!SAFE_REFERENCE.test(input.actorId)) throw new Error('JIRA_MAPPING_ACTOR_INVALID');
  if (!SAFE_REFERENCE.test(input.correlationId)) {
    throw new Error('JIRA_MAPPING_CORRELATION_INVALID');
  }
  const projectKey = input.projectKey.trim();
  if (!PROJECT_KEY.test(projectKey)) throw new Error('JIRA_MAPPING_PROJECT_INVALID');
  const issueType = input.issueType?.trim() || null;
  if (issueType && !ISSUE_TYPE.test(issueType)) throw new Error('JIRA_MAPPING_ISSUE_TYPE_INVALID');
  return {
    ...input,
    projectKey,
    issueType,
    componentId: optionalReference(input.componentId, 'COMPONENT'),
    requestType: optionalReference(input.requestType, 'REQUEST_TYPE'),
  };
}

export async function getJiraMappingForOrganization(companyId: string) {
  if (!SAFE_REFERENCE.test(companyId)) throw new Error('JIRA_MAPPING_COMPANY_INVALID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_MAPPING_DATABASE_UNAVAILABLE');
  return prisma.jiraOrganizationMapping.findUnique({ where: { companyId } });
}

export async function upsertJiraOrganizationMapping(input: JiraMappingInput) {
  const validated = validateJiraMapping(input);
  const prisma = await getPrisma();
  if (!prisma) throw new Error('JIRA_MAPPING_DATABASE_UNAVAILABLE');
  return prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const previous = await transaction.jiraOrganizationMapping.findUnique({
      where: { companyId: validated.companyId },
    });
    const mapping = await transaction.jiraOrganizationMapping.upsert({
      where: { companyId: validated.companyId },
      create: {
        companyId: validated.companyId,
        projectKey: validated.projectKey,
        issueType: validated.issueType,
        componentId: validated.componentId,
        requestType: validated.requestType,
        enabled: validated.enabled,
      },
      update: {
        projectKey: validated.projectKey,
        issueType: validated.issueType,
        componentId: validated.componentId,
        requestType: validated.requestType,
        enabled: validated.enabled,
        version: { increment: 1 },
      },
    });
    await transaction.productionAuditEvent.create({
      data: {
        companyId: validated.companyId,
        actorId: validated.actorId,
        action: 'jira.mapping.updated',
        targetType: 'jira_mapping',
        targetId: mapping.id,
        result: 'SUCCEEDED',
        correlationId: validated.correlationId,
        safeMetadata: {
          enabled: mapping.enabled,
          projectKey: mapping.projectKey,
          version: mapping.version,
        },
        previousState: previous
          ? {
              enabled: previous.enabled,
              projectKey: previous.projectKey,
              version: previous.version,
            }
          : {},
        newState: {
          enabled: mapping.enabled,
          projectKey: mapping.projectKey,
          version: mapping.version,
        },
      },
    });
    return mapping;
  });
}
